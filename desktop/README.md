# Desktop Integration

这个目录放桌面宿主相关文件，当前已经具备一套可运行的 Tauri 桌面壳。

## 当前职责

- 开发态拉起本地 `python -m file_organizer.api`
- 打包态拉起随应用分发的 `file_organizer_api.exe`
- 打包态后端以后台方式启动，不向用户显示额外终端窗口
- 打包态默认使用动态空闲端口，避免和固定 `8765` 冲突
- 仅允许单实例运行，重复启动时激活已有窗口
- 通过 `output/runtime/backend.json` 发现并校验后端实例
- 向前端注入 `window.__FILE_ORGANIZER_RUNTIME__`
- 提供目录选择、批量目录选择、文件夹图标应用 / 恢复、抠图测试等原生命令

## 目录说明

- `src-tauri/`
  - `src/backend.rs`：后端子进程拉起与管理
  - `src/runtime.rs`：运行时文件读取、健康校验、前端注入脚本
  - `src/icon_apply.rs`：Windows 文件夹图标应用 / 恢复
  - `src/bg_removal.rs`：抠图相关原生命令
- `package.json`
  - `npm run tauri:dev`
  - `npm run tauri:build`
- `runtime/backend.json.example`
  - 说明前后端共享的运行时文件结构

## 当前运行方式

```powershell
Set-Location desktop
npm install
npm run tauri:dev
```

## GitHub Actions 打包

- 仓库提供了一个仅支持手动触发的 Windows 打包工作流：
  - `.github/workflows/windows-desktop-bundle.yml`
- 触发后会在 GitHub Actions 中完成：
  - 安装 `frontend/` 与 `desktop/` 的 Node 依赖
  - 安装根目录 `requirements.txt`、`fastapi`、`uvicorn`、`pyinstaller`
  - 构建 `file_organizer_api.exe`
  - 执行 `npm run tauri:build`
  - 静默安装 MSI 并执行安装包 smoke test
  - 上传 Windows bundle 产物为 `filepilot-windows-bundle` artifact

Tauri 启动后会：

1. 开发态拉起 `python -m file_organizer.api`，打包态拉起内置的 `file_organizer_api.exe`
2. 等待 `output/runtime/backend.json`
3. 通过 `/api/health` 校验实例归属与健康状态
4. 向前端注入运行时对象

## 安装包 Smoke 验证

本地在已安装桌面应用后，可以直接对安装目录中的桌面可执行文件运行 smoke 脚本。当前构建产物中的可执行文件名通常与 Rust 包名一致，例如 `file-organizer-desktop.exe`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke_desktop_bundle.ps1 -AppPath "C:\Users\<User>\AppData\Local\Programs\FilePilot\file-organizer-desktop.exe"
```

脚本会验证：

1. 启动后能生成运行时文件并通过 `/api/health`
2. 安装包态默认未落在固定端口 `8765`
3. 重复启动时不会常驻第二个桌面实例
4. 关闭桌面应用后，`file_organizer_api.exe` 会退出
5. 再次启动后仍能恢复正常工作

前端读取入口固定为：

```ts
window.__FILE_ORGANIZER_RUNTIME__
```

当前注入字段至少包括：

- `base_url`
- `host`
- `port`
- `pid`
- `started_at`
- `instance_id`
- `api_token`

## 运行时契约

后端地址发现只允许通过：

- `output/runtime/backend.json`

该文件当前包含的最小字段包括：

- `base_url`
- `host`
- `port`
- `pid`
- `started_at`
- `instance_id`

## 当前限制

- 这个 workflow 当前只构建 Windows 包。
- 打包产物会携带桌面壳和内置 Python 后端，但仍需要在真实 Windows 环境进一步验证安装、首次启动和回退链路。
