'use strict';

// 本地存储层：SQLite（better-sqlite3）持久化会议记录，并用 electron safeStorage 加密 API Key。
// 数据库文件位于用户数据目录：<userData>/roundtable.db
const path = require('path');
const { app, safeStorage } = require('electron');

let Database = null;   // 延迟 require，避免语法检查/非 Electron 环境下加载失败
let db = null;

function userDbPath() {
  return path.join(app.getPath('userData'), 'roundtable.db');
}

function initDb() {
  if (db) return db;
  Database = require('better-sqlite3');
  db = new Database(userDbPath());
  db.pragma('journal_mode = WAL');
  db.exec(`
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
  `);
  return db;
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
function createMeeting(data) {
  initDb();
  const id = genId('m_');
  const now = Date.now();
  db.prepare(
    'INSERT INTO meetings (id, title, topic, scene, mode, director_notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(id, data.title || '', data.topic || '', data.scene || '', data.mode || '', data.directorNotes || '', now, now);
  return id;
}

function appendMessage(meetingId, msg) {
  if (!db) initDb();
  if (!meetingId || !msg) return;
  const seq = db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM messages WHERE meeting_id=?').get(meetingId).n;
  const extra = {};
  ['director', 'probe', 'refocus', 'action', 'speaker', 'replyTo', 'vote', 'fallback', 'lean'].forEach(function (k) {
    if (msg[k] !== undefined) extra[k] = msg[k];
  });
  db.prepare(
    'INSERT INTO messages (meeting_id, seq, kind, role_id, name, title, avatar, model, stance, phase, text, extra, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(
    meetingId, seq, msg.kind || '', msg.roleId || '', msg.name || '', msg.title || '', msg.avatar || '',
    msg.model || '', msg.stance || '', msg.phase || '', msg.text || '', JSON.stringify(extra), msg.ts || Date.now()
  );
}

function listMeetings() {
  if (!db) initDb();
  return db.prepare(
    'SELECT m.id, m.title, m.topic, m.scene, m.mode, m.created_at, m.updated_at, ' +
    '(SELECT COUNT(*) FROM messages WHERE meeting_id=m.id) AS msg_count ' +
    'FROM meetings m ORDER BY m.created_at DESC'
  ).all();
}

function getMeeting(id) {
  if (!db) initDb();
  const rows = db.prepare('SELECT * FROM messages WHERE meeting_id=? ORDER BY seq').all(id);
  return rows.map(function (r) {
    const m = {
      kind: r.kind, roleId: r.role_id, name: r.name, title: r.title, avatar: r.avatar,
      model: r.model, stance: r.stance, phase: r.phase, text: r.text, ts: r.ts
    };
    try { Object.assign(m, JSON.parse(r.extra || '{}')); } catch (_) {}
    return m;
  });
}

function deleteMeeting(id) {
  if (!db) initDb();
  db.prepare('DELETE FROM messages WHERE meeting_id=?').run(id);
  db.prepare('DELETE FROM meetings WHERE id=?').run(id);
}

function updateMeeting(id, patch) {
  if (!db) initDb();
  const sets = [];
  const vals = [];
  if (patch.title !== undefined) { sets.push('title=?'); vals.push(patch.title); }
  if (patch.directorNotes !== undefined) { sets.push('director_notes=?'); vals.push(patch.directorNotes); }
  sets.push('updated_at=?'); vals.push(Date.now());
  vals.push(id);
  db.prepare('UPDATE meetings SET ' + sets.join(',') + ' WHERE id=?').run(vals);
}

// ---------- 模型提供商（API Key 加密存储） ----------
function listProviders() {
  if (!db) initDb();
  return db.prepare('SELECT key, name, protocol, base_url, default_model, temperature, updated_at FROM providers')
    .all().map(function (r) {
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

function setProvider(key, cfg) {
  if (!db) initDb();
  const now = Date.now();
  const existing = db.prepare('SELECT api_key_enc FROM providers WHERE key=?').get(key);
  // 仅在传入非空明文时重新加密；否则沿用已有密文，避免"改动名字却清空真实密钥"
  const encKey = (cfg.apiKey && String(cfg.apiKey).length)
    ? enc(cfg.apiKey)
    : (existing ? existing.api_key_enc : '');
  if (existing) {
    db.prepare(
      'UPDATE providers SET name=?, protocol=?, base_url=?, default_model=?, api_key_enc=?, temperature=?, updated_at=? WHERE key=?'
    ).run(cfg.name || '', cfg.protocol || 'openai', cfg.baseUrl || '', cfg.defaultModel || '',
      encKey, (typeof cfg.temperature === 'number' ? cfg.temperature : null), now, key);
  } else {
    db.prepare(
      'INSERT INTO providers (key, name, protocol, base_url, default_model, api_key_enc, temperature, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(key, cfg.name || '', cfg.protocol || 'openai', cfg.baseUrl || '', cfg.defaultModel || '',
      encKey, (typeof cfg.temperature === 'number' ? cfg.temperature : null), now);
  }
}

function deleteProvider(key) {
  if (!db) initDb();
  db.prepare('DELETE FROM providers WHERE key=?').run(key);
}

function getDecryptedKey(key) {
  if (!db) initDb();
  const row = db.prepare('SELECT api_key_enc FROM providers WHERE key=?').get(key);
  return row ? dec(row.api_key_enc) : '';
}

// 首次启动时把渲染层 localStorage 里的旧明文 providers 加密迁入主进程库
function migrate(legacy) {
  if (!legacy || typeof legacy !== 'object') return;
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
