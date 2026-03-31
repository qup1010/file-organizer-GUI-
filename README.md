# FilePilot / File Organizer

本项目是一个本地文件整理工作台，当前同时包含：

- CLI 主流程
- FastAPI 本地 API
- Next.js 工作台前端
- Tauri 桌面壳
- 图标工坊能力链路

它不是单一的“命令行脚本”，而是一套围绕本地目录整理、执行确认、历史回看、最近一次回退、模型配置和图标生成的桌面化工具链。

## 当前能力概览

### 文件整理主链路

当前主链路已经覆盖：

`扫描目录 -> AI 分析 -> 增量整理对话 -> 执行预检 -> 输入大写 YES 确认执行 -> 写入执行日志 -> 支持最近一次回退`

整理流程的几个关键约束：

- 分析阶段只处理目标目录当前层条目，并做结果校验。
- 整理阶段使用增量交互，模型通过 `submit_plan_diff` 提交本轮变更，系统在本地维护完整待定计划。
- 默认优先展示摘要视图，用户可以通过自然语言继续追问，例如 `看明细`、`看改动`、`看待确认项`、`执行`。
- 未确认项默认可以暂存到 `Review/`，真正落盘前仍需输入大写 `YES`。

### 工作台模块

当前桌面工作台已经具备以下模块：

- 新建任务 / 当前任务：启动整理会话，查看扫描、预检、执行与结果
- 整理历史：查看会话与执行档案，支持删除记录和回退最近一次执行
- 设置：统一管理文本模型、图片理解、图标生图、抠图服务、启动默认值和调试开关
- 图标工坊：扫描文件夹、分析语义、生成图标预览、选择版本，并联动桌面端应用 / 恢复 Windows 文件夹图标

### 后端 API

FastAPI 本地服务当前除了整理会话接口，还包含：

- `/api/history`：历史记录与 journal
- `/api/settings`：统一设置快照、预设切换和连接测试
- `/api/icon-workbench/*`：图标工坊会话、模板、预览和客户端动作回报
- `/api/utils/*`：目录选择、打开目录、兼容配置接口
- `/api/sessions/{session_id}/events`：SSE 事件流

如果设置了 `FILE_ORGANIZER_API_TOKEN`，除健康检查和必要的 `OPTIONS` 外，API 需要通过以下任一方式鉴权：

- `Authorization: Bearer <token>`
- `x-file-organizer-token: <token>`
- SSE 场景使用 `?access_token=<token>`

## 项目结构

```text
file_organizer/
  analysis/         扫描分析、文件读取、归档/图片摘要
  organize/         整理对话、增量计划、策略模板
  execution/        执行计划、journal、报告
  rollback/         最近一次执行回退
  app/              工作台会话服务与会话存储
  api/              FastAPI API 与运行时发现
  cli/              终端交互、事件打印、会话入口
  icon_workbench/   图标工坊服务、模板、存储、客户端
  shared/           配置、日志、路径工具、公共模型
  workflows/        主整理流程与回退流程编排
frontend/           Next.js 工作台前端
desktop/            Tauri 桌面宿主
tests/              Python 单元测试
output/             运行时产物、历史记录、图标工坊输出
logs/               后端运行日志与调试日志
```

## 环境要求

- Python 3.11 及以上
- Node.js 18 及以上
- Windows 环境优先

说明：

- 项目大量处理 Windows 路径和文件夹图标能力，默认按 Windows 本地桌面工具使用。
- Tauri 桌面链路还需要本机可用的 Rust / Cargo 环境。

## 安装依赖

### Python

```powershell
pip install -r requirements.txt
```

当前 Python 依赖包括：

- `openai`
- `pypdf`
- `python-docx`
- `pandas`
- `openpyxl`
- `rich`

### 前端

```powershell
Set-Location frontend
npm install
```

### 桌面壳

```powershell
Set-Location desktop
npm install
```

## 运行方式

### 1. 纯 CLI 主流程

```powershell
python -m file_organizer
```

适合直接在终端里完成：

- 扫描目录
- 生成整理计划
- 查看摘要 / 改动 / 待确认项
- 执行前输入大写 `YES`

### 2. 回退最近一次执行

```powershell
python -m file_organizer.rollback D:/Downloads
```

该命令会读取最近一次执行 journal，先做回退预检，再根据确认结果执行回退。

### 3. 启动本地 API

```powershell
python -m file_organizer.api
```

默认行为：

- 地址：`http://127.0.0.1:8765`
- 运行时文件：`output/runtime/backend.json`
- 健康检查：`GET /api/health`

可用环境变量：

- `FILE_ORGANIZER_API_HOST`
- `FILE_ORGANIZER_API_PORT`
- `FILE_ORGANIZER_API_BASE_URL`
- `FILE_ORGANIZER_API_RELOAD`
- `FILE_ORGANIZER_API_TOKEN`
- `FILE_ORGANIZER_INSTANCE_ID`

### 4. 启动前端开发环境

```powershell
Set-Location frontend
npm run dev
```

前端读取运行时地址的优先级：

1. `window.__FILE_ORGANIZER_RUNTIME__.base_url`
2. `NEXT_PUBLIC_API_BASE_URL`
3. 默认 `http://127.0.0.1:8765`

如果桌面壳已注入 `api_token`，前端也会优先使用 `window.__FILE_ORGANIZER_RUNTIME__.api_token` 调用受保护接口。

### 5. 启动 Tauri 桌面壳

```powershell
Set-Location desktop
npm run tauri:dev
```

桌面壳当前会负责：

- 拉起 `python -m file_organizer.api`
- 等待 `output/runtime/backend.json`
- 校验后端实例与健康状态
- 向前端注入 `window.__FILE_ORGANIZER_RUNTIME__`
- 提供目录选择、批量目录选择、应用 / 恢复文件夹图标、抠图测试等桌面命令

### 6. 构建桌面应用

```powershell
Set-Location desktop
npm run tauri:build
```

## 配置说明

### 推荐配置入口

当前项目以根目录 `config.json` 为主配置文件，推荐通过设置页维护。

仓库内只保留脱敏示例：

- [`config.example.json`](config.example.json)
- [`.env.example`](.env.example)

说明：

- `config.json` 已被忽略，不应提交到版本控制。
- 统一设置服务会把文本模型、图片理解、图标生图、抠图配置整合到同一个根配置。
- 老的零散配置会在读取时尽量迁移到当前 schema。

### 当前设置家族

设置页当前管理以下配置族：

- `text`：主整理链路文本模型
- `vision`：图片理解模型
- `icon_image`：图标工坊生图模型
- `bg_removal`：图标抠图服务
- `global_config`：启动默认模板、命名风格、风险级别、默认备注、调试开关等

### 文件读取与图片能力

当前文件读取能力包括：

- 普通文本读取，支持常见 Windows 中文编码 fallback
- `PDF`、`Word`、`Excel` 摘要提取
- `.zip` 索引预览，不解压、不读取内部正文
- 图片简短摘要，使用独立 Vision 配置，不复用主整理模型上下文

### 图标工坊配置特点

图标工坊当前支持：

- 文本分析与图像生成链路联动
- 分开的 `analysis_concurrency_limit` / `image_concurrency_limit`
- `centralized` 与 `in_folder` 两种保存模式
- 内置抠图预设和自定义抠图服务配置

## 输出与日志

### 运行时文件

- `output/runtime/backend.json`：后端运行时发现文件

### 历史与执行产物

- `output/history/executions`：执行 journal
- `output/history/latest_by_directory.json`：目录到最近一次执行的索引
- `output/icon_workbench/`：图标工坊会话与生成产物

### 日志

- `logs/backend/runtime.log`：后端基础运行日志
- `logs/backend/runtime.log.YYYY-MM-DD`：按天轮转日志
- `logs/backend/debug.jsonl`：结构化调试日志

设置页里的“详细日志”只控制是否额外写入 `debug.jsonl`，不会关闭基础运行日志。

## 测试与验证

### Python 测试

```powershell
python -m unittest discover -s tests -p "test_*.py"
```

常用测试模块：

```powershell
python -m unittest tests.test_session_service -v
python -m unittest tests.test_api_runtime -v
python -m unittest tests.test_api_icon_workbench -v
python -m unittest tests.test_settings_service -v
python -m unittest tests.test_rollback_service -v
```

### 前端类型检查

```powershell
Set-Location frontend
npm run typecheck
```

### Rust 快速检查

```powershell
Set-Location desktop\\src-tauri
cargo check
```

## 推荐开发工作流

### 整理主链路开发

1. 运行 `python -m file_organizer.api`。
2. 如需前端联调，再在 `frontend/` 中运行 `npm run dev`。
3. 若修改会话状态机、事件流、`session_snapshot` 或 API schema，至少同步检查：
   - `tests/test_api_*.py`
   - `tests/test_session_*.py`
   - `tests/test_main_flow.py`
   - 前端 `src/types/*`

### 图标工坊开发

1. 在设置页先补齐文本模型、图标生图和抠图配置。
2. 重点回归：
   - `tests/test_api_icon_workbench.py`
   - `tests/test_icon_workbench_service.py`
   - `tests/test_icon_workbench_client.py`
   - `tests/test_settings_service.py`

### 桌面端联调

1. 先确保 `frontend/` 与 `desktop/` 依赖已安装。
2. 在 `desktop/` 运行 `npm run tauri:dev`。
3. 若桌面无法连接后端，优先检查：
   - `output/runtime/backend.json`
   - `logs/backend/runtime.log`
   - 前端是否读取了 `window.__FILE_ORGANIZER_RUNTIME__`

## 设计约束

前端和桌面交互默认按“桌面工作台”而不是“普通网页”设计，具体准则见 [`DESIGN.md`](DESIGN.md)。

简要原则：

- 优先稳定框架、信息密度和长时间使用的低疲劳体验
- 优先工具栏 / 列表 / 主工作区 / 详情区这类结构化布局
- 避免网页式 hero、大横幅、营销化文案和漂浮卡片堆叠
