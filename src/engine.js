/*
 * engine.js — 圆桌会议编排引擎（真实架构，模型调用被 mock 替换）
 *
 * 设计对齐需求文档：
 *  - 主持人 = 一个独立 Agent（HostController），其"工具"是决议下一个发言人；
 *    每步输出结构化决策 { action:'invite'|'refocus'|'summary', speaker }。
 *  - 角色 = 各自包裹专属人设与模型的 Agent（这里模型由 MockModel 模拟）。
 *  - 状态机：opening -> round1 -> debate(各模式) -> summary -> done。
 *  - 发言权管理：只有被主持人 invite 的角色才生成发言。
 *  - 跑题/重复检测：基于文本重叠率，触发主持人 refocus。
 *  - 导演指令：运行期可随时注入，插入主持人队列并影响其下一步调度。
 */
(function () {
  'use strict';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function segWords(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').split(/\s+/).filter(w => w.length > 1);
  }
  function overlap(a, b) {
    const ta = new Set(segWords(a)), tb = new Set(segWords(b));
    if (!ta.size || !tb.size) return 0;
    let c = 0; ta.forEach(w => { if (tb.has(w)) c++; });
    return c / Math.max(ta.size, tb.size);
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // 从角色投票文本中解析其最终立场（自由模式下用于把"自行形成的态度"写回角色）
  function parseStance(text) {
    const t = (text || '').toLowerCase();
    if (t.indexOf('赞成') >= 0 || t.indexOf('支持') >= 0) return 'pro';
    if (t.indexOf('反对') >= 0) return 'con';
    if (t.indexOf('弃权') >= 0 || t.indexOf('保留') >= 0) return 'neutral';
    return null;
  }

  // 主持人 Agent：负责开场、邀请、控场、追问、总结
  class HostController {
    constructor(cfg) {
      this.name = cfg.name || '主持人';
      this.model = cfg.model || '—';
      this.behavior = cfg.behavior || 'balanced'; // balanced | light | strict
    }
    opening(topic, roles) {
      const list = roles.map(r => r.name + '（' + (r.title || '') + '）').join('、');
      return '各位好，我是本场主持人' + this.name + '。今天我们要围绕议题「' + topic +
        '」展开讨论。出席的嘉宾有：' + list + '。下面先请各位依次阐述核心观点。';
    }
    invite(role, reason) {
      return role.name + '（' + (role.title || '') + '），' + reason + '有请发言。';
    }
    refocus(topic) {
      const ms = [
        '感谢分享。我们拉回议题核心：「' + topic + '」。其他嘉宾对此有何看法？',
        '角度有趣，但请聚焦「' + topic + '」本身。下一位请。',
        '这个方向有点远了，回到「' + topic + '」的正题，有不同意见吗？'
      ];
      return pick(ms);
    }
    probing(role, n) {
      const qs = [
        role.name + '，你立场鲜明。我想追问：如果这件事真的推行，你最担心的第一个具体后果是什么？',
        role.name + '，你的判断基于什么前提？这个前提本身站得住吗？',
        role.name + '，假设反对者是对的，你的方案里哪个环节最先出问题？',
        role.name + '，你愿不愿意给出一个「可被证伪」的判断标准？满足了你才改口？'
      ];
      return qs[n % qs.length];
    }
  }

  // 会议引擎：驱动整场对话的状态机
  class MeetingEngine {
    constructor(opts) {
      this.topic = opts.topic;
      this.roles = opts.roles.map((r, i) => Object.assign({
        id: r.id || ('role' + i), count: 0, lastText: ''
      }, r));
      this.host = new HostController(opts.host || {});
      this.mode = opts.mode || 'debate'; // brainstorm | socratic | debate | decision
      this.discussionMode = opts.discussionMode || 'free'; // 'free' | 'scripted'
      this.generator = opts.generator || opts.mock ||
        (typeof MockModel !== 'undefined' ? new MockModel() : null);
      // 自由模式下不预设立场：自动为每个角色分配一个"潜在倾向"（仅驱动模拟生成与视角碰撞），
      // 但对外不展示、也不写进真实模型 prompt；投票环节再由角色自行亮明最终态度。
      if (this.discussionMode === 'free') {
        const leans = ['pro', 'con', 'neutral'];
        this.roles.forEach((r, i) => {
          r.freeLean = leans[i % leans.length];
          r.stance = r.freeLean; // 自由模式下由引擎自动分配立场（与 freeLean 一致），保证 record/标签一致
        });
      }
      this.transcript = [];
      this.snapshots = [];
      this._snapN = 0;
      this._resume = null;
      this.phase = 'idle';
      this.directorQueue = [];
      this.speakerOrder = shuffle(this.roles.map(r => r.id));
      this.done = false;
      this.onEvent = opts.onEvent || function () {};
      this.delay = (opts.delay != null) ? opts.delay : 650;
      this._socraticTarget = null;
      this.aborted = false;
      this.paused = false;
      this._resumeResolve = null;
    }

    pause() { this.paused = true; }
    resume() {
      this.paused = false;
      if (this._resumeResolve) { this._resumeResolve(); this._resumeResolve = null; }
    }
    async _waitIfPaused() {
      if (this.paused) await new Promise(r => { this._resumeResolve = r; });
    }
    // 统一的 sleep：等待指定时间后，若被暂停则阻塞直到 resume
    async _sleep(ms) {
      await sleep(ms);
      await this._waitIfPaused();
    }

    roleById(id) { return this.roles.find(r => r.id === id); }

    record(role, text, phase, extra) {
      const m = {
        kind: 'speech', roleId: role.id, name: role.name, title: role.title,
        avatar: role.avatar, model: role.model, stance: role.stance, text: text,
        phase: phase, ts: Date.now()
      };
      if (extra) Object.assign(m, extra);
      this.transcript.push(m);
      role.count++; role.lastText = text;
      if (phase === 'debate') role.lastDebateText = text;
      return m;
    }
    hostMsg(text, phase, extra) {
      const m = Object.assign({
        kind: 'host', name: this.host.name, model: this.host.model,
        text: text, phase: phase, ts: Date.now()
      }, extra || {});
      this.transcript.push(m);
      return m;
    }

    // 从指定阶段续跑（fromPhase / startDebateIndex 为 null 时从头跑）。
    // 续跑时 this.transcript 已由调用方预填历史，本方法只追加"后续"，不重放历史。
    async start(fromPhase, startDebateIndex) {
      const PHASES = ['opening', 'round1', 'debate', 'summary'];
      const fp = (fromPhase || (this._resume && this._resume.fromPhase) || 'opening');
      const di = (startDebateIndex != null) ? startDebateIndex
        : (this._resume ? this._resume.startDebateIndex : 0);
      const idx = PHASES.indexOf(fp);
      if (idx < 0) return;

      if (idx <= 0) {
        this.phase = 'opening';
        await this.onEvent(this.hostMsg(this.host.opening(this.topic, this.roles), 'opening'));
        await this._sleep(this.delay);
        if (this.aborted) return;
        this.snapshot('开场后', 'round1', 0);
      }
      if (idx <= 1) {
        this.phase = 'round1';
        for (const id of this.speakerOrder) {
          if (this.aborted) return;
          await this._waitIfPaused();
          const role = this.roleById(id);
          const out = await this.generator.generate(role, { move: 'open', topic: this.topic });
          await this.onEvent(this.record(role, out.text, 'round1', out.fallback ? { fallback: out.fallback } : undefined));
          this.lastSpeakerId = id;
          await this._sleep(this.delay);
        }
        this.snapshot('首轮陈述后', 'debate', 0);
      }
      if (idx <= 2) {
        this.phase = 'debate';
        await this.runDebate(di);
      }
      if (idx <= 3) {
        this.phase = 'summary';
        const summary = this.buildSummary();
        await this.onEvent(this.hostMsg('最后，我做一下总结。\n\n' + summary, 'summary'));
        this.snapshot('结束后', null, 0);
      }

      this.phase = 'done'; this.done = true;
      await this.onEvent({ kind: 'done' });
    }

    async runDebate(startFrom) {
      const rounds = this.mode === 'brainstorm' ? 4 : 3;
      let lastSpeakerId = this.lastSpeakerId || null;
      if (startFrom == null) startFrom = 0;

      for (let i = startFrom; i < rounds; i++) {
        if (this.aborted) return;
        await this._waitIfPaused();
        // —— 导演指令优先消费 ——
        if (this.directorQueue.length) {
          const d = this.directorQueue.shift();
          await this.onEvent(this.hostMsg('[导演指令] ' + d.text, 'debate', { director: true }));
          await this._sleep(this.delay);
          // 若指定了目标角色，主动邀请其针对导演指令发言（而非仅更新 lastSpeakerId 留给下轮随机调度）
          if (d.targetId) {
            const targetRole = this.roleById(d.targetId);
            if (targetRole) {
              // 主持人调度：邀请目标角色
              await this.onEvent(this.hostMsg(
                this.host.invite(targetRole, '收到导演指令，请' + targetRole.name + '就以上要求'),
                'debate', { action: 'invite', speaker: targetRole.id }
              ));
              await this._sleep(this.delay * 0.6);
              // 目标角色发言（以导演指令作为上下文）
              const dout = await this.generator.generate(targetRole, {
                move: 'debate', topic: this.topic,
                directorInstruction: d.text,
                target: this.roleById(lastSpeakerId), lastSpeaker: this.roleById(lastSpeakerId)
              });
              await this.onEvent(this.record(targetRole, dout.text, 'debate', {
                replyTo: lastSpeakerId,
                hostDecision: { action: 'invite', speaker: targetRole.id },
                directorInstruction: d.text,
                fallback: dout.fallback || undefined
              }));
              lastSpeakerId = targetRole.id;
              await this._sleep(this.delay);
            }
          }
        } else if (this.mode === 'socratic') {
          // —— 苏格拉底式：主持人对单一目标连续追问 ——
          const t = this.roleById(this.socraticTarget());
          await this.onEvent(this.hostMsg(this.host.probing(t, i), 'debate', { probe: true,
            action: 'probe', speaker: t.id }));
          await this._sleep(this.delay);
          const last = this.roleById(lastSpeakerId);
          const pout = await this.generator.generate(t, { move: 'probe', topic: this.topic,
            target: last, lastSpeaker: last });
          await this.onEvent(this.record(t, pout.text, 'debate', { replyTo: lastSpeakerId, fallback: pout.fallback || undefined }));
          lastSpeakerId = t.id;
          await this._sleep(this.delay);
        } else {
          // —— 多边辩论 / 头脑风暴 / 决策：主持人挑选下一个发言人 ——
          const sel = this.pickDebater(lastSpeakerId);
          if (sel.refocus) {
            await this.onEvent(this.hostMsg(sel.text, 'debate', { refocus: true, action: 'refocus' }));
            await this._sleep(this.delay);
          } else {
            const role = this.roleById(sel.speakerId);
            const target = this.roleById(lastSpeakerId);
            const out = await this.generator.generate(role, {
              move: 'debate', topic: this.topic, target: target, lastSpeaker: target
            });
            const text = out.text;
            // 重复 / 跑题检测（仅比较该角色在辩论环节内的前后发言）
            if (role.lastDebateText && overlap(text, role.lastDebateText) > 0.5) {
              await this.onEvent(this.hostMsg(this.host.refocus(this.topic), 'debate',
                { refocus: true, action: 'refocus' }));
              await this._sleep(this.delay);
            } else {
              // 主持人邀请（结构化决策透明展示）
              await this.onEvent(this.hostMsg(this.host.invite(role, sel.reason), 'debate',
                { action: 'invite', speaker: role.id }));
              await this._sleep(this.delay * 0.6);
              await this.onEvent(this.record(role, text, 'debate', {
                replyTo: lastSpeakerId, hostDecision: { action: 'invite', speaker: role.id },
                fallback: out.fallback || undefined
              }));
              lastSpeakerId = role.id;
              await this._sleep(this.delay);
            }
          }
        }
        // 每轮结束都捕获快照（无论本轮回合是发言、拉回还是导演指令），保证任意轮次可分支
        this.snapshot('第' + (i + 1) + '轮辩论后', 'debate', i + 1);

        // 达成共识则提前收尾：至少跑完 1 轮，避免一上来就结束
        if (i >= 1 && this.hasConsensus()) {
          await this.onEvent(this.hostMsg('各方立场已趋于一致，提前进入总结。', 'debate'));
          await this._sleep(this.delay);
          return; // 跳出辩论循环，start() 随后进入总结阶段
        }
      }

      // —— 模拟决策会：投票收敛 ——
      if (this.mode === 'decision') {
        await this.onEvent(this.hostMsg('进入决策环节，请各位亮明态度。', 'debate'));
        await this._sleep(this.delay);
        for (const id of this.speakerOrder) {
          if (this.aborted) return;
          await this._waitIfPaused();
          const role = this.roleById(id);
          const out = await this.generator.generate(role, { move: 'vote', topic: this.topic });
          // 把角色亮明的最终立场写回（自由模式下尤为关键：态度由角色自行形成，不再来自预置）
          const declared = (out && out.stance) || (this.discussionMode === 'free' ? parseStance(out && out.text) : null);
          if (declared) role.stance = declared;
          await this.onEvent(this.record(role, out.text, 'debate', { vote: true, fallback: out.fallback || undefined }));
          await this._sleep(this.delay);
        }
        await this.onEvent(this.hostMsg('计票结果：' + this.tally(), 'debate'));
        await this._sleep(this.delay);
        this.snapshot('投票后', 'summary', 0);
      }
    }

    // 捕获一个可分支的快照：记录当前完整 transcript 与恢复所需的引擎状态
    snapshot(label, nextPhase, startDebateIndex) {
      const obj = {
        id: 'snap-' + (this._snapN++),
        label: label,
        nextPhase: nextPhase,
        startDebateIndex: startDebateIndex,
        topic: this.topic,
        mode: this.mode,
        discussionMode: this.discussionMode,
        hostCfg: { name: this.host.name, model: this.host.model, behavior: this.host.behavior },
        roles: JSON.parse(JSON.stringify(this.roles)),
        speakerOrder: this.speakerOrder.slice(),
        lastSpeakerId: this.lastSpeakerId || null,
        socraticTarget: this._socraticTarget,
        transcript: JSON.parse(JSON.stringify(this.transcript)),
        timeline: this.snapshots.slice(),
        ts: Date.now()
      };
      this.snapshots.push(obj);
    }

    // 从某快照创建一个"续写"引擎（预填历史，不重放，只跑 nextPhase 起的后续）
    static fromSnapshot(snap, opts) {
      const eng = new MeetingEngine({
        topic: snap.topic,
        roles: snap.roles.map(r => Object.assign({}, r)),
        host: snap.hostCfg,
        mode: opts.mode || snap.mode,
        discussionMode: opts.discussionMode || snap.discussionMode || 'free',
        generator: opts.generator,
        delay: (opts.delay != null) ? opts.delay : 750,
        onEvent: opts.onEvent
      });
      eng.transcript = JSON.parse(JSON.stringify(snap.transcript));
      eng.speakerOrder = snap.speakerOrder.slice();
      eng.lastSpeakerId = snap.lastSpeakerId;
      eng._socraticTarget = snap.socraticTarget;
      eng.snapshots = (snap.timeline || []).slice();
      eng._snapN = eng.snapshots.length;
      eng._resume = { fromPhase: snap.nextPhase, startDebateIndex: snap.startDebateIndex || 0 };
      return eng;
    }

    socraticTarget() {
      if (this._socraticTarget) return this._socraticTarget;
      // 自由模式下没有预设"反对者"，默认追问首个角色；制式辩论优先追问持反对立场者
      const cands = this.discussionMode === 'scripted'
        ? this.roles.filter(r => r.stance === 'con')
        : this.roles;
      this._socraticTarget = (cands[0] || this.roles[0]).id;
      return this._socraticTarget;
    }

    // 主持人决策：选下一个发言人
    pickDebater(lastSpeakerId) {
      const last = this.roleById(lastSpeakerId);
      let cands = this.roles.filter(r => r.id !== lastSpeakerId);
      if (last) {
        if (this.discussionMode === 'free') {
          // 自由模式：不靠立场对立，而靠"领域差异"制造视角碰撞
          const diff = cands.filter(r => (r.domain || '通用') !== (last.domain || '通用'));
          if (diff.length) cands = diff;
        } else if (this.mode !== 'brainstorm') {
          // 制式辩论：优先挑立场相反者
          const opp = cands.filter(r =>
            r.stance !== last.stance && r.stance !== 'neutral' && last.stance !== 'neutral');
          if (opp.length) cands = opp;
        }
      }
      // 发言最少者优先，避免一人刷屏；平局随机
      cands.sort((a, b) => a.count - b.count);
      const min = cands[0].count;
      const tie = cands.filter(r => r.count === min);
      const role = pick(tie);
      const reason = last ? ('针对' + last.name + '刚才的观点，') : '请进一步展开，';
      return { speakerId: role.id, reason: reason };
    }

    // 是否达成共识：所有角色立场完全一致（至少 2 人）。用于辩论阶段提前收尾。
    hasConsensus() {
      if (this.roles.length < 2) return false;
      const s = this.roles[0].stance;
      return this.roles.every(r => r.stance === s);
    }

    tally() {
      let pro = 0, con = 0, neu = 0;
      this.roles.forEach(r => {
        if (r.stance === 'pro') pro++;
        else if (r.stance === 'con') con++;
        else neu++;
      });
      return '赞成 ' + pro + ' 票，反对 ' + con + ' 票，弃权 ' + neu + ' 票。';
    }

    buildSummary() {
      const pros = this.roles.filter(r => r.stance === 'pro').map(r => r.name);
      const cons = this.roles.filter(r => r.stance === 'con').map(r => r.name);
      const lines = [];
      lines.push('【共识】大多数嘉宾认同：关于「' + this.topic +
        '」，应先小范围试点、用数据驱动决策，而非一刀切全面铺开；速度与质量并非零和，关键在护栏与边界。');
      if (pros.length && cons.length) {
        lines.push('【核心分歧】推动方（' + pros.join('、') + '）强调速度与业务价值；' +
          '审慎方（' + cons.join('、') + '）强调质量、风险与可控性。二者的张力是本次讨论的主线。');
      } else if (pros.length) {
        lines.push('【核心分歧】场上偏乐观，但缺乏对风险与落地成本的具体对冲方案。');
      } else if (cons.length) {
        lines.push('【核心分歧】场上偏审慎，但需给出"如果不做"的代价评估。');
      }
      lines.push('【未解问题】如何界定试点边界？由谁对失败负责？转型中的人与组织成本如何消化？');
      lines.push('【主持结语】感谢各位。议题没有标准答案，但碰撞让盲区显形。建议下一步成立专项小组，' +
        '先定试点范围与护栏，再评估是否扩大。');
      return lines.join('\n');
    }

    // 运行期注入导演指令；targetName 若匹配某角色名，则下一步围绕该角色展开
    director(text, targetName) {
      let targetId = null;
      if (targetName) {
        const t = this.roles.find(r => r.name === targetName ||
          (targetName && r.name.indexOf(targetName) >= 0));
        if (t) targetId = t.id;
      }
      this.directorQueue.push({ text: text, targetId: targetId });
    }

    abort() { this.aborted = true; }
  }

  const api = { MeetingEngine: MeetingEngine, HostController: HostController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.MeetingEngine = MeetingEngine;
    window.HostController = HostController;
  }
})();
