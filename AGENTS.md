# AGENTS.md

## 语言与输出

- 除非用户明确要求英文，否则所有回复使用简体中文。
- 代码标识符、命令、日志、报错信息保持原始语言；其余解释使用中文。
- 中文注释、Markdown、日志说明统一使用 UTF

## 项目概览

- 这是一个本地文件整理项目，当前包含 FastAPI、本地前端工作台和 Tauri 桌面壳。
- 当前主链路覆盖：
  - 启动页来源选择（多文件 / 多文件夹 / 混合来源）
  - 启动页去向分流（归入已有目录 / 生成新的分类结构）
  - 全局默认放置规则（`new_directory_root` / `review_root`）与单次任务覆盖
  - 扫描目录
  - AI 分析
  - 增量整理对话
  - 执行预检
  - 输入大写 `YES` 后执行
  - 写入执行日志
  - 支持最近一次回退

## 目录约定

- `file_organizer/analysis`：扫描分析、文件读取、摘要能力
- `file_organizer/organize`：整理对话、增量计划、确认逻辑
- `file_organizer/execution`：执行计划、日志、报告
- `file_organizer/rollback`：最近一次执行回退
- `file_organizer/app`：桌面工作台会话服务
- `file_organizer/api`：FastAPI 本地 API 与运行时发现
- `frontend/`：Next.js 工作台前端
- `desktop/`：Tauri 宿主

## 当前实现补充

- 会话创建已支持：
  - `sources[]`
  - `target_directories[]`
  - `new_directory_root`
  - `review_root`
- `Review` 目录是特殊落点：
  - 默认跟随 `new_directory_root/Review`
  - 当前版本不支持 `Review` 子目录
- 前端启动流已经从“先填一堆配置”转向“先选来源，再决定去向，再按需展开配置”
- 设置页 `启动默认值` 已开始承接 placement 默认值：
  - `LAUNCH_DEFAULT_NEW_DIRECTORY_ROOT`
  - `LAUNCH_DEFAULT_REVIEW_ROOT`
  - `LAUNCH_REVIEW_FOLLOWS_NEW_ROOT`
- 桌面端当前仍保留两个原生来源选择能力：
  - `选择文件`
  - `选择文件夹`
  目前不要假设 Tauri / rfd 已经支持单次原生混选文件和文件夹

## 常用命令

### Python 依赖

```powershell
pip install -r requirements.txt
```

### 启动本地 API

```powershell
python -m file_organizer.api
```

- 默认地址：`http://127.0.0.1:8765`
- API 进程会写入运行时文件：`output/runtime/backend.json`

### 运行 Python 测试

```powershell
python -m unittest discover -s tests -p "test_*.py"
```

### 运行单个测试模块

```powershell
python -m unittest tests.test_session_service -v
python -m unittest tests.test_api_runtime -v
python -m unittest tests.test_api_sessions -v
```

### 前端开发

```powershell
Set-Location frontend
npm install
npm run dev
```

### 前端类型检查

```powershell
Set-Location frontend
npm run typecheck
```

### Tauri 桌面壳

```powershell
Set-Location desktop
npm install
npm run tauri:dev
```

### Tauri 构建

```powershell
Set-Location desktop
npm run tauri:build
```

### Rust 侧快速检查

```powershell
Set-Location desktop\src-tauri
cargo check
```

## 推荐工作流

### 1. API / 工作台开发工作流

1. 启动 `python -m file_organizer.api`。
2. 在 `frontend/` 运行 `npm run dev`。
3. 如涉及会话快照、事件流或阶段推进，优先同步验证：
   - `tests/test_api_*.py`
   - `tests/test_session_*.py`
   - `tests/test_api_sessions.py`

### 2. 桌面联调工作流

1. 确保 `frontend/` 与 `desktop/` 依赖已安装。
2. 在 `desktop/` 运行 `npm run tauri:dev`。
3. Tauri 会负责拉起 `python -m file_organizer.api`。
4. 前端优先读取 `window.__FILE_ORGANIZER_RUNTIME__.base_url`。
5. 如联调异常，优先检查 `output/runtime/backend.json` 是否生成。

### 3. 回退验证工作流

1. 先完成一次真实整理执行并生成 journal。
2. 通过桌面工作台或 API 触发回退。
3. 先看回退预检，再决定是否确认执行。
4. 修改回退逻辑时至少回归：
   - `tests/test_rollback_service.py`

## 修改约束

- 改动会话状态机、API schema、事件名或 `session_snapshot` 时，必须同时检查：
  - Python 服务测试
  - 前端类型定义
  - 相关文档或设计稿
- 改动 `frontend/`、工作台页面或桌面壳交互时，默认按“桌面应用”而不是“普通网页”设计：
  - 优先保证稳定工作台框架、清晰信息密度和长时间使用的低疲劳体验
  - 优先考虑窗口化使用场景，包括小窗口、分栏、状态栏、工具栏和高频任务切换
  - 避免网页式 hero、大横幅、居中窄栏、宣传感文案和漂浮卡片堆叠
  - 如无明确理由，不要引入偏官网化、营销化或 SaaS dashboard 风格的布局
- 改动启动页 / 新任务入口时，优先遵守这条产品方向：
  - 先收集用户最确定的信息（来源）
  - 再决定去向（归入已有目录 / 生成新结构）
  - 再按需展开 placement 和风格等高级配置
- 改动 placement 相关逻辑时，保持“设置页配默认，任务页可覆盖，Review 默认跟随新目录根”的规则一致
- 改动运行时发现机制时，保持以下契约稳定：
  - `output/runtime/backend.json`
  - `window.__FILE_ORGANIZER_RUNTIME__.base_url`
- 涉及 Windows 路径时，优先保持现有写法和兼容性，不要假设仅在 Unix 环境运行。

## 提交前最小验证

- Python 逻辑改动：运行相关 `unittest`
- 前端改动：运行 `npm run typecheck`
- Tauri / Rust 改动：运行 `cargo check`
- 涉及端到端主链路时，至少手动验证以下其一：
  - `python -m file_organizer.api`
  - `npm run tauri:dev`
