/*
 * branch.test.cjs — 验证快照捕获 + fromSnapshot 续写（不重放历史、只追加后续）
 * 运行：node test/branch.test.cjs
 */
const path = require('path');
const base = path.join(__dirname, '..');
const { MockModel } = require(path.join(base, 'src/mock.js'));
const { MeetingEngine } = require(path.join(base, 'src/engine.js'));

const ROLES = [
  { id: 'a', name: '王刚', title: 'CTO', avatar: '🛠️', stance: 'con', personality: '保守', domain: '技术', provider: 'mock', modelName: '' },
  { id: 'b', name: '李娜', title: '业务总监', avatar: '🚀', stance: 'pro', personality: '激进', domain: '业务', provider: 'mock', modelName: '' },
  { id: 'c', name: '老周', title: '安全顾问', avatar: '🛡️', stance: 'con', personality: '理性', domain: '安全', provider: 'mock', modelName: '' },
  { id: 'd', name: '小赵', title: '开发', avatar: '💡', stance: 'neutral', personality: '幽默', domain: '职业', provider: 'mock', modelName: '' }
];

const cfg = () => ({
  topic: '是否转向无代码开发？',
  roles: ROLES.map(r => Object.assign({}, r)),
  host: { name: '张总助', model: 'mock', behavior: 'balanced' },
  mode: 'debate',
  generator: new MockModel(),
  delay: 0
});

function assert(cond, msg) { if (!cond) { console.error('  ✗ ' + msg); process.exitCode = 1; } else { console.log('  ✓ ' + msg); } }

(async () => {
  console.log('== 快照/分支测试 ==');
  const eng = new MeetingEngine(cfg());
  await eng.start();

  const labels = eng.snapshots.map(s => s.label);
  assert(labels.includes('开场后'), '捕获「开场后」快照');
  assert(labels.includes('首轮陈述后'), '捕获「首轮陈述后」快照');
  assert(labels.includes('第1轮辩论后') && labels.includes('第3轮辩论后'), '捕获每轮辩论后快照');
  assert(labels.includes('结束后'), '捕获「结束后」快照');
  assert(eng.snapshots.length >= 6, '快照数量合理（≥6）：' + eng.snapshots.length);

  // 从「首轮陈述后」分支：nextPhase=debate, startDebateIndex=0
  const snap = eng.snapshots.find(s => s.label === '首轮陈述后');
  const historyLen = snap.transcript.length;
  assert(historyLen > 0 && historyLen < eng.transcript.length,
    '分支点历史长度 < 完整记录（' + historyLen + ' < ' + eng.transcript.length + '）');

  const forked = MeetingEngine.fromSnapshot(snap, {
    generator: new MockModel(), delay: 0, onEvent: () => {}, mode: 'debate'
  });
  assert(forked.transcript.length === historyLen, '分支引擎预填历史，不重放');
  const openCountBefore = forked.transcript.filter(e => e.kind === 'host' && e.phase === 'opening').length;
  assert(openCountBefore === 1, '历史中已有 1 条开场，预填正确');

  await forked.start();
  const openCountAfter = forked.transcript.filter(e => e.kind === 'host' && e.phase === 'opening').length;
  assert(openCountAfter === 1, '续写后开场仍只有 1 条（未重放）');
  assert(forked.transcript.length > historyLen, '续写后追加了后续内容（+'
    + (forked.transcript.length - historyLen) + ' 条）');
  assert(forked.done === true, '分支引擎运行至 done');

  // 从「第1轮辩论后」分支：startDebateIndex=1，应跳过第0轮、从首轮起
  const snap2 = eng.snapshots.find(s => s.label === '第1轮辩论后');
  const forked2 = MeetingEngine.fromSnapshot(snap2, {
    generator: new MockModel(), delay: 0, onEvent: () => {}, mode: 'debate'
  });
  const hist2 = snap2.transcript.length;
  await forked2.start();
  const debateRounds2 = forked2.transcript.filter(e => e.phase === 'debate' && e.kind === 'speech').length;
  assert(forked2.transcript.length > hist2, '分支2 也成功续写（+'
    + (forked2.transcript.length - hist2) + ' 条）');
  assert(debateRounds2 > 0, '分支2 产生了辩论发言（' + debateRounds2 + ' 条）');

  // 终端快照不可再分支
  const endSnap = eng.snapshots.find(s => s.label === '结束后');
  assert(endSnap.nextPhase === null, '「结束后」为终端快照（nextPhase=null）');

  console.log(process.exitCode ? '\n结果：有失败项 ❌' : '\n结果：全部通过 ✅');
})();
