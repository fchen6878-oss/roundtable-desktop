/*
 * test.js — 端到端验证（无需浏览器 / 无需 API key）
 * 用 node 跑通整场会议，断言各阶段齐全、transcript 非空、无异常抛出。
 */
const { MeetingEngine } = require('../src/engine.js');
const { MockModel } = require('../src/mock.js');

const roles = [
  { id: 'cto', name: '王刚', title: 'CTO', avatar: '🛠️', stance: 'con',
    personality: '保守', domain: '技术架构与可维护性', model: 'claude-sonnet-3.5' },
  { id: 'biz', name: '李娜', title: '业务总监', avatar: '🚀', stance: 'pro',
    personality: '激进', domain: '业务增长与市场', model: 'gpt-4o' },
  { id: 'sec', name: '老周', title: '安全顾问', avatar: '🛡️', stance: 'con',
    personality: '理性', domain: '安全合规与数据', model: 'gemini-1.5-pro' },
  { id: 'dev', name: '小赵', title: '一线开发', avatar: '💡', stance: 'neutral',
    personality: '幽默', domain: '职业发展与团队', model: '本地-llama3-70b' }
];

async function run(mode) {
  const transcript = [];
  const engine = new MeetingEngine({
    topic: '我们公司是否应该立刻全面转向无代码开发？',
    roles: roles,
    host: { name: '张总助', model: 'gpt-4o', behavior: 'balanced' },
    mode: mode,
    generator: new MockModel(),
    delay: 0,
    onEvent: (ev) => { if (ev && ev.kind) transcript.push(ev); }
  });
  await engine.start();

  // 断言
  const phases = transcript.map(e => e.phase);
  const hasOpening = phases.includes('opening');
  const hasRound1 = transcript.filter(e => e.phase === 'round1').length === roles.length;
  const hasDebate = transcript.some(e => e.phase === 'debate');
  const hasSummary = phases.includes('summary');
  const speeches = transcript.filter(e => e.kind === 'speech');
  const allHaveText = speeches.every(s => s.text && s.text.length > 0);

  console.log('\n===== 模式: ' + mode + ' =====');
  console.log('总事件数:', transcript.length, '| 发言数:', speeches.length);
  console.log('阶段检查 opening/round1(' + roles.length + ')/debate/summary:',
    hasOpening, hasRound1, hasDebate, hasSummary);
  console.log('所有发言均有文本:', allHaveText);
  console.log('计票:', mode === 'decision' ? engine.tally() : '(非决策模式跳过)');

  if (!hasOpening || !hasRound1 || !hasDebate || !hasSummary || !allHaveText) {
    throw new Error('[FAIL] ' + mode + ' 阶段不完整或文本缺失');
  }
  return transcript;
}

(async () => {
  for (const m of ['brainstorm', 'socratic', 'debate', 'decision']) {
    await run(m);
  }
  // 抽样打印一场辩论的 transcript，肉眼检查"像不像圆桌"
  const t = await (async () => {
    const out = [];
    const e = new MeetingEngine({
      topic: '我们公司是否应该立刻全面转向无代码开发？',
      roles: roles, host: { name: '张总助' }, mode: 'debate',
      generator: new MockModel(), delay: 0,
      onEvent: (ev) => { if (ev && ev.kind) out.push(ev); }
    });
    await e.start();
    return out;
  })();
  console.log('\n===== 抽样 transcript（debate 模式）=====');
  t.forEach(ev => {
    if (ev.kind === 'host') {
      console.log('🎬 [' + ev.name + '] ' + ev.text.replace(/\n/g, ' '));
    } else if (ev.kind === 'speech') {
      console.log(ev.avatar + ' ' + ev.name + '(' + ev.title + '/' + ev.model + '): ' + ev.text);
    }
  });
  console.log('\n[PASS] 全部模式跑通 ✓');
})().catch(e => { console.error(e); process.exit(1); });
