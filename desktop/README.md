# Desktop Integration

这个目录放桌面宿主相关文件，当前已经具备一套可运行的 Tauri 桌面壳。

## 当前职责

- 开发态拉起本地 `python -m file_pilot.api`
- 打包态拉起随应用分发的 `file_pilot_api.exe`
- 打包态后端以后台方式启动，不向用户显示额外终端窗口
- 打包态默认使用动态空闲端口，避免和固定 `8765` 冲突
- 仅允许单实例运行，重复启动时激活已有窗口
- 通过 `output/runtime/backend.json` 发现并校验后端实例
- 向前端注入 `window.__FILE_PILOT_RUNTIME__`
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

## 本目录开发

```powershell
Set-Location desktop
npm install
npm run tauri:dev
```

如果需要单独验证 Rust 侧能否通过编译检查：

```powershell
Set-Location desktop\src-tauri
cargo check
```

根目录 [README.md](../README.md) 提供统一的项目启动方式和常用命令，这里只保留桌面宿主特有说明。

## GitHub Actions 打包

- 仓库提供了一个 Windows 桌面打包工作流：
  - `.github/workflows/windows-desktop-bundle.yml`
- 触发后会在 GitHub Actions 中完成：
  - 安装 `frontend/` 与 `desktop/` 的 Node 依赖
  - 安装根目录 `requirements.txt`、`fastapi`、`uvicorn`、`pyinstaller`
  - 构建 `file_pilot_api.exe`
  - 执行 `npm run tauri:build`
  - 静默安装 MSI 并执行安装包 smoke test
  - 上传 Windows bundle 产物为 `filepilot-windows-bundle` artifact
- 当前支持两种触发方式：
  - 在 GitHub Actions 页面手动触发：只产出 artifact，适合先试打包
  - 推送 `v*` tag：例如 `v0.1.1`，会在打包成功后自动创建 GitHub Release 并上传安装包
- 推荐发版顺序：
  1. 先同步更新桌面版本号
     可直接执行 `powershell -ExecutionPolicy Bypass -File scripts\set_desktop_version.ps1 -Version 0.1.1`
     或执行 `npm --prefix desktop run version:set -- 0.1.1`
  2. 提交版本变更
  3. 创建并推送 tag，例如 `git tag v0.1.1`、`git push origin v0.1.1`

## 安装包 Smoke 验证

本地在已安装桌面应用后，可以直接对安装目录中的桌面可执行文件运行 smoke 脚本。当前构建产物中的可执行文件名通常与 Rust 包名一致，例如 `file-pilot-desktop.exe`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke_desktop_bundle.ps1 -AppPath "C:\Users\<User>\AppData\Local\Programs\FilePilot\file-pilot-desktop.exe"
```

脚本会验证：

1. 启动后能生成运行时文件并通过 `/api/health`
2. 安装包态默认未落在固定端口 `8765`
3. 重复启动时不会常驻第二个桌面实例
4. 关闭桌面应用后，`file_pilot_api.exe` 会退出
5. 再次启动后仍能恢复正常工作

## 运行时契约

前端读取入口固定为：

```ts
window.__FILE_PILOT_RUNTIME__
```

当前注入字段至少包括：

- `base_url`
- `host`
- `port`
- `pid`
- `started_at`
- `instance_id`
- `api_token`

后端地址发现只允许通过：

- `output/runtime/backend.json`

该文件当前包含的最小字段包括：

- `base_url`
- `host`
- `port`
- `pid`
- `started_at`
- `instance_id`

补充说明：

- `api_token` 只存在于桌面壳注入给前端的 `window.__FILE_PILOT_RUNTIME__`，不写入 `output/runtime/backend.json`。
- 桌面壳会同时校验 runtime 文件中的 `instance_id` 与 `/api/health` 返回值，避免误连到旧实例或其他本地进程。
- 这部分契约如果要调整，需要同时检查：
  - `file_pilot/api/runtime.py`
  - `frontend/src/lib/*`
  - `desktop/src-tauri/src/runtime.rs`

## 当前限制

- 这个 workflow 当前只构建 Windows 包。
- 打包产物会携带桌面壳和内置 Python 后端，但仍需要在真实 Windows 环境进一步验证安装、首次启动和回退链路。

## 排查建议

- 启动后前端空白或连不上后端时，先检查 `output/runtime/backend.json` 是否生成。
- 如果运行时文件存在，再看 `logs/backend/runtime.log` 和 `/api/health` 是否正常。
- 如果是开发态拉起失败，优先确认当前机器的 Python、Node.js、Rust / Cargo 是否可用，以及根目录 Python 依赖是否已安装。
