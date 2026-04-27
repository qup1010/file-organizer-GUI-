# Desktop Reliability Design

## 背景

当前桌面壳已经具备内置后端拉起、运行时发现和退出清理能力，但仍存在三个影响发布稳定性的问题：

1. 安装包态缺少覆盖启动、关闭、重启的 smoke 验证，容易让“开发态正常、安装后异常”的问题漏过。
2. 桌面应用没有单实例保护，重复启动时可能创建竞争实例，导致窗口焦点、运行时文件和端口状态不稳定。
3. 安装包态仍默认使用固定端口 `8765`，在用户机器上容易与残留进程或其他本地服务冲突。

## 目标

为 Windows 桌面应用补齐可靠性闭环：

- 安装包产物在 CI 中做自动 smoke test。
- 仓库内提供本地可运行的安装包 smoke 验证脚本。
- 桌面壳强制单实例运行，并在重复启动时激活现有窗口。
- 安装包态使用动态空闲端口启动后端，同时保持现有 `backend.json` 契约不变。

## 非目标

- 不改动前端读取运行时的方式，仍以 `window.__FILE_PILOT_RUNTIME__` 和 `output/runtime/backend.json` 为准。
- 不调整开发态联调默认端口，开发态仍优先保持 `8765`，避免影响现有工作流。
- 不在本次改动中处理窗口尺寸记忆、托盘、CSP 收紧等其他桌面体验项。

## 方案

### 1. 安装包 smoke 验证

新增两类验证入口：

- GitHub Actions：在 Windows bundle 构建完成后，执行安装包态 smoke test。
- 本地脚本：提供 PowerShell 脚本复用同一套验证步骤，供发布前手动执行。

验证步骤保持一致：

1. 启动打包后的桌面应用。
2. 等待运行时文件生成，并读取 `base_url`。
3. 请求 `/api/health`，确认后端就绪。
4. 关闭桌面应用。
5. 确认 `file_pilot_api.exe` 已退出。
6. 再次启动桌面应用。
7. 再次确认运行时文件和健康检查成功。

### 2. 单实例

在 Tauri 启动入口增加单实例插件：

- 首次启动：正常创建窗口并启动后端。
- 再次启动：不再启动第二个桌面实例。
- 已有窗口若被隐藏或最小化，则恢复显示并尝试聚焦。

这项能力只作用于桌面宿主，不改变前端业务逻辑。

### 3. 安装包态动态端口

后端启动前增加端口选择逻辑：

- 开发态：继续使用 `8765`，保持调试稳定。
- 安装包态：如果未显式指定 `FILE_PILOT_API_PORT`，则在启动前选择一个本机空闲端口。
- 同步生成正确的 `FILE_PILOT_API_BASE_URL`，让后端写入 `backend.json` 后仍可被前端和宿主发现。

端口选择以“绑定 `127.0.0.1:0` 取得系统分配端口”为基础，只在桌面宿主决定端口，不改 FastAPI 的运行时契约。

## 影响文件

- `desktop/src-tauri/Cargo.toml`
- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/src/backend.rs`
- `desktop/package.json`
- `.github/workflows/windows-desktop-bundle.yml`
- `desktop/README.md`
- `tests/` 或 `desktop/src-tauri/src/*` 中相关 Rust 测试
- 新增本地 smoke 脚本，例如 `scripts/smoke_desktop_bundle.ps1`

## 测试策略

Rust / 桌面侧：

- 单实例相关编译与行为验证。
- 动态端口选择单元测试。
- 后端关闭与重启路径保持通过。

发布链路：

- CI Windows bundle smoke test。
- 本地 PowerShell smoke 脚本手动验证。

## 风险与约束

- 单实例插件需要与当前自定义无边框窗口共存，重复启动时只能激活已有窗口，不能意外触发第二次 `setup`。
- 动态端口选择必须避免先探测后使用导致的 race，因此应尽量在桌面宿主分配后立即传给后端启动流程。
- CI 安装包 smoke test 需要选取适合 GitHub Windows runner 的启动和关闭方式，避免因为 GUI 会话特性导致误判。
