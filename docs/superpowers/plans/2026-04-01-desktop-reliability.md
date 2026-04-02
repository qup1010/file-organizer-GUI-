# Desktop Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Windows 桌面安装包补齐单实例、动态端口与安装后 smoke 验证，减少“应用打不开”与“关闭后后台残留”的发布风险。

**Architecture:** 在 Tauri 宿主侧集中管理安装包态启动条件。开发态继续沿用固定端口 `8765`，安装包态在宿主内动态选择端口并注入后端环境；桌面壳通过单实例插件阻止重复实例；发布链路新增本地与 CI 共用的 smoke 脚本验证启动、关闭和重启流程。

**Tech Stack:** Tauri 2, Rust, PowerShell, GitHub Actions, PyInstaller backend bundle

---

### Task 1: 动态端口测试与实现

**Files:**
- Modify: `desktop/src-tauri/src/backend.rs`
- Test: `desktop/src-tauri/src/backend.rs`

- [ ] **Step 1: 写失败测试，覆盖开发态固定端口与安装包态动态端口**

添加两个测试：

```rust
#[test]
fn backend_command_keeps_default_port_in_dev_mode() {
    std::env::remove_var("FILE_ORGANIZER_API_PORT");
    let config = resolve_backend_runtime_config(None).expect("config");
    assert_eq!(config.port, 8765);
    assert_eq!(config.base_url, "http://127.0.0.1:8765");
}

#[test]
fn backend_command_picks_ephemeral_port_for_bundled_mode() {
    std::env::remove_var("FILE_ORGANIZER_API_PORT");
    let config = resolve_backend_runtime_config(Some(Path::new("D:/bundle/backend/file_organizer_api.exe")))
        .expect("config");
    assert_ne!(config.port, 8765);
    assert!(config.port > 0);
    assert_eq!(config.base_url, format!("http://127.0.0.1:{}", config.port));
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test backend_command_keeps_default_port_in_dev_mode backend_command_picks_ephemeral_port_for_bundled_mode`

Expected: FAIL，因为 `resolve_backend_runtime_config` 还不存在。

- [ ] **Step 3: 写最小实现**

在 `backend.rs` 中抽出运行时配置：

```rust
pub struct BackendRuntimeConfig {
    pub host: String,
    pub port: u16,
    pub base_url: String,
}

fn resolve_backend_runtime_config(backend_executable: Option<&Path>) -> Result<BackendRuntimeConfig, String> {
    let host = env::var("FILE_ORGANIZER_API_HOST").unwrap_or_else(|_| DEFAULT_API_HOST.to_string());
    if let Ok(port) = env::var("FILE_ORGANIZER_API_PORT") {
        let port = port.parse::<u16>().map_err(|_| format!("invalid FILE_ORGANIZER_API_PORT: {port}"))?;
        return Ok(BackendRuntimeConfig {
            base_url: env::var("FILE_ORGANIZER_API_BASE_URL").unwrap_or_else(|_| format!("http://{host}:{port}")),
            host,
            port,
        });
    }

    if backend_executable.is_none() {
        return Ok(BackendRuntimeConfig {
            host: host.clone(),
            port: 8765,
            base_url: format!("http://{host}:8765"),
        });
    }

    let listener = std::net::TcpListener::bind((host.as_str(), 0))
        .map_err(|error| format!("failed to reserve backend port: {error}"))?;
    let port = listener.local_addr().map_err(|error| format!("failed to resolve backend port: {error}"))?.port();
    drop(listener);

    Ok(BackendRuntimeConfig {
        base_url: format!("http://{host}:{port}"),
        host,
        port,
    })
}
```

并让 `build_backend_command` / `start_backend` 使用该配置注入环境变量。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test backend_command_keeps_default_port_in_dev_mode`
Run: `cargo test backend_command_picks_ephemeral_port_for_bundled_mode`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src-tauri/src/backend.rs
git commit -m "feat: use dynamic backend ports in bundled desktop mode"
```

### Task 2: 单实例测试与实现

**Files:**
- Modify: `desktop/src-tauri/Cargo.toml`
- Modify: `desktop/src-tauri/src/lib.rs`
- Test: `desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: 写失败测试，覆盖二次启动时的窗口激活逻辑**

先把窗口激活逻辑抽成纯函数可测：

```rust
#[test]
fn handle_secondary_launch_marks_existing_window_for_focus() {
    let state = SecondaryLaunchAction::default();
    let next = state.on_second_launch(true, true);
    assert!(next.should_show);
    assert!(next.should_unminimize);
    assert!(next.should_focus);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test handle_secondary_launch_marks_existing_window_for_focus`

Expected: FAIL，因为 `SecondaryLaunchAction` 还不存在。

- [ ] **Step 3: 写最小实现并接入 Tauri 单实例插件**

在 `Cargo.toml` 中加入：

```toml
tauri-plugin-single-instance = "2"
```

在 `lib.rs` 中新增：

```rust
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq)]
struct SecondaryLaunchAction {
    should_show: bool,
    should_unminimize: bool,
    should_focus: bool,
}

impl SecondaryLaunchAction {
    fn on_second_launch(self, window_exists: bool, was_minimized: bool) -> Self {
        Self {
            should_show: window_exists,
            should_unminimize: window_exists && was_minimized,
            should_focus: window_exists,
        }
    }
}
```

并在 `tauri::Builder::default()` 上注册单实例插件；二次启动时：

```rust
if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}
```

- [ ] **Step 4: 运行测试和编译检查**

Run: `cargo test handle_secondary_launch_marks_existing_window_for_focus`
Run: `cargo check`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src-tauri/Cargo.toml desktop/src-tauri/src/lib.rs
git commit -m "feat: enforce single-instance desktop startup"
```

### Task 3: 本地 smoke 脚本

**Files:**
- Create: `scripts/smoke_desktop_bundle.ps1`
- Modify: `desktop/README.md`

- [ ] **Step 1: 先写脚本骨架**

```powershell
param(
  [Parameter(Mandatory = $true)]
  [string]$AppPath
)

$ErrorActionPreference = "Stop"
```

- [ ] **Step 2: 实现安装包 smoke 流程**

脚本需要完成：

```powershell
$proc = Start-Process -FilePath $AppPath -PassThru
Start-Sleep -Seconds 8

$runtime = Get-ChildItem "$env:APPDATA" -Recurse -Filter backend.json | Select-Object -First 1
$config = Get-Content $runtime.FullName -Encoding utf8 | ConvertFrom-Json
Invoke-WebRequest "$($config.base_url)/api/health" -UseBasicParsing | Out-Null

Stop-Process -Id $proc.Id -Force
Start-Sleep -Seconds 3

$backendAlive = Get-Process -Name "file_organizer_api" -ErrorAction SilentlyContinue
if ($backendAlive) { throw "Backend still running after app exit." }

$proc2 = Start-Process -FilePath $AppPath -PassThru
Start-Sleep -Seconds 8
Stop-Process -Id $proc2.Id -Force
```

根据仓库实际路径补齐运行时文件定位与重试逻辑。

- [ ] **Step 3: 更新 `desktop/README.md`**

补一个“安装包 smoke 验证”章节，示例：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke_desktop_bundle.ps1 -AppPath "C:\Path\To\FilePilot.exe"
```

- [ ] **Step 4: 本地运行脚本帮助检查**

Run: `powershell -ExecutionPolicy Bypass -File scripts\smoke_desktop_bundle.ps1 -?`

Expected: 能显示参数说明，不报语法错误。

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke_desktop_bundle.ps1 desktop/README.md
git commit -m "test: add local desktop bundle smoke script"
```

### Task 4: GitHub Actions 安装包 smoke test

**Files:**
- Modify: `.github/workflows/windows-desktop-bundle.yml`

- [ ] **Step 1: 在 workflow 中复用本地 smoke 脚本**

在 bundle 构建后新增步骤：

```yaml
- name: Smoke test Windows desktop bundle
  shell: pwsh
  run: |
    $app = Get-ChildItem desktop/src-tauri/target/release/bundle -Recurse -Include *.exe |
      Where-Object { $_.Name -notlike "*_nsis.exe" -or $true } |
      Select-Object -First 1
    if (-not $app) { throw "Bundle executable not found" }
    powershell -ExecutionPolicy Bypass -File scripts/smoke_desktop_bundle.ps1 -AppPath $app.FullName
```

必要时根据实际 bundle 产物类型改成先安装 MSI，再定位可执行文件。

- [ ] **Step 2: 运行 workflow 结构自检**

Run: `Get-Content .github/workflows/windows-desktop-bundle.yml`

Expected: 新增 smoke test 步骤位于上传 artifact 之前。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/windows-desktop-bundle.yml
git commit -m "ci: smoke test windows desktop bundle"
```

### Task 5: 全量验证

**Files:**
- Modify: `desktop/src-tauri/src/backend.rs`
- Modify: `desktop/src-tauri/src/lib.rs`
- Modify: `.github/workflows/windows-desktop-bundle.yml`
- Modify: `desktop/README.md`
- Create: `scripts/smoke_desktop_bundle.ps1`

- [ ] **Step 1: 运行桌面 Rust 验证**

Run: `cargo test terminate_backend_process_stops_spawned_process_tree`
Run: `cargo test backend_command_keeps_default_port_in_dev_mode`
Run: `cargo test backend_command_picks_ephemeral_port_for_bundled_mode`
Run: `cargo test handle_secondary_launch_marks_existing_window_for_focus`
Run: `cargo check`

Expected: PASS

- [ ] **Step 2: 运行 smoke 脚本帮助检查**

Run: `powershell -ExecutionPolicy Bypass -File scripts\smoke_desktop_bundle.ps1 -?`

Expected: PASS

- [ ] **Step 3: 整理文档与结果**

确认以下内容一致：

```text
- 开发态仍使用 8765
- 打包态使用动态端口
- 重复启动只激活现有窗口
- smoke 脚本与 CI 步骤使用同一条验证路径
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src-tauri/src/backend.rs desktop/src-tauri/src/lib.rs desktop/src-tauri/Cargo.toml .github/workflows/windows-desktop-bundle.yml desktop/README.md scripts/smoke_desktop_bundle.ps1 docs/superpowers/specs/2026-04-01-desktop-reliability-design.md docs/superpowers/plans/2026-04-01-desktop-reliability.md
git commit -m "feat: harden desktop startup and bundle smoke checks"
```
