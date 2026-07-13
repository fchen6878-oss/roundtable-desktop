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
function checkForUpdatesWithFeedback(win) {
  if (!app.isPackaged) {
    const { Notification } = require('electron');
    // 开发模式也用 toast，不弹 dialog（避免多余按钮）
    if (Notification.isSupported()) {
      new Notification({ title: '圆桌会议', body: '当前为开发模式，跳过自动更新检查。' }).show();
    }
    return;
  }
  const { dialog, Notification } = require('electron');

  // 状态防抖：避免连续点击重复触发
  if (checkForUpdatesWithFeedback._checking) return;
  checkForUpdatesWithFeedback._checking = true;

  // 监听事件（一次性，用完即弃）
  const cleanup = () => {
    autoUpdater.removeAllListeners('update-available');
    autoUpdater.removeAllListeners('update-not-available');
    autoUpdater.removeAllListeners('error');
    autoUpdater.removeAllListeners('update-downloaded');
    checkForUpdatesWithFeedback._checking = false;
  };

  autoUpdater.once('update-available', (info) => {
    dialog.showMessageBox(win, {
      type: 'info', title: '发现新版本',
      message: `发现新版本 ${info.version}`,
      detail: '正在自动下载，完成后会提示您重启安装。',
      buttons: ['确定']
    }).finally(cleanup);
  });

  autoUpdater.once('update-not-available', () => {
    // 用轻量 toast 风格通知
    if (Notification.isSupported()) {
      new Notification({ title: '圆桌会议', body: '当前已是最新版本。' }).show();
    }
    cleanup();
  });

  autoUpdater.once('update-downloaded', (info) => {
    dialog.showMessageBox(win, {
      type: 'info', title: '更新已下载',
      message: `${info.version} 已下载完成`,
      detail: '是否现在重启并安装新版本？',
      buttons: ['立即重启', '稍后']
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    }).finally(cleanup);
  });

  autoUpdater.once('error', (err) => {
    dialog.showMessageBox(win, {
      type: 'warning', title: '检查更新失败',
      message: '无法检查更新',
      detail: err?.message || err || '请检查网络连接。',
      buttons: ['确定']
    }).finally(cleanup);
  });

  autoUpdater.checkForUpdates();
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
        { label: '检查更新...', click: () => checkForUpdatesWithFeedback(win) }
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

app.whenReady().then(() => {
  registerAppProtocol();
  const win = createWindow();
  buildMenu(win);

  // 初始化本地存储层（SQLite + 密钥加密），并注册渲染层可用的 IPC 通道
  db.initDb();
  ipcMain.handle('db:createMeeting', (e, data) => db.createMeeting(data));
  ipcMain.handle('db:appendMessage', (e, id, msg) => { db.appendMessage(id, msg); return true; });
  ipcMain.handle('db:listMeetings', () => db.listMeetings());
  ipcMain.handle('db:getMeeting', (e, id) => db.getMeeting(id));
  ipcMain.handle('db:deleteMeeting', (e, id) => { db.deleteMeeting(id); return true; });
  ipcMain.handle('db:updateMeeting', (e, id, patch) => { db.updateMeeting(id, patch); return true; });
  ipcMain.handle('key:listProviders', () => db.listProviders());
  ipcMain.handle('key:setProvider', (e, key, cfg) => { db.setProvider(key, cfg); return true; });
  ipcMain.handle('key:deleteProvider', (e, key) => { db.deleteProvider(key); return true; });
  ipcMain.handle('key:getDecryptedKey', (e, key) => db.getDecryptedKey(key));
  ipcMain.handle('key:migrate', (e, legacy) => { db.migrate(legacy); return true; });

  // 自动更新：仅打包后（分发版本）才检查，开发态跳过
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    // 发现新版本时直接提示用户（无需点击"检查更新"）
    autoUpdater.once('update-available', (info) => {
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        new Notification({
          title: `圆桌会议 · 发现新版本 v${info.version}`,
          body: '正在后台下载更新，完成后将提示您安装。'
        }).show();
      }
    });
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // 无网络 / 无发布配置时静默忽略
    });
  }

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
