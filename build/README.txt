把应用图标命名为 icon.ico 放在这个目录（build/icon.ico），
electron-builder 会自动用它作为安装包与可执行文件的图标。

要求：多分辨率（建议包含 16/32/48/128/256 像素），.ico 格式。
未提供时，构建将使用 Electron 默认图标。
