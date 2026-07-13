/*
 * ui.js — 圆桌会议前端：配置面板 + 实时群聊 + 导演指令 + 导出纪要 + 模型接入
 * 依赖全局：MeetingEngine（src/engine.js）、MockModel（src/mock.js）、ModelRouter（src/clients.js）
 */
(function () {
  'use strict';

  const STANCE = {
    pro: { label: '支持', color: '#0f9d6b' },
    con: { label: '反对', color: '#e0573e' },
    neutral: { label: '中立', color: '#b07d1a' }
  };
  const MODE_LABEL = {
    brainstorm: '头脑风暴', socratic: '苏格拉底诘问',
    debate: '多边辩论', decision: '模拟决策会'
  };
  const PHASE_LABEL = {
    opening: '开场', round1: '首轮陈述', debate: '讨论辩论', summary: '总结', done: '已结束'
  };
  const AVATARS = ['🛠️', '🚀', '🛡️', '💡', '🧠', '🎯', '🌟', '🔥', '🌈', '🤖', '📊', '🧭'];

  // 预设厂商（一键添加；添加后与自定义厂商无异，均可在卡片中改名 / 改协议 / 删除）
  const PRESETS = {
    openai:    { name: 'OpenAI',         protocol: 'openai',    baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
    anthropic: { name: 'Anthropic',      protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-20241022' },
    ollama:    { name: 'Ollama（本地）', protocol: 'ollama',    baseUrl: 'http://localhost:11434',     defaultModel: 'llama3' },
    zhipu:     { name: '智谱 AI',        protocol: 'openai',    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-plus' },
    deepseek:  { name: 'DeepSeek',       protocol: 'openai',    baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
    qwen:      { name: '通义千问',       protocol: 'openai',    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' },
    kimi:      { name: 'Kimi（Moonshot）', protocol: 'openai',  baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', temperature: 1, timeout: 90000, maxTokens: 8192 }
  };
  function protoTag(p) {
    return p === 'anthropic' ? 'Anthropic 兼容' : p === 'ollama' ? 'Ollama 本地' : 'OpenAI 兼容';
  }

  // 圆桌场景预设：选一个场景即自动带入契合的角色与示例议题，一键开聊。
  // 每个场景的角色「领域」字段都经过设计，能命中 mock.js 中对应的领域词库，发言更对味。
  const SCENES = {
    tech: {
      name: '技术决策', icon: 'tech',
      topic: '我们团队是否应该立刻全面转向 AI 辅助编程？',
      roles: [
        { name: '王刚', title: 'CTO', avatar: '🛠️', stance: 'con', personality: '保守', domain: '技术架构与可维护性' },
        { name: '李娜', title: '业务总监', avatar: '🚀', stance: 'pro', personality: '激进', domain: '业务增长与市场' },
        { name: '老周', title: '安全顾问', avatar: '🛡️', stance: 'con', personality: '理性', domain: '安全合规与数据' },
        { name: '小赵', title: '一线开发', avatar: '💡', stance: 'neutral', personality: '幽默', domain: '职业发展与团队' }
      ]
    },
    product: {
      name: '产品规划', icon: 'product',
      topic: '下一代产品应该优先做「易用性」还是「功能丰富度」？',
      roles: [
        { name: '林岚', title: '产品负责人', avatar: '🧭', stance: 'con', personality: '理性', domain: '产品设计与用户体验' },
        { name: '阿杰', title: '交互设计师', avatar: '🎨', stance: 'pro', personality: '温和', domain: '产品设计与用户体验' },
        { name: '大壮', title: '技术主管', avatar: '🛠️', stance: 'neutral', personality: '保守', domain: '技术架构与研发' },
        { name: '小鹿', title: '用户研究员', avatar: '🔍', stance: 'pro', personality: '温和', domain: '产品设计与用户体验' }
      ]
    },
    finance: {
      name: '投资理财', icon: 'finance',
      topic: '当前是否应该把更多资产配置到权益类（股票 / 基金）？',
      roles: [
        { name: '陈老师', title: '理财顾问', avatar: '🧠', stance: 'pro', personality: '理性', domain: '投资理财与资产配置' },
        { name: '老钱', title: '风控总监', avatar: '🛡️', stance: 'con', personality: '保守', domain: '投资理财与风险控制' },
        { name: '小满', title: '普通投资者', avatar: '💡', stance: 'neutral', personality: '幽默', domain: '投资理财与资产配置' },
        { name: '周教授', title: '经济学家', avatar: '📊', stance: 'pro', personality: '理性', domain: '宏观经济与金融' }
      ]
    },
    edu: {
      name: '教育成长', icon: 'edu',
      topic: '孩子升学应该优先冲名校，还是选更适合的学校？',
      roles: [
        { name: '王妈妈', title: '家长', avatar: '🌟', stance: 'pro', personality: '温和', domain: '家庭教育与升学' },
        { name: '张老师', title: '班主任', avatar: '🧑‍🏫', stance: 'con', personality: '理性', domain: '学校教育与升学' },
        { name: '李专家', title: '教育专家', avatar: '🧠', stance: 'neutral', personality: '理性', domain: '教育发展与心理' },
        { name: '元元', title: '初中生', avatar: '💡', stance: 'pro', personality: '幽默', domain: '青少年成长与教育' }
      ]
    },
    life: {
      name: '生活抉择', icon: 'life',
      topic: '毕业后是先去大城市闯一闯，还是回老家安稳发展？',
      roles: [
        { name: '小北', title: '北漂青年', avatar: '🚀', stance: 'pro', personality: '激进', domain: '职业发展与生活选择' },
        { name: '爸妈', title: '父母', avatar: '🌟', stance: 'con', personality: '温和', domain: '家庭与生活' },
        { name: '老周', title: '职场前辈', avatar: '🧭', stance: 'neutral', personality: '理性', domain: '职业发展与职场选择' },
        { name: '阿珍', title: '好友', avatar: '💡', stance: 'pro', personality: '幽默', domain: '生活与消费' }
      ]
    },
    relation: {
      name: '人际关系', icon: 'relation',
      topic: '亲密关系里，「给彼此空间」和「多陪伴」哪个更重要？',
      roles: [
        { name: '小雨', title: '伴侣A', avatar: '🌸', stance: 'con', personality: '温和', domain: '亲密关系与沟通' },
        { name: '阿成', title: '伴侣B', avatar: '🌟', stance: 'pro', personality: '理性', domain: '亲密关系与沟通' },
        { name: '苏老师', title: '心理咨询师', avatar: '🧠', stance: 'neutral', personality: '理性', domain: '心理与人际关系' },
        { name: '大鹏', title: '好友', avatar: '💡', stance: 'pro', personality: '幽默', domain: '生活与人际关系' }
      ]
    }
  };
  function applyScene(key) {
    const sc = SCENES[key];
    if (!sc) return;
    state.scene = key;
    state.topic = sc.topic;
    state.roles = sc.roles.map(r => Object.assign({ id: rid(), provider: 'mock' }, r));
    const tp = $('#topic'); if (tp) tp.value = sc.topic;
    renderRoles();
    document.querySelectorAll('.scene-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.scene === key);
    });
  }
  function renderScenes() {
    const wrap = $('#sceneChips');
    if (!wrap) return;
    wrap.innerHTML = '';
    Object.keys(SCENES).forEach(function (k) {
      const sc = SCENES[k];
      const chip = el('button', 'scene-chip' + (state.scene === k ? ' active' : ''));
      chip.dataset.scene = k;
      chip.innerHTML = '<span class="sc-icon has-ic ic-' + sc.icon + '"></span>' + sc.name;
      chip.addEventListener('click', () => applyScene(k));
      wrap.appendChild(chip);
    });
  }

  // 观点碰撞图 / 分支对比（纯逻辑模块，见 src/compare.js）
  const Compare = (typeof window !== 'undefined' && window.RoundtableCompare) || null;

  const LS = {
    prov: 'roundtable.providers.v1',
    mode: 'roundtable.realmode.v1',
    proxy: 'roundtable.proxy.v1'
  };
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // 是否运行在 Electron 主进程桥可用（window.api 存在）的环境中
  function hasApi() { return typeof window !== 'undefined' && !!window.api; }
  // 当前会议在数据库中的 id（仅桌面端落库时使用）
  let currentMeetingId = null;

  let state = {
    topic: '我们团队是否应该立刻全面转向 AI 辅助编程？',
    host: { name: '张总助', provider: 'mock' },
    scene: 'tech',
    mode: 'debate',
    discussionMode: 'free',   // 'free'（自由发挥，默认）| 'scripted'（制式辩论，手动指定态度）
    realMode: false,
    proxyEnabled: false,
    providers: {},
    roles: [
      { id: rid(), name: '王刚', title: 'CTO', avatar: '🛠️', stance: 'con',
        personality: '保守', domain: '技术架构与可维护性', provider: 'mock' },
      { id: rid(), name: '李娜', title: '业务总监', avatar: '🚀', stance: 'pro',
        personality: '激进', domain: '业务增长与市场', provider: 'mock' },
      { id: rid(), name: '老周', title: '安全顾问', avatar: '🛡️', stance: 'con',
        personality: '理性', domain: '安全合规与数据', provider: 'mock' },
      { id: rid(), name: '小赵', title: '一线开发', avatar: '💡', stance: 'neutral',
        personality: '幽默', domain: '职业发展与团队', provider: 'mock' }
    ]
  };

  let engine = null;
  let running = false;
  let branches = [];        // [{ id, label, engine, parentId, forkSnapId, director, done }]
  let activeBranch = null;
  let branchSeq = 0;
  let pendingSnap = null;   // 当前打开分支表单所针对的快照
  let compareSel = new Set(); // 对比浮层中勾选的分支 id 集合
  let viewingHistoryMeta = null; // 当前载入的历史会议元数据；导出纪要时优先取用，避免与当前会话 state 串味

  function rid() { return 'r' + Math.random().toString(36).slice(2, 8); }
  function $(s) { return document.querySelector(s); }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  // 是否运行在 Electron 桌面客户端中（用于隐藏仅网页版需要的"本地代理"开关）
  function isElectron() { return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent); }
  function opt(v, t, cur) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + t + '</option>'; }
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  // 动态生成"绑定模型"下拉：模拟 + 所有已配置厂商（含自定义）
  function providerOpts(cur) {
    const keys = ['mock'].concat(Object.keys(state.providers));
    return keys.map(function (k) {
      const t = k === 'mock' ? '模拟（无 key）' : (state.providers[k].name || k);
      return opt(k, t, cur);
    }).join('');
  }
  function providerName(key) {
    if (key === 'mock') return '模拟';
    const p = state.providers[key];
    return p ? (p.name || key) : key;
  }
  function defaultModel(p) {
    const cfg = state.providers[p];
    return (cfg && cfg.defaultModel) || (window.DEFAULT_MODELS && window.DEFAULT_MODELS[p]) || '';
  }
  function dispModel(r) {
    if (!r.provider || r.provider === 'mock') return '模拟';
    const m = defaultModel(r.provider);
    return providerName(r.provider) + (m ? ':' + m : '');
  }

  // ---------- 持久化 ----------
  function loadStore() {
    const saved = lsGet(LS.prov); if (saved && typeof saved === 'object') {
      Object.keys(saved).forEach(function (k) {
        const v = saved[k] || {};
        // 旧数据迁移：协议 / 名称缺失时按 key 推断（兼容曾经内置的 openai/anthropic/ollama）
        let protocol = v.protocol;
        if (!protocol) protocol = (k === 'openai' || k === 'anthropic' || k === 'ollama') ? k : 'openai';
        let name = v.name;
        if (!name) name = (k === 'openai') ? 'OpenAI' : (k === 'anthropic') ? 'Anthropic' :
          (k === 'ollama') ? 'Ollama（本地）' : '自定义模型';
        const entry = {
          name: name,
          protocol: protocol,
          apiKey: v.apiKey || '',
          baseUrl: v.baseUrl || '',
          defaultModel: v.defaultModel || ''
        };
        if (typeof v.temperature === 'number') entry.temperature = v.temperature;
        if (typeof v.timeout === 'number') entry.timeout = v.timeout;
        if (typeof v.maxTokens === 'number') entry.maxTokens = v.maxTokens;
        state.providers[k] = entry;
      });
    }
    // 注意：不再强制内置任何厂商，全部由用户在设置浮层中自行添加
    if (typeof lsGet(LS.mode) === 'boolean') state.realMode = lsGet(LS.mode);
    if (typeof lsGet(LS.proxy) === 'boolean') state.proxyEnabled = lsGet(LS.proxy);
  }
  function saveStore() {
    lsSet(LS.prov, state.providers); lsSet(LS.mode, state.realMode); lsSet(LS.proxy, state.proxyEnabled);
  }
  // 持久化单个提供商：桌面端走主进程加密存储；否则退回 localStorage（网页版/测试）
  function persistProvider(key) {
    if (hasApi()) {
      window.api.keys.setProvider(key, state.providers[key]).catch(function (e) { console.error('[Roundtable] setProvider failed', e); });
    } else {
      saveStore();
    }
  }
  // 桌面端：从主进程加载已加密的 providers（明文不进前端）
  async function loadProvidersFromMain() {
    if (!hasApi()) return;
    try {
      const list = await window.api.keys.listProviders();
      const map = {};
      list.forEach(function (p) { map[p.key] = p; });
      state.providers = map;
      if (!$('#settingsModal').classList.contains('hidden')) renderSettings();
      bindHostInputs();
      renderRoles(); // 异步加载完成后重渲染角色卡片，补全「绑定模型」下拉里的已有厂商
    } catch (e) { console.error('[Roundtable] loadProviders failed', e); }
  }
  // 桌面端启动会议 / 分支前，把主进程库里加密的 Key 解密注入到运行时 providers。
  // state.providers 中的 apiKey 始终为空（安全：明文不长期驻留渲染层），仅在调用瞬间注入；
  // 网页版（无 window.api）走 localStorage 回退，providers 自身已带明文，直接返回。
  async function buildRuntimeProviders() {
    if (!hasApi()) return state.providers;
    const out = {};
    const ks = Object.keys(state.providers);
    await Promise.all(ks.map(async function (k) {
      const p = state.providers[k];
      let ak = p.apiKey || '';
      if (!ak) { try { ak = await window.api.keys.getDecryptedKey(k); } catch (e) { ak = ''; } }
      out[k] = Object.assign({}, p, { apiKey: ak || '' });
    }));
    return out;
  }

  // 首次启动：把渲染层 localStorage 里的旧明文 providers 加密迁入主进程库，再清空 localStorage
  async function migrateLegacyProviders() {
    if (!hasApi()) return;
    const legacy = lsGet(LS.prov);
    if (legacy && typeof legacy === 'object' && Object.keys(legacy).length) {
      try { await window.api.keys.migrate(legacy); lsSet(LS.prov, {}); }
      catch (e) { console.error('[Roundtable] migrate failed', e); }
    }
  }

  // ---------- 配置面板渲染 ----------
  function renderRoles() {
    const list = $('#roleList');
    list.innerHTML = '';
    state.roles.forEach(r => {
      const card = el('div', 'role-card');
      card.dataset.id = r.id;
      const stanceHtml = state.discussionMode === 'scripted'
        ? '<select data-f="stance" class="rc-stance-sel">' +
            opt('pro', '支持', r.stance) + opt('con', '反对', r.stance) + opt('neutral', '中立', r.stance) + '</select>'
        : '<span class="rc-stance-tag"><span class="dot"></span>自由</span>';
      card.innerHTML =
        /* 第一行：头像 + 名字 + 头衔 + 态度 + 删除 */
        '<div class="rc-row rc-row-main">' +
          '<input class="avatar-input" value="' + (r.avatar || '🙂') + '" title="头像 emoji" maxlength="2">' +
          '<input class="rc-name" placeholder="角色名" value="' + esc(r.name) + '">' +
          '<input class="rc-title" data-f="title" placeholder="头衔" value="' + esc(r.title) + '">' +
          stanceHtml +
          '<button class="rc-del" title="删除角色">✕</button>' +
        '</div>' +
        /* 第二行：模型绑定 | 性格 | 领域 */
        '<div class="rc-row rc-row-meta">' +
          '<select data-f="provider" class="rc-provider">' + providerOpts(r.provider) + '</select>' +
          '<input data-f="personality" placeholder="性格" value="' + esc(r.personality) + '">' +
          '<input data-f="domain" placeholder="领域" value="' + esc(r.domain) + '">' +
        '</div>';
      card.querySelector('.avatar-input').addEventListener('input', e => { r.avatar = e.target.value || '🙂'; });
      card.querySelector('.rc-name').addEventListener('input', e => { r.name = e.target.value; });
      card.querySelector('.rc-del').addEventListener('click', () => {
        if (state.roles.length <= 2) { alert('至少需要 2 位角色'); return; }
        state.roles = state.roles.filter(x => x.id !== r.id);
        renderRoles();
      });
      const provSel = card.querySelector('[data-f="provider"]');
      provSel.addEventListener('change', () => { r.provider = provSel.value; });
      card.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('input', e => { r[inp.dataset.f] = e.target.value; });
      });
      list.appendChild(card);
    });
  }

  function addRole() {
    state.roles.push({
      id: rid(), name: '新角色', title: '头衔', avatar: AVATARS[state.roles.length % AVATARS.length],
      stance: 'neutral', personality: '理性', domain: '通用', provider: 'mock'
    });
    renderRoles();
  }

  // 角色态度模式切换：自由发挥 / 制式辩论
  function bindStanceMode() {
    const box = $('#stanceMode');
    if (!box) return;
    const hint = $('#stanceModeHint');
    box.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.discussionMode = btn.dataset.mode;
        box.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        if (hint) {
          hint.textContent = state.discussionMode === 'free'
            ? '角色自行形成立场，讨论更自然；切到「制式辩论」可手动指定每位角色支持 / 反对 / 中立。'
            : '已开启制式辩论：请在每位角色卡片中指定其支持 / 反对 / 中立立场，主持人将据此制造对立。';
        }
        renderRoles();
      });
    });
  }

  // 运行模式切换（模拟/真实），放在主界面顶栏；会议开始后锁定不可切换
  function bindRunMode() {
    const seg = $('#runModeSeg');
    if (!seg) return;
    function syncUI() {
      const isReal = !!state.realMode;
      seg.querySelectorAll('.seg-btn').forEach(b => {
        b.classList.toggle('active', (b.dataset.rmode === 'real') === isReal);
      });
      // 同步到底部提示文字
      const hintEl = document.querySelector('.panel-body .hint:last-of-type');
      if (hintEl) {
        hintEl.textContent = isReal
          ? '当前为「真实模型」模式，将调用右侧配置的模型 API。点左上角「设置」可管理模型提供商与密钥。'
          : '当前为「模拟回复」模式，无需任何 API key 即可运行。点左上角「设置」可配置真实模型接入（OpenAI / Anthropic / Ollama 与任意自定义模型均在此添加）。';
      }
    }
    function setLocked(locked) {
      seg.classList.toggle('locked', locked);
    }
    seg.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (seg.classList.contains('locked')) return;  // 会议中禁止切换
        state.realMode = btn.dataset.rmode === 'real';
        saveStore();
        syncUI();
      });
    });
    // 暴露锁定/同步接口供 startMeeting / onDone / resetMeeting 调用
    bindRunMode._sync = syncUI;
    bindRunMode._lock = function (locked) { setLocked(locked); };
    syncUI();
  }

  // 绑定主持人"绑定模型"下拉（仍留在主面板），并动态包含自定义厂商
  function bindHostInputs() {
    const hp = $('#hostProvider');
    hp.innerHTML = providerOpts(state.host.provider || 'mock');
    hp.addEventListener('change', () => { state.host.provider = hp.value; });
  }

  // ---------- 设置浮层（模型接入 · 真实模式） ----------
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function openSettings() {
    renderSettings();
    $('#settingsModal').classList.remove('hidden');
  }
  function closeSettings() { $('#settingsModal').classList.add('hidden'); }

  function renderSettings() {
    const m = $('#settingsModal');
    if (!m) return;
    m.innerHTML = '';
    const card = el('div', 'settings-card');

    const bar = el('div', 'set-bar');
    bar.appendChild(el('div', 'set-title has-ic ic-settings', '模型接入设置'));
    const close = el('button', 'btn btn-sm btn-ghost has-ic ic-x', '关闭');
    close.addEventListener('click', closeSettings);
    bar.appendChild(close);
    card.appendChild(bar);

    // 厂商卡片（全部为可编辑、可删除的用户自定义项，含曾经内置的 OpenAI/Anthropic/Ollama）
    card.appendChild(el('div', 'section-title', '模型提供商'));
    const keys = Object.keys(state.providers);
    if (!keys.length) {
      card.appendChild(el('div', 'prov-empty',
        '尚未添加任何模型。可一键添加常见厂商，或添加任意走 OpenAI / Anthropic 协议的服务（含自建网关、DeepSeek、通义千问、Ollama 等）。'));
    }
    keys.forEach(function (key) {
      card.appendChild(provCard(key, state.providers[key]));
    });

    // 一键添加常见厂商；添加后与普通自定义项一致，可改名/删
    const presets = el('div', 'prov-presets');
    ['openai', 'anthropic', 'ollama', 'zhipu', 'deepseek', 'qwen', 'kimi'].forEach(function (k) {
      const b = el('button', 'btn btn-xs btn-ghost prov-preset has-ic ic-plus', PRESETS[k].name);
      b.addEventListener('click', () => addPreset(k));
      presets.appendChild(b);
    });
    card.appendChild(presets);

    // 添加自定义模型（任意 OpenAI / Anthropic 兼容端点）
    const addWrap = el('div', 'prov-add');
    const addBtn = el('button', 'btn btn-add has-ic ic-plus', '添加自定义模型');
    addBtn.addEventListener('click', () => { const f = $('#npForm'); if (f) f.classList.toggle('hidden'); });
    addWrap.appendChild(addBtn);
    const form = el('div', 'prov-add-form hidden');
    form.id = 'npForm';
    form.innerHTML =
      '<div class="field" style="margin-top:8px"><label>名称</label>' +
        '<input id="npName" placeholder="例如 DeepSeek / 通义千问 / 自建网关"></div>' +
      '<div class="field"><label>协议</label><select id="npProto">' +
        opt('openai', 'OpenAI 兼容协议（chat/completions）', 'openai') +
        opt('anthropic', 'Anthropic 兼容协议（v1/messages）', 'anthropic') +
      '</select></div>' +
      '<div class="field"><label>Base URL</label><input id="npUrl" placeholder="https://your-endpoint/v1"></div>' +
      '<div class="field"><label>默认模型（可选，留空则需在角色中填写）</label>' +
        '<input id="npModel" placeholder="如 gpt-4o / deepseek-chat / qwen-max"></div>' +
      '<div class="field"><label>温度（可选，默认 0.85；部分模型仅支持 1，如 Kimi）</label>' +
        '<input id="npTemp" type="number" step="0.05" min="0" max="2" placeholder="0.85"></div>' +
      '<div class="field"><label>超时秒（可选，默认 60；Kimi / 慢模型建议 90）</label>' +
        '<input id="npTimeout" type="number" min="1" step="1" placeholder="60"></div>' +
      '<div class="field"><label>最大输出 token（可选，默认 4096；Kimi / DeepSeek 等推理模型思考也占预算，建议 8192）</label>' +
        '<input id="npMaxTokens" type="number" min="256" step="256" placeholder="4096"></div>' +
      '<div class="field"><label>API Key（可选，部分服务不需要）</label>' +
        '<div style="display:flex;gap:6px;align-items:center"><input id="npKey" type="password" placeholder="sk-...">' +
        '<button id="npReveal" type="button" class="btn btn-xs btn-ghost has-ic ic-eye" title="显示/隐藏明文"></button></div></div>' +
      '<div class="np-form-btns">' +
        '<button id="npCancel" class="btn btn-xs btn-ghost">取消</button>' +
        '<button id="npAdd" class="btn btn-xs btn-primary">添加</button>' +
      '</div>';
    addWrap.appendChild(form);
    card.appendChild(addWrap);

    // 本地代理（仅网页版 file:// 打开时需要；桌面端用 app:// 协议直连，无需代理）
    if (!isElectron()) {
      const px = el('label', 'check');
      const pxIn = el('input'); pxIn.type = 'checkbox'; pxIn.id = 'setProxy';
      pxIn.checked = state.proxyEnabled;
      pxIn.addEventListener('change', e => { state.proxyEnabled = e.target.checked; saveStore(); });
      px.appendChild(pxIn);
      px.appendChild(document.createTextNode(' 通过本地代理绕过 CORS（需运行 proxy.js，仅对内置 OpenAI/Anthropic 生效）'));
      card.appendChild(px);
    }

    card.appendChild(el('div', 'hint',
      '密钥仅存于本机浏览器 localStorage，不写入代码。默认以掩码（•）显示，点击「明文」可临时查看明文。' +
      '一键添加常见厂商（OpenAI / Anthropic / Ollama / 智谱 AI / DeepSeek / 通义千问 / Kimi）后，也可继续添加任意走 OpenAI 或 Anthropic 协议的自定义模型，并在角色/主持人的「绑定模型」中选用。' +
      '注意：智谱、DeepSeek、通义千问、Kimi 等国内模型均为「OpenAI 兼容协议」，不要选成 Anthropic 协议（否则会请求 /v1/messages 而 404）。' +
      '「温度」默认 0.85；部分模型（如 Kimi 的 kimi-k2）仅接受 1，可在对应厂商卡片中单独设置，否则会报 HTTP 400。' +
      '「超时」默认 60 秒（毫秒级硬超时，超时即回退模拟，全局安全上限仍受 Electron 网络栈约束）；Kimi（Moonshot）等响应较慢的模型已自动设为 90 秒，若仍触发 "signal is aborted" 可在对应厂商卡片手动调大。' +
      '真实模式下从浏览器直接调用可能受 CORS 限制，失败会自动回退模拟并提示；勾选代理并运行 proxy.js 可规避（仅对官方 OpenAI/Anthropic 域名生效）。'));

    m.appendChild(card);

    // 绑定添加表单
    $('#npCancel').addEventListener('click', () => form.classList.add('hidden'));
    $('#npAdd').addEventListener('click', addProvider);
    $('#npReveal').addEventListener('click', () => {
      const inp = $('#npKey');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      inp.focus();
    });
  }

  // 单个厂商卡片；所有厂商均可改名、改协议、填写密钥/BaseURL、删除
  function provCard(key, p) {
    const wrap = el('div', 'prov-card');

    const head = el('div', 'prov-head');
    const nm = el('input', 'prov-name-input');
    nm.value = p.name || '';
    nm.placeholder = '名称';
    nm.addEventListener('input', () => { p.name = nm.value; persistProvider(key); });
    head.appendChild(nm);
    head.appendChild(el('span', 'prov-tag', protoTag(p.protocol)));
    const del = el('button', 'prov-del has-ic ic-x', '删除');
    del.title = '删除该模型';
    del.addEventListener('click', () => deleteProvider(key));
    head.appendChild(del);
    wrap.appendChild(head);

    const ps = el('select', 'prov-proto');
    ps.innerHTML = opt('openai', 'OpenAI 兼容协议', 'openai') +
      opt('anthropic', 'Anthropic 兼容协议', 'anthropic');
    if (p.protocol === 'ollama') ps.innerHTML += opt('ollama', 'Ollama 本地', 'ollama');
    ps.value = p.protocol || 'openai';
    ps.addEventListener('change', () => { p.protocol = ps.value; persistProvider(key); });
    wrap.appendChild(ps);

    // 模型 + 温度：同一行
    const modelRow = el('div', 'prov-model-row');
    const dm = el('input');
    dm.type = 'text';
    dm.id = 'setDm_' + key;
    dm.placeholder = '默认模型（可选）';
    dm.value = p.defaultModel || '';
    dm.addEventListener('input', () => { p.defaultModel = dm.value; persistProvider(key); });
    modelRow.appendChild(dm);

    const temp = el('input');
    temp.type = 'number';
    temp.step = '0.05';
    temp.min = '0';
    temp.max = '2';
    temp.id = 'setTemp_' + key;
    temp.placeholder = '温度';
    if (typeof p.temperature === 'number') temp.value = p.temperature;
    temp.addEventListener('input', () => {
      const v = parseFloat(temp.value);
      if (temp.value === '' || isNaN(v)) delete p.temperature;
      else p.temperature = v;
      persistProvider(key);
    });
    modelRow.appendChild(temp);
    wrap.appendChild(modelRow);

    // 超时（秒，存储为毫秒）：Kimi 等慢模型可调大，避免被硬超时打断
    const toRow = el('div', 'prov-timeout-row');
    const to = el('input');
    to.type = 'number';
    to.min = '1';
    to.step = '1';
    to.id = 'setTo_' + key;
    to.placeholder = '超时秒（默认 60；Kimi 建议 90）';
    if (typeof p.timeout === 'number') to.value = Math.round(p.timeout / 1000);
    to.addEventListener('input', () => {
      const v = parseInt(to.value, 10);
      if (to.value === '' || isNaN(v)) delete p.timeout;
      else p.timeout = v * 1000;
      persistProvider(key);
    });
    toRow.appendChild(to);
    wrap.appendChild(toRow);

    // 最大输出 token：推理模型（Kimi/DeepSeek 等）思考 token 也吃此预算，太小会导致 content 为空（finish_reason=length）。默认留空走全局 4096，Kimi 等建议 8192。
    const mtRow = el('div', 'prov-timeout-row');
    const mt = el('input');
    mt.type = 'number';
    mt.min = '256';
    mt.step = '256';
    mt.id = 'setMt_' + key;
    mt.placeholder = '最大输出 token（默认 4096；Kimi 建议 8192）';
    if (typeof p.maxTokens === 'number') mt.value = p.maxTokens;
    mt.addEventListener('input', () => {
      const v = parseInt(mt.value, 10);
      if (mt.value === '' || isNaN(v)) delete p.maxTokens;
      else p.maxTokens = v;
      persistProvider(key);
    });
    mtRow.appendChild(mt);
    wrap.appendChild(mtRow);

    const needsKey = p.protocol !== 'ollama';
    if (needsKey) {
      const row = el('div', 'prov-key-row');
      const input = el('input');
      input.type = 'password';
      input.placeholder = 'API Key（sk-...）';
      input.id = 'setKey_' + key;
      if (p.apiKey && !hasApi()) input.value = p.apiKey; // 网页版回退：仅在非桌面端回填明文
      const reveal = el('button', 'btn btn-xs btn-ghost has-ic ic-eye', '');
      reveal.title = '显示 / 隐藏明文';
      reveal.addEventListener('click', async () => {
        if (input.type === 'text') {
          // 隐藏：清空明文（避免明文长期驻留 DOM）
          input.value = '';
          input.type = 'password';
        } else {
          // 显示：仅临时从主进程取明文填入，不写入 state（主进程才持有密文）
          let k = p.apiKey || '';
          if (hasApi() && !k) { try { k = await window.api.keys.getDecryptedKey(key); } catch (e) { k = ''; } }
          input.value = k;
          input.type = 'text';
        }
        input.focus();
      });
      input.addEventListener('input', () => { p.apiKey = input.value; persistProvider(key); });
      row.appendChild(input);
      row.appendChild(reveal);
      wrap.appendChild(row);
    }
    const url = el('input');
    url.type = 'text';
    url.placeholder = 'Base URL';
    url.value = p.baseUrl || '';
    url.id = 'setUrl_' + key;
    url.addEventListener('input', () => { p.baseUrl = url.value; saveStore(); });
    wrap.appendChild(url);
    return wrap;
  }

  // 添加自定义模型（声明走 openai / anthropic 协议）
  function addProvider() {
    const name = $('#npName').value.trim();
    const proto = $('#npProto').value;
    const url = $('#npUrl').value.trim();
    const model = $('#npModel') ? $('#npModel').value.trim() : '';
    const keyVal = $('#npKey') ? $('#npKey').value : '';
    const tv = $('#npTemp') ? $('#npTemp').value.trim() : '';
    const tnum = parseFloat(tv);
    const tov = $('#npTimeout') ? $('#npTimeout').value.trim() : '';
    const tonum = parseInt(tov, 10);
    const mtv = $('#npMaxTokens') ? $('#npMaxTokens').value.trim() : '';
    const mtnum = parseInt(mtv, 10);
    if (!name) { alert('请填写名称'); return; }
    if (!url) { alert('请填写 Base URL'); return; }
    const key = 'c_' + Math.random().toString(36).slice(2, 8);
    const entry = { name: name, protocol: proto, baseUrl: url, apiKey: keyVal, defaultModel: model };
    if (tv !== '' && !isNaN(tnum)) entry.temperature = tnum;
    if (tov !== '' && !isNaN(tonum)) entry.timeout = tonum * 1000; // 秒→毫秒
    if (mtv !== '' && !isNaN(mtnum)) entry.maxTokens = mtnum;
    state.providers[key] = entry;
    persistProvider(key);
    renderSettings();
    refreshProviderSelectors();
  }

  // 一键添加常见厂商（OpenAI / Anthropic / Ollama）；已存在（同 baseUrl+协议）则跳过
  function addPreset(kind) {
    const p = PRESETS[kind];
    if (!p) return;
    const dup = Object.keys(state.providers).find(function (k) {
      const e = state.providers[k];
      return e && e.baseUrl === p.baseUrl && e.protocol === p.protocol;
    });
    if (dup) { renderSettings(); refreshProviderSelectors(); return; }
    const key = 'c_' + Math.random().toString(36).slice(2, 8);
    const entry = {
      name: p.name, protocol: p.protocol, baseUrl: p.baseUrl, apiKey: '', defaultModel: p.defaultModel
    };
    if (typeof p.temperature === 'number') entry.temperature = p.temperature;
    if (typeof p.timeout === 'number') entry.timeout = p.timeout;
    if (typeof p.maxTokens === 'number') entry.maxTokens = p.maxTokens;
    state.providers[key] = entry;
    persistProvider(key);
    renderSettings();
    refreshProviderSelectors();
  }

  // 删除自定义模型，并把引用它的角色/主持人回退到模拟
  function deleteProvider(key) {
    if (!state.providers[key]) return;
    if (!confirm('删除模型「' + (state.providers[key].name || key) + '」？')) return;
    delete state.providers[key];
    state.roles.forEach(r => { if (r.provider === key) { r.provider = 'mock'; } });
    if (state.host.provider === key) { state.host.provider = 'mock'; }
    if (hasApi()) window.api.keys.deleteProvider(key).catch(function () {});
    else saveStore();
    renderSettings();
    refreshProviderSelectors();
  }

  // 提供商增删后，刷新角色卡片与主持人下拉（保持与自定义厂商同步）
  function refreshProviderSelectors() {
    renderRoles();
    const hp = $('#hostProvider');
    if (hp) hp.innerHTML = providerOpts(state.host.provider || 'mock');
  }

  // ---------- 会议控制 ----------
  function collectConfig() {
    state.topic = $('#topic').value.trim();
    state.host.name = $('#hostName').value.trim() || '主持人';
    state.host.provider = $('#hostProvider').value || 'mock';
    state.mode = $('#mode').value;
    const hostModel = state.host.provider === 'mock' ? '模拟' :
      state.host.provider + ':' + (defaultModel(state.host.provider) || '?');
    return {
      topic: state.topic,
      host: { name: state.host.name, model: hostModel, behavior: $('#hostBehavior').value },
      mode: state.mode,
      roles: state.roles.map(r => ({
        id: r.id, name: r.name || '匿名', title: r.title, avatar: r.avatar || '🙂',
        stance: r.stance, personality: r.personality, domain: r.domain,
        provider: r.provider || 'mock',
        model: dispModel(r)
      }))
    };
  }

  async function startMeeting() {
    try {
      const cfg = collectConfig();
      if (!cfg.topic) { alert('请先填写议题'); return; }
      if (cfg.roles.length < 2) { alert('至少需要 2 位角色'); return; }
      _ended = false;   // 新会议，重置结束门控
      viewingHistoryMeta = null; // 开始新会议，清除历史会议元数据
      clearTypewriters();  // 清除上一轮残留的打字机定时器，防止干扰新会议渲染

      $('#startBtn').disabled = true;
      const eb = $('#endBtn'); if (eb) eb.disabled = false;
      // #emptyState 是 #chat 的子元素，上一轮 startMeeting 的 innerHTML='' 已将其删除；
      // 用 null 守卫避免第二次启动时 Cannot read properties of null
      const es = $('#emptyState'); if (es) es.classList.add('hidden');
      $('#chat').innerHTML = '';
      const cp = $('#composer'); if (cp) cp.classList.remove('hidden');
      running = true;
      if (bindRunMode._lock) bindRunMode._lock(true);
      updateHead(cfg.topic, cfg.mode, '开场');

      // 真实模式下从 file:// 直接调用外部 API 常被浏览器 CORS 静默拦截（请求挂起）
      // （桌面端运行在 app:// 协议下，不会进入此分支）
      if (!isElectron() && state.realMode && !state.proxyEnabled &&
          typeof location !== 'undefined' && location.protocol === 'file:' &&
          cfg.roles.some(r => r.provider && r.provider !== 'mock')) {
        setStatus('⚠ 当前以 file:// 打开且未启用代理：浏览器可能拦截对外部模型的请求。' +
          '建议用本地代理（运行 proxy.js）或改用 http 服务打开，否则将自动回退模拟。');
      }

      const runtimeProviders = await buildRuntimeProviders();
      const router = new ModelRouter(runtimeProviders, state.realMode ? 'real' : 'mock', {
        proxyEnabled: state.proxyEnabled, proxyBase: 'http://localhost:8787',
        onStatus: setStatus, timeout: 60000, discussionMode: state.discussionMode
      });
      if (engine) {
        engine.abort();
        engine.onEvent = function () {};   // 阻止旧引擎异步残留事件（{} kind:'done'）误触发 onDone
      }
      if (hasApi()) {
        try {
          currentMeetingId = await window.api.db.createMeeting({
            title: (cfg.topic || '').slice(0, 40), topic: cfg.topic, scene: state.scene, mode: state.mode
          });
        } catch (e) { console.error('[Roundtable] createMeeting failed', e); currentMeetingId = null; }
      }
      engine = new MeetingEngine({
        topic: cfg.topic, roles: cfg.roles, host: cfg.host, mode: cfg.mode,
        discussionMode: state.discussionMode,
        generator: router, delay: SPEED_PRESETS[_currentSpeed].delay, onEvent: onEvent
      });
      branches = [];
      activeBranch = addBranch(engine, '主线', null, null, null);
      renderBranchPanel();
      // 启用暂停按钮，重置文字
      const pb = $('#pauseBtn'); if (pb) { pb.disabled = false; pb.textContent = '暂停'; }
      setStatus(state.realMode ? '⏳ 会议开始（真实模式）…' : '会议开始（模拟模式）…');
      startWatchdog();  // 启动看门狗：若 15 秒内无事件则自动恢复 UI
      engine.start().then(
        function () {
          // 会议正常完成（onDone 已通过 done 事件调用）
          clearWatchdog();
        },
        function (e) {
          // 引擎出错：恢复 UI 并显示错误（不再被 clearStatus 覆盖）
          clearWatchdog();
          console.error('[Roundtable] Meeting error:', e);
          _ended = true;
          running = false;
          $('#startBtn').disabled = false;
          $('#startBtn').textContent = '重新开始';
          const eb2 = $('#endBtn'); if (eb2) eb2.disabled = true;
          if (bindRunMode._lock) bindRunMode._lock(false);
          setStatus('❌ 会议运行出错：' + (e && e.message ? e.message : e));
        }
      );
    } catch (e) {
      // startMeeting 本身抛异常（如 DOM 操作失败）：恢复 UI
      console.error('[Roundtable] startMeeting error:', e);
      clearWatchdog();
      _ended = true;
      running = false;
      $('#startBtn').disabled = false;
      $('#startBtn').textContent = '重新开始';
      const eb3 = $('#endBtn'); if (eb3) eb3.disabled = true;
      if (bindRunMode._lock) bindRunMode._lock(false);
      setStatus('❌ 启动会议失败：' + (e && e.message ? e.message : e));
    }
  }

  function setStatus(msg) {
    const bar = $('#statusBar');
    if (!bar) return;
    bar.textContent = msg;
    bar.classList.remove('hidden');
  }
  function clearStatus() {
    const bar = $('#statusBar');
    if (bar) { bar.textContent = ''; bar.classList.add('hidden'); }
  }

  function addBranch(eng, label, parentId, forkSnapId, director) {
    const b = {
      id: 'branch-' + (++branchSeq), label: label, engine: eng,
      parentId: parentId, forkSnapId: forkSnapId, director: director || null, done: false
    };
    branches.push(b);
    return b;
  }

  let _ended = false;   // 会议已结束（手动结束或自然走完），拦截引擎后续漏网事件
  let _watchdog = null; // 看门狗：引擎启动后若迟迟不产生事件，超时恢复 UI

  function startWatchdog() {
    clearWatchdog();
    _watchdog = setTimeout(function () {
      console.error('[Roundtable] Watchdog: 15 秒内未收到任何引擎事件，强制恢复 UI');
      _watchdog = null;
      _ended = true;
      running = false;
      $('#startBtn').disabled = false;
      $('#startBtn').textContent = '重新开始';
      const eb = $('#endBtn'); if (eb) eb.disabled = true;
      if (bindRunMode._lock) bindRunMode._lock(false);
      setStatus('⚠ 会议启动超时（未收到事件），已自动恢复。请重试。');
    }, 15000);
  }
  function clearWatchdog() {
    if (_watchdog) { clearTimeout(_watchdog); _watchdog = null; }
  }

  async function onEvent(ev) {
    if (!ev || !ev.kind) return;
    if (_ended) return;   // 已结束后丢弃所有引擎后续事件，防止重复消息
    clearWatchdog();      // 收到事件，取消看门狗
    if (ev.kind === 'done') { _ended = true; onDone(); return; }
    if (ev.kind === 'host') {
      if (hasApi() && currentMeetingId) window.api.db.appendMessage(currentMeetingId, ev).catch(function () {});
      await renderHost(ev); maybeRefreshPanel(); return;
    }
    if (ev.kind === 'speech') {
      if (hasApi() && currentMeetingId) window.api.db.appendMessage(currentMeetingId, ev).catch(function () {});
      await renderSpeech(ev); maybeRefreshPanel(); return;
    }
  }

  function renderHost(ev, instant) {
    const m = el('div', 'msg host' + (ev.director ? ' director' : '') + (ev.refocus ? ' refocus' : ''));
    const inner = el('div', 'host-inner');
    inner.appendChild(el('div', 'host-name', '🎬 ' + esc(ev.name) + (ev.director ? ' · 导演指令' : '')));
    const textEl = el('div', 'text');
    inner.appendChild(textEl);
    if (ev.action && ev.speaker) {
      const sp = state.roles.find(r => r.id === ev.speaker);
      inner.appendChild(el('div', 'host-decision',
        '🎬 调度：' + (ev.action === 'invite' ? '邀请 ' : ev.action === 'probe' ? '追问 ' : '拉回 ') +
        (sp ? esc(sp.name) : '')));
    }
    m.appendChild(inner);
    appendMsg(m);
    return typewriter(textEl, ev.text, _typeSpeed.host, instant);
  }

  function renderSpeech(ev, instant) {
    const st = STANCE[ev.stance] || STANCE.neutral;
    // 自由模式下不预设立场：发言阶段不显示立场标签，仅在投票亮明态度时显示
    const showStance = state.discussionMode === 'scripted' || ev.vote === true;
    const m = el('div', 'msg');
    const av = el('div', 'avatar', ev.avatar || '🙂');
    av.style.background = showStance ? st.color : 'var(--border)';
    m.appendChild(av);

    const body = el('div', 'body');
    const meta = el('div', 'meta');
    meta.appendChild(el('span', 'name', esc(ev.name)));
    meta.appendChild(el('span', 'title', esc(ev.title || '')));
    meta.appendChild(el('span', 'model-tag', esc(ev.model || '—')));
    if (showStance) {
      const stanceTag = el('span', 'stance-tag', st.label);
      stanceTag.style.background = st.color;
      meta.appendChild(stanceTag);
    }
    body.appendChild(meta);

    if (ev.replyTo) {
      const tgt = state.roles.find(r => r.id === ev.replyTo);
      if (tgt) body.appendChild(el('div', 'title', '↳ 回应 @' + esc(tgt.name)));
    }
    const textEl = el('div', 'text');
    body.appendChild(textEl);
    if (ev.fallback) body.appendChild(el('div', 'fallback', '⚠ ' + esc(ev.fallback)));
    m.appendChild(body);
    appendMsg(m);
    return typewriter(textEl, ev.text, _typeSpeed.speech, instant);
  }

  // 把一整段 transcript 一次性（无打字机）渲染——用于分支回看/切换
  function renderTranscriptInstant(list) {
    (list || []).forEach(ev => {
      if (!ev || !ev.kind) return;
      if (ev.kind === 'host') renderHost(ev, true);
      else if (ev.kind === 'speech') renderSpeech(ev, true);
    });
  }

  function appendMsg(m) {
    const chat = $('#chat');
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
  }

  // —— 打字机定时器追踪 ——
  // 上一轮会议的 setInterval 如果没清理完，会持续操作已被清空的 DOM 节点，
  // 可能干扰新一轮会议的渲染。统一追踪并在重置时清除。
  // typewriter 返回 Promise，引擎 await 它即可实现"等打字机渲染完再继续下一条"。
  let _twTimers = [];
  let _typeSpeed = { host: 12, speech: 18 };  // 打字速度（ms/字符），可被速度选择器覆盖
  function clearTypewriters() {
    _twTimers.forEach(function (t) { clearInterval(t); });
    _twTimers = [];
  }
  function typewriter(node, text, speed, instant) {
    if (instant) { node.textContent = text; return Promise.resolve(); }
    return new Promise(function (resolve) {
      node.textContent = '';
      const cursor = el('span', 'cursor');
      node.appendChild(cursor);
      let i = 0;
      const t = setInterval(() => {
        if (i >= text.length) {
          cursor.remove(); clearInterval(t);
          _twTimers = _twTimers.filter(function (x) { return x !== t; });
          resolve();
          return;
        }
        cursor.insertAdjacentText('beforebegin', text[i]);
        i++;
        const chat = $('#chat');
        if (chat) chat.scrollTop = chat.scrollHeight;
      }, speed);
      _twTimers.push(t);
    });
  }

  function onDone() {
    clearWatchdog();
    running = false;
    if (activeBranch) activeBranch.done = true;
    $('#startBtn').disabled = false;
    $('#startBtn').textContent = '重新开始';
    const eb = $('#endBtn'); if (eb) eb.disabled = true;
    const pb = $('#pauseBtn'); if (pb) { pb.disabled = true; pb.textContent = '暂停'; }
    // 会议结束后隐藏导演指令输入框（否则用户会看到按钮但点击无效）
    const cp = $('#composer'); if (cp) cp.classList.add('hidden');
    updateHead(state.topic, activeBranch ? activeBranch.engine.mode : state.mode, '已结束');
    maybeRefreshPanel();
    clearStatus();
    if (bindRunMode._lock) bindRunMode._lock(false);   // 会议结束后允许切换
  }

  function updateHead(topic, mode, phase) {
    $('#topicPill').textContent = '议题：' + topic;
    $('#modeBadge').textContent = MODE_LABEL[mode] || mode;
    $('#phaseBadge').textContent = '阶段：' + (PHASE_LABEL[phase] || phase);
  }

  function sendDirector() {
    const inp = $('#directorInput');
    const text = inp.value.trim();
    if (!text) return;   // 空输入不处理
    if (!engine || !running) {
      setStatus('⚠ 会议未在进行中，无法发送导演指令');
      setTimeout(clearStatus, 2500);
      return;
    }
    engine.director(text, extractTarget(text));
    inp.value = '';
    // 给用户即时反馈，确认指令已加入队列（辩论阶段下一轮生效）
    const target = extractTarget(text);
    setStatus('✅ 导演指令已加入队列' + (target ? '（将围绕：' + target + '）' : '') +
      '，将在下一轮辩论中生效');
    setTimeout(clearStatus, 3000);
  }
  function extractTarget(text) {
    for (const r of state.roles) if (r.name && text.indexOf(r.name) >= 0) return r.name;
    return null;
  }

  function exportMarkdown() {
    if (!engine || !engine.transcript.length) { alert('还没有可导出的会议记录'); return; }
    const tr = engine.transcript.filter(e => e.kind === 'speech' || e.kind === 'host');
    const isHistory = !!viewingHistoryMeta;
    // 历史记录用其自身存储的元数据（议题/模式/主持人/角色），避免与当前会话 state 串味
    const topic = isHistory ? (viewingHistoryMeta.title || viewingHistoryMeta.topic || '') : state.topic;
    const mode = isHistory ? (viewingHistoryMeta.mode || '') : ((activeBranch && activeBranch.engine.mode) || state.mode);
    let md = '# 圆桌会议纪要\n\n';
    md += '**议题：** ' + topic + '\n\n';
    md += '**模式：** ' + (MODE_LABEL[mode] || mode) + '\n\n';
    if (isHistory) {
      // 历史记录：议题/主持人/角色均来自库内存储的该场会议元数据，不再引用当前会话
      const hasReal = tr.some(e => e.model);
      md += '**运行：** ' + (hasReal ? '真实模型' : '模拟模式') + '（历史记录）\n\n';
      const host = tr.find(e => e.kind === 'host');
      if (host) md += '**主持人：** ' + host.name + '（' + (host.model || '—') + '）\n\n';
      md += '**参与角色：**\n';
      const seen = {};
      tr.filter(e => e.kind === 'speech').forEach(e => {
        const key = e.role_id || e.name;
        if (seen[key]) return;
        seen[key] = true;
        const st = STANCE[e.stance] || STANCE.neutral;
        md += '- ' + e.name + '（' + (e.title || '') + '）· ' + st.label + ' · ' + (e.model || '—') + '\n';
      });
      md += '\n';
    } else {
      md += '**运行：** ' + (state.realMode ? '真实模型' : '模拟模式') + '\n\n';
      md += '**主持人：** ' + state.host.name + '（' + dispModel(state.host) + '）\n\n';
      md += '**当前分支：** ' + (activeBranch ? activeBranch.label : '主线') +
        (activeBranch && activeBranch.director ? '（导演指令：' + activeBranch.director + '）' : '') + '\n\n';
      md += '**参与角色：**\n';
      state.roles.forEach(r => {
        const st = STANCE[r.stance] || STANCE.neutral;
        md += '- ' + r.name + '（' + (r.title || '') + '）· ' + st.label + ' · ' + dispModel(r) + '\n';
      });
      md += '\n';
    }
    md += '---\n\n## 讨论记录\n\n';
    tr.forEach(e => {
      if (e.kind === 'host') {
        md += '**🎬 ' + e.name + (e.director ? '（导演指令）' : '') + '：** ' + e.text + '\n\n';
      } else {
        const st = STANCE[e.stance] || STANCE.neutral;
        md += '### ' + e.avatar + ' ' + e.name + '（' + (e.title || '') + ' / ' + (e.model || '—') + '）· ' + st.label + '\n\n';
        md += e.text + '\n\n';
        if (e.fallback) md += '> ⚠ ' + e.fallback + '\n\n';
      }
    });
    download(md, 'roundtable-' + (activeBranch ? activeBranch.label : 'main') + '-' + Date.now() + '.md');
  }
  function download(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function resetMeeting() {
    clearTypewriters();
    clearWatchdog();
    if (engine) { engine.abort(); engine.onEvent = function () {}; }
    running = false; engine = null; _ended = false;
    viewingHistoryMeta = null; // 重置会议时一并清除历史会议元数据
    branches = []; activeBranch = null; pendingSnap = null;
    // 重置时重建 #emptyState（它在首次 startMeeting 的 innerHTML='' 中被销毁了）
    $('#chat').innerHTML = '<div id="emptyState" class="empty">' +
      '<div class="big has-ic ic-message"></div>' +
      '<h2>一场虚拟圆桌，正在等待开场</h2>' +
      '<p>左侧配置议题、主持人与多位持不同立场的角色，选择讨论模式，<br/>' +
      '点击「开始会议」，即可观看大模型（模拟）上演一场有来有回的讨论。</p></div>';
    const cp = $('#composer'); if (cp) cp.classList.add('hidden');
    const bp = $('#branchPanel'); if (bp) bp.classList.add('hidden');
    $('#startBtn').disabled = false;
    $('#startBtn').textContent = '开始会议';
    updateHead(state.topic, state.mode, '空闲');
    if (bindRunMode._lock) bindRunMode._lock(false);
    const eb = $('#endBtn'); if (eb) eb.disabled = true;
    const pb = $('#pauseBtn'); if (pb) { pb.disabled = true; pb.textContent = '暂停'; }
  }

  // 手动结束当前会议：中止引擎循环，补一段阶段性总结，转入"已结束"状态
  function endMeeting() {
    if (!engine || !running) return;
    clearTypewriters();
    engine.abort();
    // 禁用旧引擎的 onEvent，防止其异步 start() 残留的 {kind:'done'} 触发 onDone()
    // （若此事件在"重新开始"后抵达，会把新会议误判为结束，导致界面卡死）
    engine.onEvent = function () {};
    _ended = true;
    // 输出阶段性总结（不走 onEvent 门控，直接渲染）
    const sum = engine.buildSummary();
    const msg = engine.hostMsg('（会议已手动结束，以下为阶段性总结）\n\n' + sum, 'summary');
    renderHost({ name: msg.name, model: msg.model, text: msg.text, director: msg.director }, true);
    onDone();
  }

  // ---------- 历史会议（本地数据库） ----------
  async function openHistory() {
    if (!hasApi()) { alert('历史会议功能仅在桌面客户端可用'); return; }
    let list = [];
    try { list = await window.api.db.listMeetings(); } catch (e) { console.error('[Roundtable] listMeetings failed', e); }
    let overlay = $('#historyModal');
    if (!overlay) {
      overlay = el('div', 'modal-overlay');
      overlay.id = 'historyModal';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;' +
        'align-items:center;justify-content:center;z-index:1000;';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
    const card = el('div', 'settings-card');
    card.style.maxHeight = '80vh';
    card.style.overflowY = 'auto';
    const bar = el('div', 'set-bar');
    bar.appendChild(el('div', 'set-title', '历史会议'));
    const close = el('button', 'btn btn-sm btn-ghost has-ic ic-x', '关闭');
    close.addEventListener('click', () => overlay.classList.add('hidden'));
    bar.appendChild(close);
    card.appendChild(bar);

    if (!list.length) {
      card.appendChild(el('div', 'prov-empty',
        '还没有已保存的会议记录。开始一场会议后，发言会自动保存到本地数据库，可在此调出查看与导出。'));
    } else {
      list.forEach(function (m) {
        const row = el('div', 'hist-row');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;' +
          'padding:10px 4px;border-bottom:1px solid var(--border)';
        const info = el('div', 'hist-info');
        info.appendChild(el('div', 'hist-title', m.title || m.topic || '（无标题）'));
        const d = new Date(m.created_at);
        const pad = (n) => String(n).padStart(2, '0');
        const ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
          pad(d.getHours()) + ':' + pad(d.getMinutes());
        info.appendChild(el('div', 'hist-meta', ds + ' · ' + (m.msg_count || 0) + ' 条 · ' +
          (m.scene || '') + ' / ' + (m.mode || '')));
        row.appendChild(info);
        const acts = el('div', 'hist-acts');
        acts.style.cssText = 'display:flex;gap:6px';
        const open = el('button', 'btn btn-xs btn-primary', '打开');
        open.addEventListener('click', () => loadHistoryMeeting(m, overlay));
        const del = el('button', 'btn btn-xs btn-ghost', '删除');
        del.addEventListener('click', async () => {
          if (!confirm('删除该会议记录？此操作不可恢复。')) return;
          try { await window.api.db.deleteMeeting(m.id); openHistory(); } catch (e) { console.error(e); }
        });
        acts.appendChild(open); acts.appendChild(del);
        row.appendChild(acts);
        card.appendChild(row);
      });
    }
    overlay.appendChild(card);
    overlay.classList.remove('hidden');
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
  }

  async function loadHistoryMeeting(m, overlay) {
    // 会议进行中禁止打开历史会议：当前为单聊天视图 + 单 engine，打开历史会冲掉 running
    // 状态、错误启用「开始会议」按钮，且后台会议仍在跑会把新发言追加到历史视图里。无还原机制，故直接拦截。
    if (running) { alert('当前有会议正在进行，请先结束会议后再查看历史记录。'); return; }
    let msgs = [];
    try { msgs = await window.api.db.getMeeting(m.id); } catch (e) { console.error('[Roundtable] getMeeting failed', e); return; }
    if (overlay) overlay.classList.add('hidden');
    $('#chat').innerHTML = '';
    renderTranscriptInstant(msgs);
    engine = { transcript: msgs, done: true };   // 供"导出纪要"复用当前记录
    viewingHistoryMeta = { title: m.title, topic: m.topic, scene: m.scene, mode: m.mode }; // 供导出纪要取用真实元数据
    running = false;
    $('#startBtn').disabled = false;
    $('#startBtn').textContent = '开始会议';
    const cp = $('#composer'); if (cp) cp.classList.add('hidden');
    setStatus('已载入历史会议（只读）。点击「导出纪要」可保存为 Markdown 文件。');
  }

  // ---------- 分支 / 回溯 ----------
  function maybeRefreshPanel() {
    const p = $('#branchPanel');
    if (p && !p.classList.contains('hidden') && !pendingSnap) renderBranchPanel();
  }

  function renderBranchPanel() {
    const panel = $('#branchPanel');
    if (!panel) return;
    panel.innerHTML = '';
    const head = el('div', 'bp-head');
    head.appendChild(el('span', 'has-ic ic-branch', '分支时间线'));
    const closeBtn = el('button', 'bp-close has-ic ic-x', '');
    closeBtn.title = '关闭';
    closeBtn.addEventListener('click', () => { panel.classList.add('hidden'); pendingSnap = null; });
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const eng = activeBranch ? activeBranch.engine : null;
    const snaps = (eng && eng.snapshots) || [];

    panel.appendChild(el('div', 'bp-sub', '从该节点重新生成后续：'));
    const forkable = snaps.filter(s => s.nextPhase);
    if (!forkable.length) {
      panel.appendChild(el('div', 'bp-empty', '会议进行中，结束后可在此处分支'));
    }
    forkable.forEach(s => {
      const row = el('div', 'bp-snap');
      row.appendChild(el('span', 'bp-label', s.label));
      const btn = el('button', 'btn btn-xs btn-primary', '分支');
      btn.addEventListener('click', () => showForkForm(s));
      row.appendChild(btn);
      panel.appendChild(row);
    });

    panel.appendChild(el('div', 'bp-sub', '已有分支（点击回看）：'));
    if (!branches.length) panel.appendChild(el('div', 'bp-empty', '暂无'));
    branches.forEach(b => {
      const row = el('div', 'bp-branch' + (activeBranch && b.id === activeBranch.id ? ' active' : ''));
      row.appendChild(el('span', 'bp-dot', (activeBranch && b.id === activeBranch.id) ? '●' : '○'));
      row.appendChild(el('span', 'bp-bname', b.label + (b.director ? '：' + b.director : '')));
      row.addEventListener('click', () => switchBranch(b));
      panel.appendChild(row);
    });

    // 分支表单（选中快照后显示）
    const form = el('div', 'bp-form hidden');
    form.id = 'bpForm';
    form.innerHTML =
      '<div class="bp-form-title">从「<span id="bpFormLabel"></span>」分支</div>' +
      '<textarea id="forkDirector" placeholder="可选：输入导演指令，例如「请让安全顾问主导后续讨论」"></textarea>' +
      '<div class="bp-form-btns">' +
        '<button id="forkCancel" class="btn btn-xs btn-ghost">取消</button>' +
        '<button id="forkGo" class="btn btn-xs btn-primary">生成新分支</button>' +
      '</div>';
    panel.appendChild(form);
  }

  function showForkForm(snap) {
    pendingSnap = snap;
    const form = $('#bpForm');
    form.classList.remove('hidden');
    $('#bpFormLabel').textContent = snap.label;
    $('#forkDirector').value = '';
    $('#forkCancel').onclick = () => { form.classList.add('hidden'); pendingSnap = null; };
    $('#forkGo').onclick = () => doFork();
  }

  async function doFork() {
    if (!pendingSnap) return;
    const snap = pendingSnap;
    const directorText = $('#forkDirector').value.trim();
    $('#bpForm').classList.add('hidden');
    pendingSnap = null;

    const runtimeProviders = await buildRuntimeProviders();
    const router = new ModelRouter(runtimeProviders, state.realMode ? 'real' : 'mock', {
      proxyEnabled: state.proxyEnabled, proxyBase: 'http://localhost:8787',
      discussionMode: state.discussionMode
    });
    const forked = MeetingEngine.fromSnapshot(snap, {
      generator: router, delay: 750, onEvent: onEvent, mode: state.mode,
      discussionMode: state.discussionMode
    });
    if (directorText) forked.director(directorText, extractTarget(directorText));

    const label = '分支' + branches.length;
    const b = addBranch(forked, label, activeBranch ? activeBranch.id : null, snap.id, directorText || null);
    activeBranch = b; engine = forked;
    renderBranchPanel();
    clearTypewriters();
    $('#chat').innerHTML = '';
    renderTranscriptInstant(forked.transcript);
    running = true;
    _ended = false;
    $('#startBtn').disabled = true;
    startWatchdog();
    forked.start().then(function () {
      clearWatchdog();
    }, function (e) {
      clearWatchdog();
      console.error('[Roundtable] Fork error:', e);
      _ended = true; running = false;
      $('#startBtn').disabled = false;
      $('#startBtn').textContent = '重新开始';
      setStatus('❌ 分支运行出错：' + (e && e.message ? e.message : e));
    });
  }

  function switchBranch(b) {
    clearTypewriters();
    activeBranch = b; engine = b.engine;
    renderBranchPanel();
    $('#chat').innerHTML = '';
    renderTranscriptInstant(b.engine.transcript);
    running = !b.engine.done;
    _ended = b.engine.done;
    $('#startBtn').disabled = running;
    $('#startBtn').textContent = b.engine.done ? '重新开始' : '开始会议';
    const ph = b.engine.phase === 'done' ? '已结束' : (PHASE_LABEL[b.engine.phase] || b.engine.phase);
    updateHead(state.topic, b.engine.mode, ph);
  }

  // ---------- 分支对比 · 观点碰撞图 ----------
  function snippet(t, n) {
    t = (t || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    n = n || 64;
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  function openCompare() {
    if (!Compare) { alert('对比模块未加载'); return; }
    if (branches.length < 2) {
      alert('至少生成 2 条分支才能对比。先在「分支」面板中从某个节点生成新分支。');
      return;
    }
    compareSel = new Set(branches.map(b => b.id));
    renderCompareView();
    $('#compareOverlay').classList.remove('hidden');
  }
  function closeCompare() { $('#compareOverlay').classList.add('hidden'); }

  function renderCompareView() {
    const overlay = $('#compareOverlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    const card = el('div', 'compare-card');
    overlay.appendChild(card);

    // 顶栏
    const bar = el('div', 'cmp-bar');
    bar.appendChild(el('div', 'cmp-title has-ic ic-scale', '分支对比 · 观点碰撞图'));
    const close = el('button', 'btn btn-sm btn-ghost has-ic ic-x', '关闭');
    close.addEventListener('click', closeCompare);
    bar.appendChild(close);
    card.appendChild(bar);

    // 分支勾选 chips
    const chips = el('div', 'cmp-chips');
    branches.forEach(b => {
      const on = compareSel.has(b.id);
      const chip = el('button', 'cmp-chip' + (on ? ' on' : ''),
        b.label + (b.director ? ' · ' + b.director : ''));
      chip.addEventListener('click', () => {
        if (compareSel.has(b.id)) compareSel.delete(b.id); else compareSel.add(b.id);
        renderCompareView();
      });
      chips.appendChild(chip);
    });
    card.appendChild(chips);

    const selected = branches.filter(b => compareSel.has(b.id));
    if (selected.length < 2) {
      card.appendChild(el('div', 'cmp-note',
        '请至少勾选 2 条分支进行对比（当前 ' + selected.length + ' 条）。'));
      return;
    }

    const cmp = Compare.compareBranches(
      selected.map(b => ({ id: b.id, label: b.label, transcript: b.engine.transcript, director: b.director })),
      state.roles
    );
    const divergedSet = new Set(cmp.divergedRoles.map(r => r.id));

    // 分歧摘要
    const names = cmp.divergedRoles.map(r => r.name);
    const summary = el('div', 'cmp-summary');
    summary.innerHTML = '在 <b>' + cmp.divergedRoles.length + ' / ' + cmp.rows.length +
      '</b> 个角色的观点上出现分歧' +
      (names.length ? '：<b>' + esc(names.join('、')) + '</b>' : '（各分支走向一致）') +
      '。模拟模式下分支内容含随机性；导演指令会定向改变走向。';
    card.appendChild(summary);

    // 并排碰撞图
    const mapsWrap = el('div', 'cmp-maps');
    selected.forEach(b => {
      const col = el('div', 'cmp-col');
      const head = el('div', 'cmp-col-head');
      head.appendChild(el('span', 'cmp-col-name', b.label));
      if (b.director) head.appendChild(el('span', 'cmp-col-dir', '⤷ ' + esc(b.director)));
      const viewBtn = el('button', 'btn btn-xs btn-ghost', '查看');
      viewBtn.addEventListener('click', () => { closeCompare(); switchBranch(b); });
      head.appendChild(viewBtn);
      col.appendChild(head);
      const coll = Compare.collisionFor(b.engine.transcript, state.roles);
      const svg = el('div', 'cmp-svg');
      svg.innerHTML = Compare.collisionSVG(coll, divergedSet, b.label);
      col.appendChild(svg);
      mapsWrap.appendChild(col);
    });
    card.appendChild(mapsWrap);

    // 差异高亮表
    card.appendChild(el('div', 'cmp-sub', '观点差异表（琥珀色单元格 = 该角色在分支间观点不同）'));
    const table = el('table', 'cmp-table');
    const thead = el('thead');
    const htr = el('tr');
    htr.appendChild(el('th', 'cmp-th-role', '角色'));
    selected.forEach(b => htr.appendChild(el('th', null, b.label)));
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = el('tbody');
    cmp.rows.forEach(r => {
      const tr = el('tr');
      const th = el('td', 'cmp-role');
      th.innerHTML = '<span class="cmp-av">' + esc(r.avatar) + '</span> ' + esc(r.name);
      tr.appendChild(th);
      selected.forEach(b => {
        const cell = r.byBranch[b.id] || {};
        const sig = cell.voteText || cell.lastText || cell.openingText || '';
        const td = el('td', 'cmp-td' + (r.diverged ? ' diff' : ''));
        td.appendChild(el('div', 'cmp-sig', snippet(sig)));
        if (cell.voteText) td.appendChild(el('div', 'cmp-vote', '🗳 ' + snippet(cell.voteText, 40)));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
  }

  // 速度档位：delay=引擎消息间隔, host/speech=打字机 ms/字符
  const SPEED_PRESETS = {
    slow:   { delay: 1500, host: 16, speech: 24, label: '慢速' },
    normal: { delay: 750,  host: 12, speech: 18, label: '正常' },
    fast:   { delay: 300,  host: 8,  speech: 10, label: '快速' }
  };
  let _currentSpeed = 'normal';

  function bindSpeedControl() {
    const sel = $('#speedSel');
    if (!sel) return;
    sel.addEventListener('change', function () {
      _currentSpeed = sel.value;
      const p = SPEED_PRESETS[_currentSpeed];
      _typeSpeed.host = p.host;
      _typeSpeed.speech = p.speech;
      // 若引擎正在运行，动态调整 delay（下一轮 sleep 生效）
      if (engine) engine.delay = p.delay;
    });
  }

  function togglePause() {
    if (!engine || !running) return;
    const btn = $('#pauseBtn');
    if (engine.paused) {
      engine.resume();
      btn.textContent = '暂停';
      setStatus('会议已继续');
      setTimeout(clearStatus, 1500);
    } else {
      engine.pause();
      btn.textContent = '继续';
      setStatus('会议已暂停，可输入导演指令后点「继续」');
    }
  }

  function init() {
    loadStore();
    renderScenes();
    renderRoles();
    bindStanceMode();
    bindRunMode();
    bindHostInputs();
    bindSpeedControl();
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsModal').addEventListener('click', e => {
      if (e.target && e.target.id === 'settingsModal') closeSettings();
    });
    $('#addRoleBtn').addEventListener('click', addRole);
    $('#startBtn').addEventListener('click', () => {
      if (running) return;
      // 会议已自然结束（engine.done）→ 直接重新开始，不弹确认
      if (engine && engine.transcript.length) {
        if (!engine.done && !confirm('当前会议未完成，确定重新开始？')) return;
      }
      startMeeting();
    });
    $('#resetBtn').addEventListener('click', resetMeeting);
    $('#endBtn').addEventListener('click', endMeeting);
    $('#pauseBtn').addEventListener('click', togglePause);
    $('#exportBtn').addEventListener('click', exportMarkdown);
    $('#compareBtn').addEventListener('click', openCompare);
    $('#compareOverlay').addEventListener('click', e => {
      if (e.target && e.target.id === 'compareOverlay') closeCompare();
    });
    $('#branchBtn').addEventListener('click', () => {
      const p = $('#branchPanel');
      if (p.classList.contains('hidden')) {
        renderBranchPanel();
        p.classList.remove('hidden');
        // 动态定位：面板紧贴按钮下方
        const btn = $('#branchBtn');
        if (btn) {
          const r = btn.getBoundingClientRect();
          // .stage 有 position:relative，面板相对于它定位
          const stage = btn.closest('.stage');
          const sr = stage ? stage.getBoundingClientRect() : { top: 0, left: 0 };
          p.style.top = (r.bottom - sr.top + 6) + 'px';
          p.style.right = 'auto';
          p.style.left = (r.left - sr.left) + 'px';
        }
      } else { p.classList.add('hidden'); pendingSnap = null; }
    });
    $('#directorSend').addEventListener('click', sendDirector);
    $('#directorInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendDirector(); });
    updateHead(state.topic, state.mode, '空闲');

    // ── 菜单栏事件监听（主进程 Menu 通过 webContents.dispatchCustomEvent 触发）──
    const menuActions = {
      'start': () => { if (!running) startMeeting(); },
      'toggle-pause': () => { if (running) togglePause(); },
      'end': () => { if (running) endMeeting(); },
      'reset': resetMeeting,
      'director': sendDirector,
      'export': exportMarkdown,
      'compare': openCompare,
      'branch': () => {
        const p = $('#branchPanel');
        if (p.classList.contains('hidden')) { renderBranchPanel(); p.classList.remove('hidden'); }
        else { p.classList.add('hidden'); pendingSnap = null; }
      },
      'settings': openSettings,
      'history': openHistory,
    };
    Object.entries(menuActions).forEach(([name, fn]) => {
      document.addEventListener('menu:' + name, fn);
    });

    // 菜单速度选择
    document.addEventListener('menu:speed', (e) => {
      const sel = $('#speedSel');
      if (sel) { sel.value = e.detail || 'normal'; sel.dispatchEvent(new Event('change')); }
    });

    // 桌面端：把旧 localStorage 明文密钥加密迁入主进程库，并加载 providers
    migrateLegacyProviders();
    loadProvidersFromMain();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
