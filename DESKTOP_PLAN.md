# 圆桌会议 · PC 桌面客户端方案（Electron / Windows）

> 状态：**已实施并构建验证通过（`dist/圆桌会议-Setup-1.0.0.exe` 已产出）** · 技术决策已与用户确认

## 一、目标与范围
- 把现有网页版圆桌会议封装为 **Windows 桌面应用**，安装后双击即运行，无需浏览器、无需手动起代理。
- 完整保留现有功能：多角色讨论、主持人调度、导演干预、快照/分支/对比、场景模板、自由/制式态度、导出纪要等。
- 真实模型调用改为 **桌面端直连外部 API**（去除 `file://` 的 CORS 限制与 `proxy.js` 依赖）。
- 支持 **自动更新**（启动检查新版本，原生弹窗提示/下载）。

## 二、已确认的技术决策
| 项 | 决策 |
|----|------|
| 技术栈 | **Electron** |
| 目标平台 | **仅 Windows**（NSIS 安装包 `.exe`） |
| 网络调用 | **直连外部 API**，移除 `proxy.js` |
| 自动更新 | **electron-updater**（GitHub Releases） |

## 三、关键设计点：必须用自定义 `app://` 协议（不能用 loadFile）
现有 `src/clients.js` 与 `src/ui.js` 中存在针对 `location.protocol === 'file:'` 的短路逻辑：
- `clients.js`：检测到 `file://` 且未开代理 → 直接回退模拟，并提示"CORS 拦截"。
- `ui.js`：开场前若 `location.protocol === 'file:'` → 状态栏警告直连会被拦截。

若桌面端用 `win.loadFile('index.html')`，renderer 的 `location.protocol` 仍是 `file:`，会**误触发**上述短路，导致真实模式永远回退模拟——这与"直连外部 API"的目标冲突。

**解决方案**：主进程注册自定义特权协议 `app://`（`protocol.registerSchemesAsPrivileged` + `protocol.handle`），把本地文件映射进去，使用 `win.loadURL('app://app/index.html')` 加载。效果：
1. renderer 的 `location.protocol === 'app:'`，现有 `file://` 守卫天然失效，真实模式不再被误拦截。
2. 拥有真实 origin（`app://app`），外部 API 返回 `Access-Control-Allow-Origin: *` 时 CORS 正常工作。
3. 无需开本地端口（优于"内置 http 服务器"方案）。

## 四、文件与目录改动
**新增**
- `package.json`（项目目前无此文件）—— 入口/脚本/`build` 配置/`publish` 配置
- `electron/main.js` —— 主进程：注册 `app://`、创建窗口、载入应用、挂载自动更新
- `build/icon.ico` —— 应用图标（需提供或生成占位）
- （可选）`electron/preload.js` —— 仅当需要做"更新提示气泡"等渲染进程 IPC 时才需要

**保留不动（作为 renderer 直接复用）**
- `index.html` / `styles.css` / `src/*.js` / `test/`

**移除（桌面端不再需要）**
- `proxy.js` 及设置里的"本地代理"开关（`proxyEnabled`）。直连已无 CORS 问题。保留也不报错，但建议清理。

**最小化代码改动**
- 现有 `file://` 守卫因 `app://` 不再触发，逻辑上**无需改动**。
- 若希望设置面板更干净：在 `ui.js` 用 `navigator.userAgent.includes('Electron')` 隐藏"本地代理"选项与 `file://` 警告文案（属可选打磨）。
- 数据存储沿用 `localStorage`，Electron 中自动持久化到 `userData` 目录，无需改动。

## 五、主进程核心骨架（`electron/main.js`）
```js
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// 1) 注册特权协议，使 app:// 拥有真实 origin（CORS 友好、非 file://）
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true } }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: {
      contextIsolation: true,   // 安全：隔离预加载与渲染上下文
      nodeIntegration: false,   // 安全：渲染进程不暴露 Node
      // preload: path.join(__dirname, 'preload.js')  // 仅做 IPC 时需要
    }
  });
  win.loadURL('app://app/index.html');
}

app.whenReady().then(() => {
  // 2) 用自定义协议提供本地文件（等价于静态服务器，但无端口）
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/app/, '').replace(/^\//, '');
    const filePath = path.join(app.getAppPath(), rel || 'index.html');
    return require('fs').promises.readFile(filePath).then(b => new Response(b, {
      headers: { 'Content-Type': mimeOf(filePath) }
    })).catch(() => new Response('Not found', { status: 404 }));
  });

  createWindow();

  // 3) 自动更新：Electron 原生更新弹窗，无需 preload
  autoUpdater.checkForUpdatesAndNotify();
});
```
> 说明：`mimeOf()` 为小的扩展名→MIME 映射辅助函数（`text/html`、`text/css`、`application/javascript` 等）。`protocol.handle` 需 Electron ≥ 24（推荐 31+）。

## 六、package.json 关键配置
```jsonc
{
  "name": "roundtable",
  "version": "1.0.0",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder",
    "publish": "electron-builder --publish=always"
  },
  "devDependencies": {
    "electron": "^31",
    "electron-builder": "^24",
    "electron-updater": "^6"
  },
  "build": {
    "appId": "com.yourcompany.roundtable",
    "productName": "圆桌会议",
    "files": ["electron/**/*", "index.html", "styles.css", "src/**/*"],
    "directories": { "output": "dist" },
    "win": {
      "target": ["nsis"],
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "publish": [{ "provider": "github", "owner": "<你的GitHub名>", "repo": "<仓库名>" }]
  }
}
```

## 七、自动更新流程
- 主进程 `autoUpdater.checkForUpdatesAndNotify()`：Electron 原生弹窗提示"发现新版本 / 下载完成重启"，无需渲染进程 IPC（无 preload 也能用）。
- 发布：`npm run publish`（= `electron-builder --publish=always`）会把构建产物上传到 GitHub Releases，需环境变量 `GH_TOKEN`（有 `repo` 权限的 token）。
- 消费端：公开仓库无需 token，用户启动应用时自动检查。
- 前提：**需要一个 GitHub 仓库**（公开即可），并把 `owner`/`repo` 写入 `build.publish`。

## 八、构建与分发
1. `npm i -D electron electron-builder electron-updater`
   - 首次会下载 ~80MB 的 Electron 二进制，**需联网一次**。
2. `npm run dist` → 产出 `dist/RoundTable Setup 1.0.0.exe`（NSIS 安装包，含卸载程序、开始菜单、桌面快捷方式）。
3. **代码签名（重要）**：未签名安装包在 Windows 上会触发 **SmartScreen 拦截**（用户需点"仍要运行"）。
   - 消除需购买代码签名证书（约 $200–400/年），并在 `build` 配置 `certificateFile` / `certificatePassword`。
   - 内部使用可先不签，但分发体验较差。

## 九、实施步骤（里程碑）
1. **脚手架**：新增 `package.json` + `electron/main.js`（`app://` 协议 + 窗口 + 自动更新占位）+ 占位 `build/icon.ico`。
2. **本地验证**：`npm start` 打开窗口，确认模拟模式可用；配置一个真实厂商（如 OpenAI）验证直连调用成功。
3. **清理（可选）**：移除 `proxy.js` 与设置里的"本地代理"开关；`ui.js` 用 `Electron` UA 隐藏相关文案。
4. **自动更新**：接入 `electron-updater` + 配置 `build.publish`（GitHub owner/repo）。
5. **打包**：`npm run dist` 产出 NSIS 安装包。
6. **干净环境验证**：在另一台 Windows 上安装并运行；推送一个新版本验证自动更新弹窗。

## 十、风险与待确认项
**待确认（需你提供）**
- GitHub 仓库 `owner/repo`（自动更新依赖；不填则 `npm run publish` 不可用，但 `npm run dist` 与本地运行不受影响）
- 是否购买代码签名证书（影响 SmartScreen 体验；内部使用可不签）

**已确认 / 已落地**
- 应用名称：`圆桌会议`
- 应用图标：已生成占位 `build/icon.ico`（256×256 圆桌主题，替换即换正式图标）
- 初始版本号：`1.0.0`
- NSIS 允许自定义安装目录：是（`allowToChangeInstallationDirectory: true`）
- `proxy.js` 与"本地代理"开关：**保留**（供网页版 file:// 真实模式使用），桌面端经 `app://` 自然绕开，无需清理

**风险**
- 个别 API 若不返回 CORS 头，则直连失败（主流 LLM 厂均返回 `Access-Control-Allow-Origin: *`，通常无碍）。
- 首次构建需联网下载 Electron 二进制。
- Electron 安装包体积较大（~120MB+ 含运行时）。

## 十一、本机构建实战（GitHub 受限 → npmmirror 镜像）
本机环境直连 github.com 被拦截，导致：
1. `npm install` 后 Electron 二进制本体（~80MB `electron.exe`）未下载，`require('electron')` 报 "failed to install correctly"。
2. `npm run dist` 时 electron-builder 从 GitHub 拉 Electron / NSIS / winCodeSign 二进制失败（dial tcp 超时）。

**解决（已固化进仓库，后续无需手动处理）**：
- 根 `.npmrc` 写入 `electron_mirror` 与 `electron_builder_binaries_mirror`（指向 npmmirror），覆盖 `npm install` 阶段下载。
- `package.json` 的 `scripts.dist` 内置 `set ELECTRON_MIRROR=… && set ELECTRON_BUILDER_BINARIES_MIRROR=… && electron-builder`（Windows cmd 语法），覆盖构建阶段下载；走官方源用 `npm run dist:official`。
- npmmirror 上 Electron 31.7.7 的 `electron-v31.7.7-win32-x64.zip` 已验证可达（302→cdn.npmmirror.com，返回 200）。
- 另：electron-builder 的 NSIS 阶段偶发 `spawn UNKNOWN`，直接重试 `npm run dist` 即可通过。
