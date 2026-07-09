# 圆桌会议 · 桌面客户端运行与构建说明

基于 Electron 封装的 Windows 桌面版。网页版代码（`index.html` / `styles.css` / `src/*`）**完全复用**，桌面端通过自定义 `app://` 协议加载，因此真实模型可直连外部 API，无需 `proxy.js`。

## 目录结构（新增部分）
```
roundtable/
├── package.json          # 入口/脚本/electron-builder 配置
├── electron/
│   └── main.js           # 主进程：注册 app://、创建窗口、自动更新、单实例锁
├── build/
│   └── README.txt        # 放置 icon-dialogue.ico 的说明
├── index.html            # 复用网页版
├── styles.css            # 复用网页版
└── src/                  # 复用网页版（engine/mock/clients/ui/compare）
```

## 本地开发预览
```bash
npm install        # 安装 electron / electron-builder / electron-updater
npm start          # 启动桌面窗口（等价于打开网页版，但运行在 app:// 下）
```

## 打包为 Windows 安装包
```bash
npm run dist       # 产出 dist/圆桌会议-Setup-1.1.2.exe（NSIS 安装包）
```
> 镜像已固化：`.npmrc` 与 `package.json` 的 `dist` 脚本已内置 npmmirror 镜像，本机直连 GitHub 受限也能直接构建，无需手动设环境变量。需走官方源时用 `npm run dist:official`。

安装包含：开始菜单快捷方式、桌面快捷方式、卸载程序、可自定义安装目录。
**构建已验证通过**，产物 `dist/圆桌会议-Setup-1.1.2.exe`（约 75 MB）。

## 自动更新（已配置仓库）
自动更新由 `electron-updater` 驱动，发布到 GitHub Releases。仓库已配置为公开仓库 `fchen6878-oss/roundtable-desktop`（`package.json` 的 `build.publish`）。

发布新版本（在你**本机**执行，需能直连 GitHub）：
```bash
# 1) 安装依赖（首次）
npm install
#    若 Electron 二进制/NSIS 下载被墙，先设镜像再 install：
#    set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
#    set ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/

# 2) 生成 GitHub Personal Access Token（classic，勾 repo 权限），然后：
set GH_TOKEN=ghp_xxx
npm run publish   # = electron-builder --publish=always，自动 build + 上传到 Releases
```
- `npm run publish` 不会自动带镜像变量；若你的网络环境需走镜像，先 `set` 上面的两个镜像变量再执行。
- 发布后会在仓库 Releases 生成 `v1.1.2` 标签，含 `圆桌会议-Setup-1.1.2.exe`、`.blockmap`、`latest.yml`。
- 用户端启动应用时自动检查并提示更新（Electron 原生弹窗）。

> 重要：当前已安装的 exe 是在仓库配置占位符时构建的，其内部 `app-update.yml` 仍是旧的 `REPLACE_OWNER/REPLACE_REPO`，**无法自动检查更新**。首次 `npm run publish` 后，请重新安装发布的 exe（此时才写入正确的 owner/repo），之后版本即可自动更新。

> `npm run dist` 不依赖发布配置，仍可正常构建运行；仅 `npm run publish` 需要真实仓库与 `GH_TOKEN`。

## 应用图标
使用正式设计图标 `build/icon-dialogue.ico`（6 档多分辨率 16/32/48/64/128/256，全 32 位，紫渐变 + 对话气泡，契合「圆桌会议」调性）。
图标在打包时烤入 exe（exe 图标 / 桌面快捷方式 / 开始菜单 / 安装向导全部生效），重新 `npm run dist` 或 `npm run publish` 即生效。
## 代码签名（分发建议）
未签名安装包在 Windows 上会触发 SmartScreen 拦截（用户需点"仍要运行"）。
如需消除，购买代码签名证书后，在 `package.json` 的 `build.win` 增加：
```json
"certificateFile": "path/to/cert.pfx",
"certificatePassword": "密码"
```

## 与网页版的关系
- 同一套 `src/*` 源码同时服务「网页版（file:// 打开）」与「桌面版（app:// 打开）」。
- 桌面端通过 `navigator.userAgent` 含 `Electron` 自动隐藏「本地代理」开关并屏蔽 file:// 警告；网页版行为保持不变。
- `proxy.js` 仍为网页版 file:// 真实模式提供 CORS 绕行，桌面端不使用它。
