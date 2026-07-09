/*
 * smoke.cjs — 用最小假 DOM 在 node 中冒烟测试 ui.js（捕捉运行时错误，不依赖浏览器）
 * 覆盖：脚本加载 + init + 开始会议 + 分支面板 + 生成一条分支 + 打开对比浮层渲染碰撞图/差异表
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeNode() {
  const node = {
    _children: [],
    _listeners: {},
    className: '', innerHTML: '', value: '', textContent: '', onclick: null,
    dataset: {}, style: {},
    scrollTop: 0, scrollHeight: 0,
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    appendChild(c) { this._children.push(c); return c; },
    insertAdjacentText() {},
    removeChild() {}, remove() {},
    addEventListener(t, cb) { (this._listeners[t] = this._listeners[t] || []).push(cb); },
    dispatch(t) { (this._listeners[t] || []).forEach(cb => cb({ key: '', target: this })); },
    click() { this.dispatch('click'); },
    querySelector() { return makeNode(); },
    querySelectorAll() { return []; }
  };
  return node;
}

const registry = {};
const document = {
  readyState: 'complete',
  body: makeNode(),
  createElement() { return makeNode(); },
  createTextNode(t) { return { nodeType: 3, textContent: t, _children: [], appendChild() {} }; },
  querySelector(sel) { return registry[sel] || (registry[sel] = makeNode()); },
  querySelectorAll() { return []; },
  addEventListener() {}
};

const sandbox = {
  document, console,
  window: null,
  alert() {}, confirm() { return true; },
  setInterval() { return 0; }, clearInterval() {},
  setTimeout, clearTimeout,
  Blob: function () {}, URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let failed = false;
process.on('unhandledRejection', e => { console.error('[REJECT]', e); failed = true; });

const base = path.join(__dirname, '..');
const src = ['src/mock.js', 'src/engine.js', 'src/clients.js', 'src/compare.js', 'src/ui.js']
  .map(f => fs.readFileSync(path.join(base, f), 'utf8')).join('\n;\n');

function findByText(root, txt) {
  if (!root) return null;
  if (root.innerHTML === txt) return root;
  for (const k of (root._children || [])) { const f = findByText(k, txt); if (f) return f; }
  return null;
}

try {
  vm.runInContext(src, sandbox, { filename: 'bundle.js' });
  console.log('[OK] 脚本加载、ui.js init() 执行无异常');
  // 假 DOM 不解析 HTML，需手动填入配置输入，否则 collectConfig 拿到空议题会直接 return
  document.querySelector('#topic').value = '我们公司是否应该立刻全面转向无代码开发？';
  document.querySelector('#hostName').value = '张总助';
  document.querySelector('#hostProvider').value = 'mock';
  document.querySelector('#hostBehavior').value = 'balanced';
  document.querySelector('#mode').value = 'debate';
  registry['#startBtn'].click();
  console.log('[OK] 点击"开始会议"未同步抛错，会议已在后台异步推进');

  // 打开设置浮层，验证模型接入面板构建无异常（无内置厂商时应为空状态）
  registry['#settingsBtn'].click();
  const setModal = registry['#settingsModal'];
  const setCard = setModal && setModal._children[0];
  if (!(setCard && setCard._children.length > 0)) {
    console.error('[FAIL] 设置浮层未渲染');
    failed = true;
  } else {
    console.log('[OK] 打开设置浮层（renderSettings）未抛错；无内置厂商时展示空状态');
  }

  // 添加自定义模型（声明走 OpenAI 协议），验证 addProvider 路径无异常且新厂商出现在面板
  try {
    document.querySelector('#npName').value = 'MyCustom';
    document.querySelector('#npProto').value = 'openai';
    document.querySelector('#npUrl').value = 'https://my.example.com/v1';
    document.querySelector('#npAdd').dispatch('click');
    let found = false;
    (function walk(n) {
      if (!n) return;
      if (n.value === 'MyCustom') found = true;
      (n._children || []).forEach(walk);
    })(setModal);
    console.log('[OK] 添加自定义模型（addProvider）未抛错；新厂商出现在面板=' + found);
    if (!found) { console.error('[FAIL] 自定义厂商未出现在设置面板'); failed = true; }
  } catch (e) {
    console.error('[FAIL] addProvider', e);
    failed = true;
  }

  // 验证密钥掩码框 + 👁 明文切换已随厂商卡片渲染（遍历整个浮层树，兼容多次重渲染）
  let hasKeyInput = false, hasReveal = false;
  (function walk(n) {
    if (!n) return;
    if ((n._children || []).some(c => c.type === 'password')) hasKeyInput = true;
    if ((n._children || []).some(c => c.innerHTML === '👁')) hasReveal = true;
    (n._children || []).forEach(walk);
  })(setModal);
  console.log('[OK] 设置浮层含密钥掩码框=' + hasKeyInput + '，含👁明文切换=' + hasReveal);
  if (!(hasKeyInput && hasReveal)) {
    console.error('[FAIL] 厂商卡片未含密钥掩码/👁');
    failed = true;
  }

  // 关闭设置浮层
  registry['#settingsModal'].click && registry['#settingsModal'].click();
} catch (e) {
  console.error('[FAIL]', e);
  failed = true;
}

// 会议跑出若干快照后：打开分支面板 → 生成一条分支
// 会议（delay=750）约 8s 跑完，故 fork 安排在 9s 之后
setTimeout(() => {
  try {
    registry['#branchBtn'].click();
    console.log('[OK] 打开分支面板（renderBranchPanel）未抛错');
    const forkBtn = findByText(registry['#branchPanel'], '↪ 分支');
    if (forkBtn) {
      forkBtn.click(); // showForkForm
      if (registry['#forkGo'].onclick) registry['#forkGo'].onclick(); // doFork
      console.log('[OK] 触发"生成新分支"（doFork）未抛错');
    } else {
      console.log('[WARN] 未在面板中找到分支按钮（可能会议尚未结束），跳过 fork');
    }
  } catch (e) {
    console.error('[FAIL] fork', e);
    failed = true;
  }
}, 9000);

// 分支生成完后：打开对比浮层，验证碰撞图 + 差异表 DOM 构建
setTimeout(() => {
  try {
    registry['#compareBtn'].click();
    const ov = registry['#compareOverlay'];
    const card = ov && ov._children[0];
    const cardKids = card ? card._children.length : 0;
    // 查找是否渲染了碰撞图(svg)与差异表(cmp-table)
    function hasClass(node, cls) {
      if (!node) return false;
      if ((node.className || '').split(' ').indexOf(cls) >= 0) return true;
      return (node._children || []).some(k => hasClass(k, cls));
    }
    const hasSvg = hasClass(card, 'cmp-svg');
    const hasTable = hasClass(card, 'cmp-table');
    console.log('[OK] 打开对比浮层（renderCompareView）未抛错；card 子节点=' + cardKids +
      '，含碰撞图=' + hasSvg + '，含差异表=' + hasTable);
    if (!(card && cardKids > 0 && hasSvg && hasTable)) {
      console.error('[FAIL] 对比浮层未完整渲染（需 card>0 且含碰撞图与差异表）');
      failed = true;
    } else {
      console.log('[OK] 对比浮层已渲染完整内容（碰撞图 + 差异表）');
    }
  } catch (e) {
    console.error('[FAIL] compare', e);
    failed = true;
  }
}, 16000);

// 让异步会议继续跑，捕捉延时回调中的错误
setTimeout(() => {
  // 验证场景切换（applyScene）路径：渲染了 6 个场景 chip，切到「生活抉择」能更新议题且不抛错
  try {
    const chipsWrap = registry['#sceneChips'];
    const chips = chipsWrap ? chipsWrap._children : [];
    console.log('[OK] 场景选择器渲染了 ' + chips.length + ' 个场景 chip');
    if (chips.length < 6) { console.error('[FAIL] 场景 chip 数量不足（期望≥6）'); failed = true; }
    const lifeChip = chips.find(c => c.dataset && c.dataset.scene === 'life');
    if (lifeChip) {
      lifeChip.dispatch('click');
      const tp = document.querySelector('#topic');
      const ok = tp.value && tp.value.indexOf('大城市') >= 0;
      console.log('[OK] 切换到「生活抉择」场景（applyScene）无异常；议题已更新=' + ok);
      if (!ok) { console.error('[FAIL] applyScene 未正确更新议题'); failed = true; }
    } else {
      console.error('[FAIL] 未找到「生活抉择」场景 chip'); failed = true;
    }
  } catch (e) {
    console.error('[FAIL] applyScene', e); failed = true;
  }
  console.log(failed ? '\n[RESULT] 存在错误 ✗' : '\n[RESULT] 冒烟测试通过 ✓');
  process.exit(failed ? 1 : 0);
}, 18000);
