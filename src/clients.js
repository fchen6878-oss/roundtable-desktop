/*
 * clients.js — 真实模型客户端层（OpenAI / Anthropic / Ollama）
 * 暴露 window.ModelRouter：统一契约 generate(role, ctx) -> { text, fallback }
 * - 未配置密钥 / 调用失败 / 处于模拟模式：自动回退 MockModel，并在 fallback 中说明原因。
 * - 真实模式下每个角色可按 role.provider 路由到不同厂商；同一场会议可混用真实与模拟。
 * 接真实模型只需替换这一层，engine.js 与 ui.js 不变。
 */
(function () {
  'use strict';

  const DEFAULT_MODELS = {
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    ollama: 'llama3'
  };

  // 是否运行在 Electron 桌面客户端中（桌面端用 app:// 协议，不受 file:// 的 CORS 限制）
  function isElectron() {
    return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
  }

  // 从角色投票文本中解析其最终立场（自由模式下用于把"自行形成的态度"写回角色）
  function parseStance(text) {
    const t = (text || '').toLowerCase();
    if (t.indexOf('赞成') >= 0 || t.indexOf('支持') >= 0) return 'pro';
    if (t.indexOf('反对') >= 0) return 'con';
    if (t.indexOf('弃权') >= 0 || t.indexOf('保留') >= 0) return 'neutral';
    return null;
  }

  function postJSON(url, headers, body, timeoutMs, onStatus) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
    if (onStatus) onStatus('请求已发出，等待响应…');
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: ctrl.signal
    }).then(function (res) {
      return res.text().then(function (txt) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + txt.slice(0, 200));
        try { return JSON.parse(txt); } catch (e) { throw new Error('非 JSON 响应：' + txt.slice(0, 120)); }
      });
    }).finally(function () { clearTimeout(t); });
  }

  function respSnippet(d) {
    try { return JSON.stringify(d); } catch (e) { return String(d); }
  }
  // 正文为空时的诊断信息：带上 finish_reason 与实际回包片段，便于定位"返回为空"的根因
  function emptyErr(provider, d) {
    let fr = '';
    try {
      if (provider === 'openai' && d.choices && d.choices[0]) fr = ' finish_reason=' + (d.choices[0].finish_reason || '?');
      else if (provider === 'anthropic') fr = ' stop_reason=' + (d.stop_reason || '?');
    } catch (e) {}
    return '返回为空（content 为空' + fr + '）；应答片段：' + respSnippet(d).slice(0, 320);
  }

  function callOpenAI(cfg, messages, opts, onStatus) {
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    return postJSON(url, {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey
    }, {
      model: opts.model,
      messages: messages,
      temperature: opts.temperature,
      max_tokens: opts.max_tokens
    }, opts.timeout, onStatus).then(function (d) {
      const c = d.choices && d.choices[0];
      if (!c) throw new Error(emptyErr('openai', d));
      let text = (c.message && c.message.content) || (c.delta && c.delta.content) || c.text || '';
      text = (text || '').toString().trim();
      if (!text) throw new Error(emptyErr('openai', d));
      return text;
    });
  }

  function callAnthropic(cfg, system, messages, opts, onStatus) {
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/v1/messages';
    return postJSON(url, {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01'
    }, {
      model: opts.model,
      system: system,
      max_tokens: opts.max_tokens,
      temperature: opts.temperature,
      messages: messages
    }, opts.timeout, onStatus).then(function (d) {
      const c = d.content && d.content[0];
      let text = c ? (c.text || '') : '';
      text = (text || '').toString().trim();
      if (!text) throw new Error(emptyErr('anthropic', d));
      return text;
    });
  }

  function callOllama(cfg, messages, opts, onStatus) {
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/api/chat';
    return postJSON(url, { 'Content-Type': 'application/json' }, {
      model: opts.model,
      messages: messages,
      stream: false,
      options: { temperature: opts.temperature }
    }, opts.timeout, onStatus).then(function (d) {
      let text = (d.message && d.message.content) || '';
      text = (text || '').toString().trim();
      if (!text) throw new Error('返回为空（content 为空）；应答片段：' + respSnippet(d).slice(0, 320));
      return text;
    });
  }

  // 把角色人设 + 上下文拼成 messages
  // mode: 'free'（自由发挥，不预设立场）| 'scripted'（制式辩论，显式声明立场）
  function personaSystem(role, mode) {
    if (mode === 'free') {
      return '你是圆桌会议中的角色「' + role.name + '」，头衔：' + (role.title || '') + '。\n' +
        '请从你的专业领域「' + (role.domain || '通用') + '」出发，对议题形成你自己的独立判断。\n' +
        '你可以赞成、反对或持保留意见，关键是给出有说服力的理由与前提；不要预设站队，让观点在讨论中自然展开。\n' +
        '请用第一人称、口语化、简洁（1-2 段），只讲你最有力的一个观点，不要替其他角色代言，不要使用 Markdown 标题。';
    }
    const st = { pro: '支持', con: '反对', neutral: '中立' }[role.stance] || '中立';
    return '你是圆桌会议中的角色「' + role.name + '」，头衔：' + (role.title || '') + '。\n' +
      '你的立场：' + st + '。性格风格：' + (role.personality || '理性') + '。专业领域：' + (role.domain || '通用') + '。\n' +
      '请用第一人称、口语化、简洁（1-2 段），只讲你最有力的一个观点，不要替其他角色代言，不要使用 Markdown 标题。';
  }
  function buildMessages(role, ctx, mode) {
    const sys = personaSystem(role, mode);
    let user;
    if (ctx.move === 'open') {
      user = '议题：「' + ctx.topic + '」。请发表你的核心观点（开场陈述）。';
    } else if (ctx.move === 'vote') {
      if (mode === 'free') {
        user = '议题：「' + ctx.topic + '」。请明确亮明你的最终态度，并在开头用【赞成】/【反对】/【弃权】标注，' +
          '简述你的核心前提与理由。';
      } else {
        user = '议题：「' + ctx.topic + '」。请亮明态度（赞成 / 反对 / 弃权），并给出你的前提条件。';
      }
    } else {
      let tail = '';
      const last = ctx.lastSpeaker;
      if (last) tail = last.name + '（' + (last.title || '') + '）刚才说：「' + (last.text || '').slice(0, 120) + '」。请针对其观点回应（赞同则补充，反对则指出问题）。';
      user = '议题：「' + ctx.topic + '」。' + tail;
    }
    return [{ role: 'system', content: sys }, { role: 'user', content: user }];
  }

  function fallbackText(role, ctx) {
    // 回退到模拟：依赖全局 MockModel
    if (typeof MockModel !== 'undefined') return new MockModel().generate(role, ctx);
    return { text: role.name + '：暂无法生成（未配置模拟层）。', fallback: null };
  }

  class ModelRouter {
    constructor(providers, mode, opts) {
      this.providers = providers || {};
      this.mode = mode || 'mock';           // 'mock' | 'real'
      this.discussionMode = (opts && opts.discussionMode) || 'free'; // 'free' | 'scripted'
      this.proxyEnabled = !!(opts && opts.proxyEnabled);
      this.proxyBase = (opts && opts.proxyBase) || 'http://localhost:8787';
      this.onStatus = (opts && opts.onStatus) || function () {};
      this.timeout = (opts && opts.timeout) || 60000;
      // 全局 max_tokens 保底：推理模型（Kimi/DeepSeek 等）的思考 token 也吃此预算，
      // 若太小会 finish_reason=length 且 content 为空；4096 足以容纳普通回答+少量思考。
      this.maxTokens = (opts && opts.maxTokens) || 4096;
    }

    _cfg(provider) {
      const raw = this.providers[provider] || {};
      const cfg = Object.assign({}, raw);
      cfg.defaultModel = raw.defaultModel || DEFAULT_MODELS[provider] || '';
      // 透明代理：仅当开启代理、且 baseUrl 指向官方域名时，才路由到本地代理以规避 CORS
      if (this.proxyEnabled) {
        const host = (cfg.baseUrl || '').toLowerCase();
        const isOfficial = host.indexOf('api.openai.com') >= 0 || host.indexOf('api.anthropic.com') >= 0;
        if (isOfficial) {
          const vendor = host.indexOf('anthropic') >= 0 ? 'anthropic' : 'openai';
          cfg.baseUrl = this.proxyBase + '/' + vendor;
        }
      }
      return cfg;
    }

    generate(role, ctx) {
      const provider = role.provider || 'mock';
      // 模拟模式，或角色明确选模拟 -> 直接走 Mock
      if (this.mode !== 'real' || provider === 'mock') {
        return Promise.resolve(fallbackText(role, ctx));
      }
      const cfg = this._cfg(provider);
      const proto = cfg.protocol || provider;        // 真正决定请求的协议
      const label = cfg.name || provider;            // 友好名（用于回退提示）
      // 运行环境不支持 fetch（极老浏览器）：直接回退
      if (typeof fetch === 'undefined') {
        const fb = fallbackText(role, ctx);
        fb.fallback = '当前环境不支持 fetch，已用模拟兜底';
        return Promise.resolve(fb);
      }
      // 以 file:// 直接打开时，浏览器会因 CORS 静默拦截对外部模型（含本地 ollama）的跨域请求，
      // 与其逐个干等 20s 超时再回退（整场会议看起来"卡死"），不如立即明确回退模拟。
      // 启用代理（proxy.js）或改用 http 服务打开本页时不会触发此短路。
      if (typeof location !== 'undefined' && location.protocol === 'file:' && !this.proxyEnabled && !isElectron()) {
        const fb = fallbackText(role, ctx);
        fb.fallback = '检测到以 file:// 打开且未启用代理：浏览器会拦截对「' + label + '」的请求（CORS），已直接回退模拟。' +
          '如需真实模型，请运行 proxy.js（仅官方 OpenAI/Anthropic 域名）或改用 http 服务打开本页。';
        return Promise.resolve(fb);
      }
      // 非本地协议（openai / anthropic 兼容）必须有 key
      if (proto !== 'ollama' && !cfg.apiKey) {
        const fb = fallbackText(role, ctx);
        fb.fallback = '未配置「' + label + '」的 API Key，已用模拟兜底';
        return Promise.resolve(fb);
      }
      // 模型名：内置厂商可走默认值；自定义厂商（key 形如 c_xxx）无默认值，必须填写
      const model = role.modelName || cfg.defaultModel;
      if (!model) {
        const fb = fallbackText(role, ctx);
        fb.fallback = '「' + label + '」未填写模型名，已用模拟兜底';
        return Promise.resolve(fb);
      }
      const msgs = buildMessages(role, ctx, this.discussionMode);
      const temperature = (typeof cfg.temperature === 'number') ? cfg.temperature : 0.85;
      // 超时：优先用厂商级配置（如 Kimi 默认 90s），否则回退全局默认
      const effectiveTimeout = (typeof cfg.timeout === 'number' && cfg.timeout > 0) ? cfg.timeout : this.timeout;
      // 输出上限：推理模型（Kimi/DeepSeek 等）思考 token 也吃此预算，优先用厂商级 maxTokens（如 8192），否则全局保底 4096
      const effectiveMax = (typeof cfg.maxTokens === 'number' && cfg.maxTokens > 0) ? cfg.maxTokens : this.maxTokens;
      const opts = {
        model: model,
        temperature: temperature, max_tokens: effectiveMax, timeout: effectiveTimeout
      };
      const status = (msg) => this.onStatus('⏳ ' + label + '（' + model + '）：' + msg);
      let p;
      if (proto === 'openai') { status('正在调用'); p = callOpenAI(cfg, msgs, opts, status); }
      else if (proto === 'anthropic') {
        const sys = msgs.shift().content;
        status('正在调用'); p = callAnthropic(cfg, sys, msgs, opts, status);
      } else if (proto === 'ollama') { status('正在调用'); p = callOllama(cfg, msgs, opts, status); }
      else p = Promise.reject(new Error('未知协议 ' + proto));

      return p.then(function (text) {
        if (!text) throw new Error('返回为空');
        // 投票环节：从真实模型返回文本中解析其最终立场（自由模式下尤为关键）
        const stance = ctx.move === 'vote' ? parseStance(text) : null;
        return { text: text, stance: stance, fallback: null };
      }).catch(function (e) {
        const fb = fallbackText(role, ctx);
        fb.fallback = label + ' 调用失败（' + (e && e.message ? e.message : e) + '），已用模拟兜底';
        return fb;
      });
    }
  }

  const api = { ModelRouter: ModelRouter, DEFAULT_MODELS: DEFAULT_MODELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.ModelRouter = ModelRouter; window.DEFAULT_MODELS = DEFAULT_MODELS; }
})();
