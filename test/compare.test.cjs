/*
 * compare.test.cjs — 验证观点碰撞图提取 + 跨分支分歧标注（纯逻辑，node 直接跑）
 * 运行：node test/compare.test.cjs
 */
const path = require('path');
const base = path.join(__dirname, '..');
const { MockModel } = require(path.join(base, 'src/mock.js'));
const { MeetingEngine } = require(path.join(base, 'src/engine.js'));
const { collisionFor, compareBranches, collisionSVG } = require(path.join(base, 'src/compare.js'));

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

function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); process.exitCode = 1; }
  else { console.log('  ✓ ' + msg); }
}

(async () => {
  console.log('== 观点碰撞图 / 分支对比测试 ==');

  const eng = new MeetingEngine(cfg());
  await eng.start();
  const snap = eng.snapshots.find(s => s.label === '第1轮辩论后');
  const forked = MeetingEngine.fromSnapshot(snap, { generator: new MockModel(), delay: 0, onEvent: () => {}, mode: 'debate' });
  await forked.start();

  // 1) collisionFor 提取
  const coll = collisionFor(eng.transcript, ROLES);
  assert(coll.nodes.length === ROLES.length, 'collisionFor 为每个角色生成一个节点（' + coll.nodes.length + '）');
  assert(coll.edges.length === ROLES.length * (ROLES.length - 1) / 2, '立场对齐边数量 = n*(n-1)/2（' + coll.edges.length + '）');
  assert(coll.nodes.every(n => 'openingText' in n && 'lastText' in n && 'voteText' in n), '每个节点含 开场/末轮/投票 指纹字段');
  assert(coll.edges.every(e => (e.aligned && e.a && e.b) || (!e.aligned && e.a && e.b)), '每条边含 aligned 标记与两端 id');

  // 2) collisionSVG 生成
  const svg = collisionSVG(coll, new Set(['a']), '主线');
  assert(typeof svg === 'string' && svg.indexOf('<svg') === 0, 'collisionSVG 返回以 <svg 开头的字符串');
  assert(ROLES.every(r => svg.indexOf(escName(r.name)) >= 0), 'SVG 包含全部角色名');
  assert(svg.indexOf('反对') >= 0 && svg.indexOf('支持') >= 0, 'SVG 含立场轴标签（反对/支持）');
  assert(svg.indexOf('#f59e0b') >= 0, '分歧角色(王刚)被琥珀色环高亮');

  // 3) compareBranches：主线 vs 分支（不同 transcript）
  const cmp = compareBranches([
    { id: 'm', label: '主线', transcript: eng.transcript, director: null },
    { id: 'f', label: '分支1', transcript: forked.transcript, director: '请让安全顾问主导' }
  ], ROLES);
  assert(cmp.rows.length === ROLES.length, 'compareBranches 行数 = 角色数');
  assert(cmp.rows.every(r => 'diverged' in r && r.byBranch.m && r.byBranch.f), '每行含 diverged 标志与两条分支的视图');
  assert(Array.isArray(cmp.divergedRoles), 'divergedRoles 为数组');
  assert(cmp.divergedRoles.length > 0, '主线 vs 分支 出现了分歧角色（' + cmp.divergedRoles.length + ' 个）');

  // 4) 相同 transcript 副本 => 无分歧（确定性断言）
  const same = compareBranches([
    { id: 'x', label: '副本A', transcript: eng.transcript },
    { id: 'y', label: '副本B', transcript: eng.transcript }
  ], ROLES);
  assert(same.divergedRoles.length === 0, '两份相同 transcript 时 divergedRoles 为空（' + same.divergedRoles.length + '）');

  // 5) 仅 1 条分支 => 直接返回（不抛错，rows 仍按角色生成）
  const one = compareBranches([{ id: 'm', label: '主线', transcript: eng.transcript }], ROLES);
  assert(one.rows.length === ROLES.length, '单分支时仍按角色生成行');

  console.log(process.exitCode ? '\n结果：有失败项 ❌' : '\n结果：全部通过 ✅');
})();

function escName(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
