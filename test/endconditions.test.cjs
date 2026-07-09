/*
 * endconditions.test.cjs — 会议结束条件验证
 * 1) 达成共识提前收尾：所有角色立场一致时，辩论轮数提前结束并进入总结
 * 2) 混合立场不提前收尾：正常跑满 3 轮辩论
 * 3) 手动 abort 不触发 done 事件（由 UI 的结束/重置按钮接管状态）
 */
const { MeetingEngine } = require('../src/engine.js');
const { MockModel } = require('../src/mock.js');

function mkRoles(stances) {
  const names = ['王刚', '李娜', '老周', '小赵'];
  const titles = ['CTO', '业务总监', '安全顾问', '一线开发'];
  const avs = ['🛠️', '🚀', '🛡️', '💡'];
  return stances.map((s, i) => ({
    id: 'r' + i, name: names[i], title: titles[i], avatar: avs[i],
    stance: s, personality: '理性', domain: '技术' + i, model: 'mock'
  }));
}

async function runToDone(roles, mode) {
  const evs = [];
  const eng = new MeetingEngine({
    topic: 'T', roles, host: { name: 'H', model: 'mock' },
    mode: mode || 'debate', discussionMode: 'scripted',
    generator: new MockModel(), delay: 0,
    onEvent: e => { if (e && e.kind) evs.push(e); }
  });
  await eng.start();
  return { eng, evs };
}

(async () => {
  // 1) 共识提前收尾
  {
    const { eng, evs } = await runToDone(mkRoles(['pro', 'pro', 'pro', 'pro']), 'debate');
    const debateSpeeches = evs.filter(e => e.kind === 'speech' && e.phase === 'debate').length;
    const early = evs.some(e => e.kind === 'host' && /提前进入总结/.test(e.text));
    if (!eng.done) throw new Error('共识场景应正常结束（done=true）');
    if (!early) throw new Error('所有角色立场一致时未触发「提前进入总结」');
    if (debateSpeeches >= 3) throw new Error('共识场景应提前收尾，但辩论轮数=' + debateSpeeches);
    console.log('[OK] 共识提前收尾：辩论 ' + debateSpeeches + ' 轮后收尾（< 3）');
  }

  // 2) 混合立场不提前收尾
  {
    const { eng, evs } = await runToDone(mkRoles(['pro', 'con', 'neutral', 'pro']), 'debate');
    const debateSpeeches = evs.filter(e => e.kind === 'speech' && e.phase === 'debate').length;
    const early = evs.some(e => e.kind === 'host' && /提前进入总结/.test(e.text));
    if (early) throw new Error('混合立场不应触发「提前进入总结」');
    if (debateSpeeches !== 3) throw new Error('混合立场应跑满 3 轮辩论，实际=' + debateSpeeches);
    console.log('[OK] 混合立场不提前收尾：跑满 3 轮辩论');
  }

  // 3) abort 不触发 done 事件
  {
    const evs = [];
    const eng = new MeetingEngine({
      topic: 'T', roles: mkRoles(['pro', 'con']), host: { name: 'H', model: 'mock' },
      mode: 'debate', discussionMode: 'scripted',
      generator: new MockModel(), delay: 0,
      onEvent: e => { if (e && e.kind) evs.push(e); }
    });
    const p = eng.start();   // 同步执行到首个 await 后让出
    eng.abort();              // 在 await 落地前置位 aborted
    await p;
    const doneFired = evs.some(e => e.kind === 'done');
    if (doneFired) throw new Error('abort 不应触发 done 事件');
    if (eng.done) throw new Error('abort 后 engine.done 应为 false');
    console.log('[OK] abort 提前终止：不触发 done 事件（UI 按钮接管收尾）');
  }

  console.log('\n[PASS] 会议结束条件（共识提前收尾 / 手动 abort）校验通过 ✓');
})().catch(e => { console.error('[FAIL] ' + e.message); process.exit(1); });
