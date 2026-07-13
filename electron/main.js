'use strict';

const { app, BrowserWindow, protocol, Menu, ipcMain } = require('electron');
const db = require('./db');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// 自定义特权协议：让应用拥有真实 origin（app://app），避免 file:// 的 CORS 限制，
// 同时使现有代码里 `location.protocol === 'file:'` 的守卫天然失效（桌面端直连外部 API 无需代理）。
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

function mimeOf(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

// ── 带用户反馈的更新检查 ──
// ── 自动更新统一状态机 ──
// 一份持久监听同时处理「自动后台检查」与「用户主动点击检查」两种场景，
// 彻底修掉旧实现里 update-available 弹窗关闭时 cleanup 误删 update-downloaded 监听
// 导致下载完成不弹安装、以及「稍后」后永不安装的缺陷。
const updater = {
  userInvoked: false,   // 本次检查是否为用户主动点击「检查更新」
  checking: false,
  downloading: false,
  downloaded: false,
  percent: 0,
  win: null,
  _lastMenu: 0
};

// 帮助菜单里「检查更新」项的动态文案：给用户可见的进度/状态反馈
function updateMenuLabel() {
  if (updater.downloaded) return '安装更新（已下载）';
  if (updater.downloading) return `下载更新中 ${updater.percent}%`;
  if (updater.checking) return '正在检查更新…';
  return '检查更新…';
}

// 轻量提示：优先系统通知，无通知能力时回退对话框
function updateNotice(win, opts) {
  const { Notification } = require('electron');
  if (Notification.isSupported()) {
    new Notification({ title: opts.title, body: opts.body }).show();
  } else if (win && !win.isDestroyed()) {
    const { dialog } = require('electron');
    dialog.showMessageBox(win, { type: 'info', title: opts.title, message: opts.body, buttons: ['确定'] });
  }
}

// 重建菜单以刷新「检查更新」文案（节流，避免 download-progress 频繁重建引发闪烁）
function refreshUpdateMenu() {
  if (!updater.win || updater.win.isDestroyed()) return;
  const now = Date.now();
  if (now - updater._lastMenu < 700) return;
  updater._lastMenu = now;
  try { buildMenu(updater.win); } catch (e) {}
}

// 注册持久化更新监听（app ready 后调用一次）
function setupAutoUpdater(win) {
  if (!app.isPackaged) return;
  updater.win = win;
  autoUpdater.autoDownload = true;          // 发现新版本自动下载
  autoUpdater.autoInstallOnAppQuit = true;  // 退出应用时自动完成安装（即便选了「稍后」）

  autoUpdater.on('update-available', (info) => {
    updater.checking = false;
    updater.downloading = true;
    updater.percent = 0;
    updateNotice(win, {
      title: `发现新版本 v${info.version}`,
      body: '已开始在后台下载，完成后将提示您安装。'
    });
    refreshUpdateMenu();
  });

  autoUpdater.on('download-progress', (p) => {
    const pct = Math.round(p.percent || 0);
    if (pct !== updater.percent) {
      updater.percent = pct;
      refreshUpdateMenu(); // 菜单项显示「下载更新中 45%」
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    updater.downloading = false;
    updater.downloaded = true;
    updater.percent = 100;
    refreshUpdateMenu();
    const { dialog } = require('electron');
    dialog.showMessageBox(win, {
      type: 'info',
      title: '更新已就绪',
      message: `新版本 v${info.version} 已下载完成`,
      detail: '是否立即重启并安装？\n（选择「稍后」也会在您退出应用时自动安装）',
      buttons: ['立即重启安装', '稍后'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        // isSilent=false 显示安装进度；isForceRunAfter=true 装完自动启动新版本
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    updater.checking = false;
    refreshUpdateMenu();
    if (updater.userInvoked) {
      updateNotice(win, { title: '已是最新版本', body: `当前已是最新（v${app.getVersion()}）` });
    }
    updater.userInvoked = false;
  });

  autoUpdater.on('error', (err) => {
    updater.checking = false;
    updater.downloading = false;
    refreshUpdateMenu();
    // 自动后台检查失败静默；仅用户主动检查时才提示
    if (updater.userInvoked) {
      updateNotice(win, { title: '检查更新失败', body: err?.message || '请检查网络连接' });
    }
    updater.userInvoked = false;
  });

  // 启动后自动后台检查一次（不打扰用户）
  autoUpdater.checkForUpdates().catch(() => {});
}

// 用户点击「帮助 → 检查更新」时调用
function checkForUpdatesWithFeedback(win) {
  if (!app.isPackaged) {
    updateNotice(win, { title: '圆桌会议', body: '当前为开发模式，跳过自动更新检查。' });
    return;
  }
  // 已处于某阶段：直接告知当前状态，避免重复触发检查
  if (updater.downloaded) {
    updateNotice(win, { title: '更新已就绪', body: '新版本已下载完成，可在提示中重启安装。' });
    return;
  }
  if (updater.downloading) {
    updateNotice(win, { title: '正在下载更新', body: `当前进度 ${updater.percent}%` });
    return;
  }
  if (updater.checking) {
    updateNotice(win, { title: '正在检查更新', body: '请稍候…' });
    return;
  }
  updater.userInvoked = true;
  updater.checking = true;
  refreshUpdateMenu();
  autoUpdater.checkForUpdates().catch(() => {});
}

// ── 自定义应用菜单 ──
function buildMenu(win) {
  // 辅助：通过 dispatchCustomEvent 向渲染层发送指令
  function send(name, detail) {
    if (win && !win.isDestroyed()) {
      win.webContents.executeJavaScript(
        `document.dispatchEvent(new CustomEvent('menu:${name}'${detail ? ',{detail:\'' + detail + '\'' : ''}))`
      ).catch(() => {});
    }
  }

  const template = [
    {
      label: '文件(&F)',
      submenu: [
        { label: '导出纪要...', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '会议(&M)',
      submenu: [
        { label: '开始会议', accelerator: 'F5', click: () => send('start') },
        { type: 'separator' },
        { label: '暂停 / 继续', accelerator: 'Space', click: () => send('toggle-pause') },
        { label: '结束会议', accelerator: 'CmdOrCtrl+.', click: () => send('end') },
        { type: 'separator' },
        { label: '发送导演指令...', accelerator: 'CmdOrCtrl+D', click: () => send('director') },
        { type: 'separator' },
        { label: '重置会议', accelerator: 'CmdOrCtrl+R', click: () => send('reset') },
        { type: 'separator' },
        { label: '历史会议', click: () => send('history') }
      ]
    },
    {
      label: '视图(&V)',
      submenu: [
        { label: '对比观点', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('compare') },
        { label: '分支面板', accelerator: 'CmdOrCtrl+B', click: () => send('branch') },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'resetZoom', label: '重置缩放' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '设置(&S)',
      submenu: [
        { label: 'API 配置...', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { type: 'separator' },
        {
          label: '节奏',
          submenu: [
            { label: '🐢 慢速', type: 'radio', checked: false, click: () => send('speed', 'slow') },
            { label: '📖 正常', type: 'radio', checked: true, click: () => send('speed', 'normal') },
            { label: '⚡ 快速', type: 'radio', checked: false, click: () => send('speed', 'fast') }
          ]
        }
      ]
    },
    {
      label: '帮助(&H)',
      submenu: [
        {
          label: '关于圆桌会议',
          click: () => {
            // 用独立窗口展示关于信息，避免原生 dialog 多余按钮
            let aboutWin = new BrowserWindow({
              parent: win,
              modal: process.platform !== 'darwin',
              width: 420,
              height: 320,
              resizable: false,
              minimizable: false,
              maximizable: false,
              backgroundColor: '#f5f6f8',
              title: '关于圆桌会议',
              webPreferences: { contextIsolation: true, nodeIntegration: false }
            });
            aboutWin.setMenu(null);
            aboutWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
              'html,body{margin:0;padding:0;box-sizing:border-box;overflow:hidden;height:100%}' +
              'body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
              'background:#f5f6f8;color:#1a1d23;display:flex;align-items:center;justify-content:center;height:100vh}' +
              '.card{background:#fff;border-radius:14px;padding:36px 32px;text-align:center;width:340px;' +
              'box-shadow:0 4px 24px rgba(0,0,0,.08)}' +
              '.logo{font-size:40px;margin-bottom:12px}.name{font-size:20px;font-weight:700;color:#1a1d23;margin-bottom:6px}' +
              '.ver{font-size:13px;color:#5b6471;background:#eef2f7;display:inline-block;padding:3px 10px;border-radius:999px;margin-bottom:18px}' +
              '.desc{font-size:13px;color:#5f6b79;line-height:1.7;margin-bottom:16px}' +
              '.copy{font-size:11px;color:#aab0ba}' +
              '</style></head><body>' +
              '<div class="card">' +
              '<div class="logo">🗣️</div>' +
              '<div class="name">圆桌会议</div>' +
              '<div class="ver">v' + app.getVersion() + '</div>' +
              '<div class="desc">多方辩论模拟与 AI 圆桌讨论工具<br>支持模拟模式（离线可用）和真实模型模式</div>' +
              '<div class="copy">© 2026 fchen6878-oss</div>' +
              '</div></body></html>'
            ));
            aboutWin.on('closed', () => { aboutWin = null; });
          }
        },
        { type: 'separator' },
        { label: updateMenuLabel(), click: () => checkForUpdatesWithFeedback(win) }
      ]
    }
  ];

  // macOS 应用菜单调整
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { label: '关于圆桌会议', click: () => { /* 同上 */ } },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' + app.name },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出' + app.name }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '圆桌会议',
    backgroundColor: '#f5f6f8',
    icon: path.join(__dirname, '..', 'build', 'icon-dialogue.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadURL('app://app/index.html');
  return win;
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      rel = rel.replace(/^\/+/, '');
      const root = path.resolve(app.getAppPath());
      const filePath = path.resolve(root, rel);
      // 防目录穿越：必须落在应用根目录内
      if (!filePath.startsWith(root)) {
        return new Response('Forbidden', { status: 403 });
      }
      const data = await fs.promises.readFile(filePath);
      return new Response(data, {
        headers: {
          'Content-Type': mimeOf(filePath),
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  });
}

// 单实例锁：避免重复启动多个窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.whenReady().then(async () => {
  registerAppProtocol();
  const win = createWindow();
  buildMenu(win);

  // 初始化本地存储层（SQLite WASM + 密钥加密），并注册渲染层可用的 IPC 通道
  await db.initDb();
  ipcMain.handle('db:createMeeting', (e, data) => db.createMeeting(data));
  ipcMain.handle('db:appendMessage', async (e, id, msg) => { await db.appendMessage(id, msg); return true; });
  ipcMain.handle('db:listMeetings', () => db.listMeetings());
  ipcMain.handle('db:getMeeting', (e, id) => db.getMeeting(id));
  ipcMain.handle('db:deleteMeeting', async (e, id) => { await db.deleteMeeting(id); return true; });
  ipcMain.handle('db:updateMeeting', async (e, id, patch) => { await db.updateMeeting(id, patch); return true; });
  ipcMain.handle('key:listProviders', () => db.listProviders());
  ipcMain.handle('key:setProvider', async (e, key, cfg) => { await db.setProvider(key, cfg); return true; });
  ipcMain.handle('key:deleteProvider', async (e, key) => { await db.deleteProvider(key); return true; });
  ipcMain.handle('key:getDecryptedKey', (e, key) => db.getDecryptedKey(key));
  ipcMain.handle('key:migrate', async (e, legacy) => { await db.migrate(legacy); return true; });

  // 自动更新：注册统一监听器并后台检查一次（setupAutoUpdater 内部已判断 app.isPackaged）
  setupAutoUpdater(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
