/*
 * mock.test.cjs — 验证「场景去技术化」：领域映射覆盖多场景，且各场景发言能命中专属词库（非 general 套话）
 */
const mock = require('../src/mock.js');
const { MockModel, domainBank } = mock;

let failed = false;
let passed = 0;
function check(cond, msg) {
  if (cond) { passed++; console.log('  [PASS] ' + msg); }
  else { console.error('  [FAIL] ' + msg); failed = true; }
}

console.log('== 领域映射（domainBank）覆盖多场景 ==');
const cases = [
  ['技术架构', 'tech'], ['业务增长', 'biz'], ['安全合规', 'sec'],
  ['职业发展', 'career'], ['产品设计与体验', 'product'], ['品牌推广', 'marketing'],
  ['家庭教育', 'edu'], ['健康饮食', 'health'], ['投资理财', 'finance'],
  ['亲密关系', 'relation'], ['生活与消费', 'life'], ['完全无关的乱码xyz', 'general']
];
cases.forEach(([d, exp]) => {
  const got = domainBank(d);
  check(got === exp, `domainBank('${d}') = '${got}' (期望 '${exp}')`);
});

console.log('== 各场景角色发言命中专属词库（非 general 套话） ==');
const m = new MockModel();
const GENERAL_MARKERS = ['方向上我支持', '风险不小，我建议缓一缓', '我理解你的出发点，但前提可能不成立', '可以小步快跑，边做边看'];
const scenes = {
  edu:     { domain: '家庭教育与升学', title: '家长', stance: 'pro', personality: '温和', name: '王妈妈' },
  finance: { domain: '投资理财与资产配置', title: '理财顾问', stance: 'pro', personality: '理性', name: '陈老师' },
  life:    { domain: '职业发展与生活选择', title: '北漂青年', stance: 'pro', personality: '激进', name: '小北' },
  relation:{ domain: '亲密关系与沟通', title: '伴侣B', stance: 'pro', personality: '理性', name: '阿成' },
  product: { domain: '产品设计与用户体验', title: '产品负责人', stance: 'con', personality: '理性', name: '林岚' },
  health:  { domain: '健康与饮食', title: '健身教练', stance: 'pro', personality: '温和', name: '阿康' },
  tech:    { domain: '技术架构与可维护性', title: 'CTO', stance: 'con', personality: '保守', name: '王刚' }
};
Object.keys(scenes).forEach(k => {
  const r = Object.assign({ id: 'x', avatar: '🙂', provider: 'mock' }, scenes[k]);
  const txt = m.generate(r, { move: 'open', topic: '测试议题', lastSpeaker: null }).text;
  check(txt && txt.length > 10, `[${k}] 开场发言有内容: "${txt.slice(0, 36)}…"`);
  const isGeneral = GENERAL_MARKERS.some(g => txt.indexOf(g) >= 0);
  check(!isGeneral, `[${k}] 未退化成 general 套话`);
});

// 辩论环节也应命中专属 counter/add
const r2 = Object.assign({ id: 'y', avatar: '🙂', provider: 'mock' }, scenes.edu);
const ctx = { move: 'debate', topic: '孩子升学', lastSpeaker: { name: '张老师', stance: 'con' } };
const dtxt = m.generate(r2, ctx).text;
check(dtxt && dtxt.indexOf('张老师') >= 0, '[edu] 辩论能针对上一位发言者');
check(!GENERAL_MARKERS.some(g => dtxt.indexOf(g) >= 0), '[edu] 辩论未退化成 general 套话');

console.log('\n' + (failed ? '[RESULT] 存在错误 ✗' : '[RESULT] mock 多场景词库校验通过 ✓'));
process.exit(failed ? 1 : 0);
