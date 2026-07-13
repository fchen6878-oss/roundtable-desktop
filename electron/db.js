'use strict';

// 本地存储层：SQLite（sql.js WASM 版，纯 JS 零原生编译，无需 Visual Studio / 不挑 Node 版本）
// 数据库持久化为文件：<userData>/roundtable.db
const path = require('path');
const fs = require('fs');
const { app, safeStorage } = require('electron');
const initSqlJs = require('sql.js');

let SQL = null;       // sql.js 模块
let db = null;        // 当前 Database 实例
let initPromise = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT,
    topic TEXT,
    scene TEXT,
    mode TEXT,
    director_notes TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT,
    seq INTEGER,
    kind TEXT,
    role_id TEXT,
    name TEXT,
    title TEXT,
    avatar TEXT,
    model TEXT,
    stance TEXT,
    phase TEXT,
    text TEXT,
    extra TEXT,
    ts INTEGER
  );
  CREATE TABLE IF NOT EXISTS providers (
    key TEXT PRIMARY KEY,
    name TEXT,
    protocol TEXT,
    base_url TEXT,
    default_model TEXT,
    api_key_enc TEXT,
    temperature REAL,
    updated_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_messages_meeting ON messages(meeting_id, seq);
`;

function userDbPath() {
  return path.join(app.getPath('userData'), 'roundtable.db');
}

// 解析 sql-wasm.wasm 位置：开发态读 node_modules，打包后读 extraResources 或 asar 内同名文件
function resolveWasm() {
  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'sql-wasm.wasm'));
    candidates.push(path.join(process.resourcesPath, 'app', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
  }
  candidates.push(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'));
  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function persist() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(userDbPath(), Buffer.from(data));
  } catch (e) {
    // 写入失败不致命，下次变更重试
  }
}

// 执行写操作并落盘
function run(sql, params) {
  if (!db) throw new Error('db not initialized');
  db.run(sql, params || []);
  persist();
}

// 查询多行（参数可选）
function all(sql, params) {
  if (!db) throw new Error('db not initialized');
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    if (params) stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
  } finally {
    stmt.free();
  }
  return rows;
}

function get(sql, params) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : undefined;
}

async function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!SQL) SQL = await initSqlJs({ locateFile: () => resolveWasm() });
    const f = userDbPath();
    if (fs.existsSync(f)) {
      const bytes = new Uint8Array(fs.readFileSync(f));
      db = new SQL.Database(bytes);
    } else {
      db = new SQL.Database();
      db.exec(SCHEMA);
      persist();
    }
    return db;
  })();
  return initPromise;
}

// ---------- 密钥加解密（safeStorage 基于 OS：Windows DPAPI / macOS Keychain） ----------
function enc(str) {
  if (str == null || str === '') return '';
  if (!safeStorage.isEncryptionAvailable()) return 'PLAINTEXT:' + str; // 极端降级，不推荐长期使用
  return safeStorage.encryptString(String(str)).toString('base64');
}
function dec(b64) {
  if (!b64) return '';
  if (typeof b64 === 'string' && b64.startsWith('PLAINTEXT:')) return b64.slice('PLAINTEXT:'.length);
  if (!safeStorage.isEncryptionAvailable()) return '';
  try { return safeStorage.decryptString(Buffer.from(b64, 'base64')); }
  catch (e) { return ''; }
}

function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- 会议记录 ----------
async function createMeeting(data) {
  await initDb();
  const id = genId('m_');
  const now = Date.now();
  run(
    'INSERT INTO meetings (id, title, topic, scene, mode, director_notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    [id, data.title || '', data.topic || '', data.scene || '', data.mode || '', data.directorNotes || '', now, now]
  );
  return id;
}

async function appendMessage(meetingId, msg) {
  await initDb();
  if (!meetingId || !msg) return;
  const row = get('SELECT COALESCE(MAX(seq),0)+1 AS n FROM messages WHERE meeting_id=?', [meetingId]);
  const seq = row ? row.n : 1;
  const extra = {};
  ['director', 'probe', 'refocus', 'action', 'speaker', 'replyTo', 'vote', 'fallback', 'lean'].forEach(function (k) {
    if (msg[k] !== undefined) extra[k] = msg[k];
  });
  run(
    'INSERT INTO messages (meeting_id, seq, kind, role_id, name, title, avatar, model, stance, phase, text, extra, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [meetingId, seq, msg.kind || '', msg.roleId || '', msg.name || '', msg.title || '', msg.avatar || '',
      msg.model || '', msg.stance || '', msg.phase || '', msg.text || '', JSON.stringify(extra), msg.ts || Date.now()]
  );
}

async function listMeetings() {
  await initDb();
  return all(
    'SELECT m.id, m.title, m.topic, m.scene, m.mode, m.created_at, m.updated_at, ' +
    '(SELECT COUNT(*) FROM messages WHERE meeting_id=m.id) AS msg_count ' +
    'FROM meetings m ORDER BY m.created_at DESC'
  );
}

async function getMeeting(id) {
  await initDb();
  const rows = all('SELECT * FROM messages WHERE meeting_id=? ORDER BY seq', [id]);
  return rows.map(function (r) {
    const m = {
      kind: r.kind, roleId: r.role_id, name: r.name, title: r.title, avatar: r.avatar,
      model: r.model, stance: r.stance, phase: r.phase, text: r.text, ts: r.ts
    };
    try { Object.assign(m, JSON.parse(r.extra || '{}')); } catch (_) {}
    return m;
  });
}

async function deleteMeeting(id) {
  await initDb();
  run('DELETE FROM messages WHERE meeting_id=?', [id]);
  run('DELETE FROM meetings WHERE id=?', [id]);
}

async function updateMeeting(id, patch) {
  await initDb();
  const sets = [];
  const vals = [];
  if (patch.title !== undefined) { sets.push('title=?'); vals.push(patch.title); }
  if (patch.directorNotes !== undefined) { sets.push('director_notes=?'); vals.push(patch.directorNotes); }
  sets.push('updated_at=?'); vals.push(Date.now());
  vals.push(id);
  run('UPDATE meetings SET ' + sets.join(',') + ' WHERE id=?', vals);
}

// ---------- 模型提供商（API Key 加密存储） ----------
async function listProviders() {
  await initDb();
  return all('SELECT key, name, protocol, base_url, default_model, temperature, updated_at FROM providers')
    .map(function (r) {
      return {
        key: r.key,
        name: r.name,
        protocol: r.protocol,
        baseUrl: r.base_url,
        defaultModel: r.default_model,
        temperature: r.temperature,
        apiKey: '' // 绝不返回明文
      };
    });
}

async function setProvider(key, cfg) {
  await initDb();
  const now = Date.now();
  const existing = get('SELECT api_key_enc FROM providers WHERE key=?', [key]);
  // 仅在传入非空明文时重新加密；否则沿用已有密文，避免"改动名字却清空真实密钥"
  const encKey = (cfg.apiKey && String(cfg.apiKey).length)
    ? enc(cfg.apiKey)
    : (existing ? existing.api_key_enc : '');
  if (existing) {
    run(
      'UPDATE providers SET name=?, protocol=?, base_url=?, default_model=?, api_key_enc=?, temperature=?, updated_at=? WHERE key=?',
      [cfg.name || '', cfg.protocol || 'openai', cfg.baseUrl || '', cfg.defaultModel || '',
        encKey, (typeof cfg.temperature === 'number' ? cfg.temperature : null), now, key]
    );
  } else {
    run(
      'INSERT INTO providers (key, name, protocol, base_url, default_model, api_key_enc, temperature, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [key, cfg.name || '', cfg.protocol || 'openai', cfg.baseUrl || '', cfg.defaultModel || '',
        encKey, (typeof cfg.temperature === 'number' ? cfg.temperature : null), now]
    );
  }
}

async function deleteProvider(key) {
  await initDb();
  run('DELETE FROM providers WHERE key=?', [key]);
}

async function getDecryptedKey(key) {
  await initDb();
  const row = get('SELECT api_key_enc FROM providers WHERE key=?', [key]);
  return row ? dec(row.api_key_enc) : '';
}

// 首次启动时把渲染层 localStorage 里的旧明文 providers 加密迁入主进程库
async function migrate(legacy) {
  if (!legacy || typeof legacy !== 'object') return;
  await initDb();
  Object.keys(legacy).forEach(function (k) {
    const v = legacy[k] || {};
    setProvider(k, {
      name: v.name, protocol: v.protocol, baseUrl: v.baseUrl, defaultModel: v.defaultModel,
      apiKey: v.apiKey || '', temperature: v.temperature
    });
  });
}

module.exports = {
  initDb: initDb,
  createMeeting: createMeeting,
  appendMessage: appendMessage,
  listMeetings: listMeetings,
  getMeeting: getMeeting,
  deleteMeeting: deleteMeeting,
  updateMeeting: updateMeeting,
  listProviders: listProviders,
  setProvider: setProvider,
  deleteProvider: deleteProvider,
  getDecryptedKey: getDecryptedKey,
  migrate: migrate
};
