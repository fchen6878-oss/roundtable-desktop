/*
 * discussionmode.test.cjs — 验证「自由发挥」vs「制式辩论」两种角色态度模式
 *  - 自由模式：引擎自动分配立场、投票环捕获、按领域差异配对发言人
 *  - 制式辩论：保留用户设定的立场、按对立立场配对发言人
 */
const { MeetingEngine } = require('../src/engine.js');
const { MockModel } = require('../src/mock.js');

function mkRoles() {
  return [
    { id: 'a', name: 'A', title: 'T', avatar: '🙂', stance: 'con', personality: '理性', domain: '技术', model: 'm' },
    { id: 'b', name: 'B', title: 'T', avatar: '🙂', stance: 'pro', personality: '理性', domain: '业务', model: 'm' },
    { id: 'c', name: 'C', title: 'T', avatar: '🙂', stance: 'neutral', personality: '理性', domain: '安全', model: 'm' },
    { id: 'd', name: 'D', title: 'T', avatar: '🙂', stance: 'pro', personality: '理性', domain: '职业', model: 'm' }
  ];
}

// 自由模式：决策会跑完后，每个角色都应有合法立场（来自投票捕获），且计票非空
function runFreeDecision() {
  return new Promise((resolve, reject) => {
    const transcript = [];
    const eng = new MeetingEngine({
      topic: 'X', roles: mkRoles(), mode: 'decision', discussionMode: 'free',
      generator: new MockModel(), delay: 0,
      onEvent: ev => { if (ev && ev.kind) transcript.push(ev); }
    });
    eng.start().then(() => {
      const valid = eng.roles.every(r => ['pro', 'con', 'neutral'].includes(r.stance));
      const votes = transcript.filter(e => e.vote);
      if (!valid) return reject(new Error('自由模式：角色立场非法'));
      if (votes.length !== 4) return reject(new Error('自由模式：应收集 4 张票，实际 ' + votes.length));
      if (!/赞成/.test(eng.tally())) return reject(new Error('自由模式：计票异常'));
      console.log('[OK] 自由模式：自动分配立场 + 投票捕获 + 计票（' + eng.tally() + '）');
      resolve();
    }).catch(reject);
  });
}

// 制式辩论：pickDebater 应优先挑对立立场者（a 预设 con，对立者为 pro）
function runScriptedPick() {
  const eng = new MeetingEngine({
    topic: 'X', roles: mkRoles(), mode: 'debate', discussionMode: 'scripted',
    generator: new MockModel(), delay: 0
  });
  const sel = eng.pickDebater('a'); // a 预设 con
  const r = eng.roleById(sel.speakerId);
  if (r.stance !== 'pro') throw new Error('制式辩论：应优先挑 pro 立场者，实际 ' + r.stance);
  console.log('[OK] 制式辩论：pickDebater 优先挑对立立场（' + sel.speakerId + '/' + r.stance + '）');
}

// 自由模式：pickDebater 应优先挑不同领域者（视角碰撞），而非立场对立
function runFreePick() {
  const eng = new MeetingEngine({
    topic: 'X', roles: mkRoles(), mode: 'debate', discussionMode: 'free',
    generator: new MockModel(), delay: 0
  });
  const sel = eng.pickDebater('a'); // a 领域=技术
  const r = eng.roleById(sel.speakerId);
  if (r.domain === '技术') throw new Error('自由模式：应优先挑不同领域者，却挑了同领域');
  console.log('[OK] 自由模式：pickDebater 优先挑不同领域（' + sel.speakerId + '/' + r.domain + '）');
}

(async () => {
  try {
    runScriptedPick();
    runFreePick();
    await runFreeDecision();
    console.log('\n[PASS] 角色态度模式（自由/制式）校验通过 ✓');
  } catch (e) {
    console.error('[FAIL]', e);
    process.exit(1);
  }
})();
