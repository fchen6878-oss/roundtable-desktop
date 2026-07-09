/*
 * clients.test.cjs — 验证 ModelRouter 的路由与降级分支（无需真实网络）
 */
const { MockModel } = require('../src/mock.js');
global.MockModel = MockModel;                 // clients.js 的回退依赖全局 MockModel
const { ModelRouter } = require('../src/clients.js');

function assert(c, m) { if (!c) throw new Error('断言失败: ' + m); }

(async () => {
  // 1) 模拟模式 -> 直接用 Mock，无 fallback
  let r = new ModelRouter({}, 'mock', {});
  let o = await r.generate(
    { name: 'X', stance: 'pro', title: 'T', personality: '理性', domain: '业务', provider: 'mock', modelName: '' },
    { move: 'open', topic: '议题A' });
  assert(o.fallback === null && o.text.length > 0, 'mock 模式应直接用模拟且无 fallback');

  // 2) 真实模式 + openai 无 key -> 回退 + 说明原因
  r = new ModelRouter({ openai: { protocol: 'openai', apiKey: '', baseUrl: 'https://api.openai.com/v1' } }, 'real', {});
  o = await r.generate(
    { name: 'X', stance: 'pro', title: 'T', personality: '理性', domain: '业务', provider: 'openai', modelName: 'gpt-4o' },
    { move: 'open', topic: '议题A' });
  assert(o.fallback && o.fallback.indexOf('未配置') >= 0, 'openai 无 key 应回退并说明');

  // 3) 真实模式 + 有 key，但网络/调用失败 -> 回退 + 说明原因
  global.fetch = () => Promise.reject(new Error('network down'));
  r = new ModelRouter({ openai: { protocol: 'openai', apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1' } }, 'real', {});
  o = await r.generate(
    { name: 'X', stance: 'pro', title: 'T', personality: '理性', domain: '业务', provider: 'openai', modelName: 'gpt-4o' },
    { move: 'open', topic: '议题A' });
  assert(o.fallback && o.fallback.indexOf('调用失败') >= 0, 'openai 调用失败应回退并说明');

  // 4) ollama 调用失败 -> 回退
  r = new ModelRouter({ ollama: { protocol: 'ollama', baseUrl: 'http://localhost:11434' } }, 'real', {});
  o = await r.generate(
    { name: 'Y', stance: 'con', title: 'T', personality: '理性', domain: '技术', provider: 'ollama', modelName: 'llama3' },
    { move: 'open', topic: '议题A' });
  assert(o.fallback && o.fallback.indexOf('调用失败') >= 0, 'ollama 调用失败应回退并说明');

  // 5) 自定义 OpenAI 兼容厂商（无 key）-> 回退并带上自定义名称
  r = new ModelRouter({ c_x9: { name: 'DeepSeek', protocol: 'openai', apiKey: '', baseUrl: 'https://api.deepseek.com/v1' } }, 'real', {});
  o = await r.generate(
    { name: 'Z', stance: 'neutral', title: 'T', personality: '理性', domain: '通用', provider: 'c_x9', modelName: 'deepseek-chat' },
    { move: 'open', topic: '议题A' });
  assert(o.fallback && o.fallback.indexOf('DeepSeek') >= 0 && o.fallback.indexOf('未配置') >= 0, '自定义厂商无 key 应回退并带自定义名');

  // 6) 自定义厂商未填模型名 -> 回退并提示
  global.fetch = () => Promise.reject(new Error('never'));
  r = new ModelRouter({ c_y2: { name: '我的网关', protocol: 'anthropic', apiKey: 'sk-x', baseUrl: 'https://gw.example.com' } }, 'real', {});
  o = await r.generate(
    { name: 'Z', stance: 'neutral', title: 'T', personality: '理性', domain: '通用', provider: 'c_y2', modelName: '' },
    { move: 'open', topic: '议题A' });
  assert(o.fallback && o.fallback.indexOf('我的网关') >= 0 && o.fallback.indexOf('模型名') >= 0, '自定义厂商未填模型名应回退并提示');

  // 7) 厂商级 temperature 配置应透传到请求体（Kimi 等模型要求特定温度）
  let captured;
  global.fetch = (url, init) => { captured = JSON.parse(init.body); return Promise.reject(new Error('stop')); };
  r = new ModelRouter({ kimi: { name: 'Kimi', protocol: 'openai', apiKey: 'sk-x', baseUrl: 'https://api.moonshot.cn/v1', temperature: 1 } }, 'real', {});
  await r.generate(
    { name: 'Z', stance: 'pro', title: 'T', personality: '理性', domain: '通用', provider: 'kimi', modelName: 'moonshot-v1-8k' },
    { move: 'open', topic: '议题A' });
  assert(captured && captured.temperature === 1, '厂商级 temperature=1 应透传，实际=' + (captured && captured.temperature));

  // 8) 未配置 temperature 时默认 0.85
  global.fetch = (url, init) => { captured = JSON.parse(init.body); return Promise.reject(new Error('stop')); };
  r = new ModelRouter({ openai: { protocol: 'openai', apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1' } }, 'real', {});
  await r.generate(
    { name: 'X', stance: 'pro', title: 'T', personality: '理性', domain: '业务', provider: 'openai', modelName: 'gpt-4o' },
    { move: 'open', topic: '议题A' });
  assert(captured && captured.temperature === 0.85, '未配置 temperature 应默认 0.85，实际=' + (captured && captured.temperature));

  // 9) file:// 且未启用代理：外部请求会被 CORS 拦截，应直接回退模拟并说明原因（避免逐个 20s 超时卡死）
  global.location = { protocol: 'file:' };
  r = new ModelRouter({ openai: { protocol: 'openai', apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1' } }, 'real', {});
  o = await r.generate(
    { name: 'X', stance: 'pro', title: 'T', personality: '理性', domain: '业务', provider: 'openai', modelName: 'gpt-4o' },
    { move: 'open', topic: '议题A' });
  delete global.location;
  assert(o.fallback && o.fallback.indexOf('file://') >= 0 && o.fallback.indexOf('CORS') >= 0,
    'file:// 无代理应直接回退并说明 CORS，实际=' + o.fallback);

  console.log('[PASS] ModelRouter 分支（含自定义厂商 / temperature 透传 / file:// 短路）全部正确 ✓');
})().catch(e => { console.error('[FAIL]', e); process.exit(1); });
