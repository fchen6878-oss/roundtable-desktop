/*
 * proxy.js — 极简本地反向代理，用于绕过浏览器直连 OpenAI / Anthropic 的 CORS 限制。
 * 仅转发，不存储密钥（密钥仍由前端 localStorage 提供，随请求头带来）。
 * 用法：node proxy.js  →  监听 http://localhost:8787
 *   前端开启"通过本地代理绕过 CORS"后，请求会发到：
 *     http://localhost:8787/openai/v1/chat/completions   -> https://api.openai.com/v1/chat/completions
 *     http://localhost:8787/anthropic/v1/messages         -> https://api.anthropic.com/v1/messages
 */
const http = require('http');
const https = require('https');
const PORT = 8787;
const TARGETS = { openai: 'https://api.openai.com', anthropic: 'https://api.anthropic.com' };

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

const server = http.createServer((req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const m = req.url.match(/^\/(openai|anthropic)(\/.*)?(\?.*)?$/);
  if (!m) { res.writeHead(404); res.end('仅支持 /openai/* 与 /anthropic/*'); return; }

  const target = TARGETS[m[1]];
  const path = (m[2] || '/') + (m[3] || '');
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = chunks.length ? Buffer.concat(chunks) : null;
    const u = new URL(target);
    const headers = Object.assign({}, req.headers);
    delete headers['host'];
    const options = { method: req.method, headers: headers, hostname: u.hostname, path: path, port: 443 };
    const p = https.request(options, (r) => {
      const outHeaders = Object.assign({}, r.headers, {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'
      });
      delete outHeaders['access-control-allow-origin'];
      res.writeHead(r.statusCode, outHeaders);
      r.pipe(res);
    });
    p.on('error', e => { res.writeHead(502); res.end('proxy error: ' + e.message); });
    if (body) p.write(body);
    p.end();
  });
});

server.listen(PORT, () => console.log('[roundtable-proxy] 监听 http://localhost:' + PORT + ' （Ctrl+C 退出）'));
