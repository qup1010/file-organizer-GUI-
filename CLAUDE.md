# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库概览

这是一个本地文件整理工作台，围绕“本地目录整理 + 执行确认 + 历史回看 + 最近一次回退 + 图标工坊”构建的一套桌面化工具链，包含四条主入口：

- Python CLI：交互式整理主流程
- FastAPI 本地 API：给前端工作台和桌面壳提供会话接口
- Next.js 工作台前端：桌面化的整理/历史/设置/图标工坊 UI
- Tauri 桌面壳：拉起/管理本地后端，注入运行时配置，提供原生能力（选目录、应用/恢复图标、抠图等）

主整理链路（CLI / 前端 / 桌面共用同一后端能力）为：

`扫描目录 -> AI 分析 -> 增量整理对话 -> 执行预检 -> 明确确认 (YES) -> 执行文件移动 -> 写执行日志 -> 支持最近一次回退`

当前前端启动流已经开始切换到新的任务壳模型：

`先选来源 (files / folders / mixed sources) -> 决定去向 (归入已有目录 / 生成新的分类结构) -> 按需展开 placement 与策略 -> 进入工作区扫描态`

其中 placement 已经成为会话级显式输入：

- `new_directory_root`
- `review_root`

并遵循：

- 设置页提供全局默认值
- 启动页允许单次任务覆盖
- `Review` 默认跟随 `new_directory_root/Review`

图标工坊链路为：

`扫描目录 -> 语义分析 -> 图标提示生成 -> 图标生图/抠图 -> 应用或恢复文件夹图标`

## 环境要求

- Python 3.11+
- Node.js 18+
- Rust / Cargo（桌面壳构建与开发）
- Windows 环境是第一等场景（大量 Windows 路径、文件夹图标、PowerShell 示例）

说明：

- 项目默认按“Windows 桌面应用”使用场景设计，路径示例大量使用 `D:/...`，桌面壳和图标应用逻辑也都是 Windows 优先。
- 非 Windows 环境做后端/前端开发通常没问题，但涉及桌面壳和图标相关能力时需要真实 Windows。

## 常用命令

### Python 依赖

```bash
pip install -r requirements.txt
```

### CLI 主流程

```bash
python -m file_pilot
```

适合在终端里直接完成扫描、整理计划查看与确认、执行与回退入口提示。

### 回退最近一次执行

```bash
python -m file_pilot.rollback <target_dir>

# 例如：
python -m file_pilot.rollback D:/Downloads
```

会读取最近一次执行 journal，先做回退预检，再按用户确认执行回退。

### 启动本地 API

```bash
python -m file_pilot.api
```

默认：

- 地址：`http://127.0.0.1:8765`
- 运行时文件：`output/runtime/backend.json`
- 健康检查：`GET /api/health`

常用环境变量：

- `FILE_PILOT_API_HOST` / `FILE_PILOT_API_PORT` / `FILE_PILOT_API_BASE_URL`
- `FILE_PILOT_API_RELOAD=false`（桌面宿主默认关闭 reload，避免 runtime 文件归属漂移）
- `FILE_PILOT_API_TOKEN=...`（开启后，除健康检查和必要的 `OPTIONS` 外的 `/api/*` 请求都需要带 token）
- `FILE_PILOT_INSTANCE_ID`（桌面壳用来校验运行时归属）

### 前端工作台

```bash
cd frontend
npm install
npm run dev
```

前端构建：

```bash
cd frontend
npm run build
```

前端类型检查：

```bash
cd frontend
npm run typecheck
```

前端测试：

```bash
cd frontend
npm test

# 单测单文件
npm test -- src/components/session-launcher.test.tsx
```

说明：

- 当前仓库没有单独的前端 lint 脚本；前端改动默认以 `npm run typecheck` + `npm test` 作为主要校验。

运行时地址解析优先级（见 `frontend/src/lib/runtime.ts`）：

1. `window.__FILE_PILOT_RUNTIME__.base_url`
2. `NEXT_PUBLIC_API_BASE_URL`
3. 默认 `http://127.0.0.1:8765`

若注入了 `window.__FILE_PILOT_RUNTIME__.api_token`，前端会自动携带该 token 访问受保护接口及 SSE。

### Tauri 桌面壳

```bash
cd desktop
npm install
npm run tauri:dev
```

桌面构建：

```bash
cd desktop
npm run tauri:build
```

Rust 侧快速校验：

```bash
cd desktop/src-tauri
cargo check
```

桌面壳职责（`desktop/README.md` 概要）：

- 开发态拉起 `python -m file_pilot.api`
- 打包态拉起随应用分发的 `file_pilot_api.exe`，使用动态空闲端口
- 通过 `output/runtime/backend.json` + `/api/health` 校验后端实例
- 向前端注入 `window.__FILE_PILOT_RUNTIME__`
- 暴露目录选择、批量目录选择、文件夹图标应用/恢复、抠图测试等原生命令

## 项目结构与大模块

高层目录（细节可通过文件树自行探索）：

```text
file_pilot/
  analysis/         扫描分析、文件读取、图片/压缩包摘要
  organize/         整理对话、增量计划、策略模板
  execution/        执行计划、journal、执行报告
  rollback/         最近一次执行回退
  app/              会话服务 (OrganizerSessionService) 与会话存储
  api/              FastAPI API 与运行时发现逻辑
  cli/              终端交互、事件打印、会话入口
  icon_workbench/   图标工坊服务、模板、存储、客户端模型
  shared/           配置、日志、路径工具、公共模型
  workflows/        主整理流程与回退流程编排
frontend/           Next.js 工作台前端（桌面体验优先）
desktop/            Tauri 桌面宿主
tests/              Python 单元测试
output/             运行时产物、历史记录、图标工坊输出
logs/               后端运行日志与调试日志
```

### 1. 会话编排核心：OrganizerSessionService

`OrganizerSessionService` 是整个产品的状态机与编排中心：

- 入口：
  - CLI：`file_pilot/cli/session_cli.py` 调用
  - FastAPI：`file_pilot/api/main.py` 调用
- 职责：
  - 管理 session 生命周期、阶段流转
  - 协调扫描、整理对话、预检、执行、回退
  - 聚合生成 `session_snapshot` 供前端/CLI 展示
  - 通过事件流（SSE / CLI 事件打印）向用户推送进度

如果需要理解“这次用户操作为什么会进入某个阶段”，先看：

- `file_pilot/app/session_service.py`
- `file_pilot/app/session_store.py`（持久化）

补充：

- 当前 `OrganizerSessionService` 更像一个门面 / 编排器，具体职责已开始拆给：
  - `SessionLifecycleService`：创建、恢复、放弃、阶段合法性
  - `ScanWorkflowService`：扫描入口、增量范围确认、扫描后流转
  - `PlanningConversationService`：对话与规划推进
  - `SnapshotBuilder`：前端消费的 `session_snapshot` 装配
  - `TargetResolver`：placement、Review、slot 与真实路径解析
- 改会话行为时，通常不要只盯 `session_service.py` 单文件；先确认逻辑属于哪个委托服务，再改对应测试。
- placement / target_dir / Review / slot 的主规则已经不应继续分散实现。

这意味着：如果你看到 `session_service.py` 很大，先找它委托出去的服务，而不是继续把新规则塞回主类里。

### 2. 会话持久化与锁

会话不是一次性内存对象，而是持久化状态机：

- 存储位置：`output/sessions`
- 管理模块：`file_pilot/app/session_store.py`
- 特点：
  - 每个目标目录同一时间只允许一个可写会话（目录锁也在此目录下）
  - 会话支持恢复、失效标记、放弃、只读历史查看
- 很多行为是“可恢复的工作会话”，而不是单次 CLI 调用

当前目录锁语义补充：

- 锁 key 仍然基于 `session.target_dir`
- `completed / abandoned / stale` 的锁允许后续新会话回收
- `interrupted` 默认继续保留锁，视为用户可能恢复的活动会话
- 损坏的 lock file 会在重新获取/释放时做本地容错清理

会话创建的关键输入现在包括：

- `sources[]`
- `organize_method`
- `output_dir`
- `target_directories[]`
- `new_directory_root`
- `review_root`

涉及会话锁、并发、恢复逻辑时务必查阅 `session_store` 与相关测试。

### 3. 分析层：只负责“看懂当前目录”，不负责落盘执行

分析服务在：

- `file_pilot/analysis/service.py`

职责：

- 只分析目标目录当前层条目（不做递归）
- 支持：
  - 文本文件读取（兼容常见 Windows 中文编码）
  - PDF / Word / Excel 摘要
  - `.zip` 索引预览（不解压）
  - 图片摘要（使用独立 Vision 配置）
- 校验分析结果必须覆盖当前层全部条目
- 产出规范化 `scan_lines`，供整理层消费

修改分析逻辑时，要保住：

- “完整覆盖当前层条目并校验”的约束
- 不要在分析层做执行类决策（位置在 organize/execution）

### 4. 整理层：增量规划器，而不是一次性生成最终命令

整理服务在：

- `file_pilot/organize/service.py`

关键点：

- 基于 `scan_lines + 对话消息 + 已确认偏好` 生成整理计划
- 模型通过工具调用提交“本轮 diff”，系统在本地维护完整计划
- 区分：
  - `PendingPlan`：待确认的增量计划
  - `FinalPlan`：最终执行计划
- 前端展示的摘要、分组、待确认项等都来自这里生成的快照

如果要改交互体验（比如“摘要视图/改动视图/待确认项视图”的行为），优先改：

- `organize` 层 & `session_snapshot` 的生成方式
- 而不是直接动 `execution`

补充：

- `request_unresolved_choices` 已经移除
- 不确定项统一通过 `unresolved + Review` 表达
- 模型不再负责生成交互式待确认泡泡；前端主预览区负责手动改目标

### 5. 执行层：只认结构化最终计划

执行服务在：

- `file_pilot/execution/service.py`

只接受结构化 `FinalPlan`，转换为真实文件系统动作：

- `MKDIR`
- `MOVE`

执行前会做真实文件系统预检：

- 源是否存在
- 目标是否已存在
- 是否移动到自身子路径
- 目标父目录是否存在或将被创建

执行日志与回退依据写入：

- `output/history/executions`

修改执行行为或 journal 结构时，一定要同步关注回退服务。

### 6. 回退：依赖 journal，而不是重新推理

回退服务在：

- `file_pilot/rollback/service.py`

行为：

- 依据最近一次 execution journal 做回退
- 不重新推理，而是按 journal 的结构化记录“反向执行”

如果改了 execution journal 的结构，必须考虑：

- 回退是否还能正确读取旧数据和当前数据
- 测试：`tests/test_rollback_*`

### 7. 图标工坊链路

图标工坊模块在：

- `file_pilot/icon_workbench/`

职责：

- 扫描目标目录，分析语义和聚类
- 为文件夹生成图标提示/模板
- 通过图标生图模型生成预览
- 根据配置决定保存模式：
  - `centralized`：集中保存到某个目录
  - `in_folder`：保存在每个目标文件夹中
- 联动抠图服务（内置预设 + 自定义服务）增强图标质量
- 通过 API 与桌面壳联动：
  - 应用 / 恢复文件夹图标
  - 报告应用结果

图标工坊相关 API/服务改动时，建议同步回归：

- `tests/test_api_icon_workbench.py`
- `tests/test_icon_workbench_service.py`
- `tests/test_icon_workbench_client.py`
- `tests/test_settings_service.py`

### 8. FastAPI API & 运行时契约

FastAPI 主入口：

- `file_pilot/api/main.py`

核心职责：

- 会话生命周期接口（创建/载入/更新/预检/执行/回退等）
- 历史与 journal：`/api/history/*`
- 设置管理与连接测试：`/api/settings/*`
- 图标工坊接口：`/api/icon-workbench/*`
- 本地工具接口：`/api/utils/*`（打开目录、选择目录、兼容配置等）
- SSE 事件流：`GET /api/sessions/{session_id}/events`

鉴权：

- 若设置了 `FILE_PILOT_API_TOKEN`，除少量公共端点（健康检查等）外，其余 `/api/*` 需要 token：
  - `Authorization: Bearer <token>`
  - 或 `x-file-pilot-token: <token>`
  - SSE 场景使用 `?access_token=<token>`

运行时发现机制（桌面/前端/后端共享契约）：

- `output/runtime/backend.json`
- `window.__FILE_PILOT_RUNTIME__.base_url`
- `window.__FILE_PILOT_RUNTIME__.api_token`

桌面端启动握手不仅仅是“文件存在”，还要校验：

1. Python API 是否成功启动
2. `output/runtime/backend.json` 是否生成且 `instance_id`/`pid` 属于当前后端
3. `/api/health` 返回值是否与 runtime 文件一致
4. 前端是否正确读取注入的 `base_url` / `api_token`
5. 非桌面场景下是否误用了 `NEXT_PUBLIC_API_BASE_URL` 或默认地址

**不要随意改运行时发现逻辑**，否则桌面启动、前端 API 连接与本地联调用例会一起出问题。

### 9. 前端工作台（Next.js）

前端位于：

- `frontend/src`

关键模块：

- `src/lib/api.ts`：REST client
- `src/lib/use-session.ts`：会话加载、SSE 订阅、工作台状态同步
- `src/components/workspace-client.tsx`：整理工作台主容器
- `src/components/session-launcher-shell.tsx`：新的任务启动壳子
- `src/types/session.ts`：与后端共享的 `session_snapshot` 类型

设计原则：

- 这是“桌面工作台”，不是一般网页：
  - 优先任务连续性、信息密度、分栏协作和长时间操作稳定性
  - 优先工具栏/侧栏/主工作区/详情区结构
  - 避免 hero 区、营销大横幅、漂浮卡片堆叠等网页式形态
- 详情见根目录 `DESIGN.md`

启动流的当前产品方向：

- 先交来源
- 再决定去向
- 再按需展开 placement / 输出目录 / 目标目录池 / 风格参数
- 扫描过程在工作区中展示，而不是停留在启动前遮罩

前端与设置页关于 placement 的规则：

- 全局默认值放在 `global_config`
- 任务页可覆盖
- `review_root` 默认跟随 `new_directory_root/Review`
- 当前桌面端来源选择仍保留两个显式按钮：
  - `选择文件`
  - `选择文件夹`
  不要假设 Tauri 已有单次原生混选文件和文件夹的能力

运行时发现与 Tauri 接线：

- 宿主应注入：

  ```ts
  window.__FILE_PILOT_RUNTIME__ = {
    base_url: "http://127.0.0.1:8765",
    api_token: "optional-token",
  };
  ```

- 前端不会猜测端口，也不会读后端 stdout，由上述对象与环境变量决定连接地址。

### 10. 桌面宿主（Tauri）

桌面宿主位于：

- `desktop/`
- Rust 代码主要在 `desktop/src-tauri/`（`backend.rs`、`runtime.rs`、`icon_apply.rs`、`bg_removal.rs` 等）

职责小结：

- 开发态：拉起 `python -m file_pilot.api`
- 打包态：拉起 `file_pilot_api.exe`，使用动态空闲端口
- 等待并校验 `output/runtime/backend.json`
- 通过 `/api/health` 判定后端健康状态与实例归属
- 注入 `window.__FILE_PILOT_RUNTIME__`
- 提供图标应用/恢复、抠图测试、目录选择等原生命令
- 保证单实例桌面应用（重复启动时激活已有窗口）

当前原生命令中，来源选择仍是两套能力：

- `pick_files`
- `pick_directories`

它们都基于 `rfd::FileDialog`。当前版本不要把“统一入口文案”误解成“桌面端已经支持真正的原生混选文件/文件夹”。

## 配置、输出与日志

配置：

- 推荐入口：根目录 `config.json`
- 仓库提供脱敏示例：
  - `config.example.json`
  - `.env.example`
- 统一设置服务会将文本模型、图片理解、图标生图、抠图配置整合到统一 schema，并在读取时尽量迁移旧配置。
- `config.json` 与实际敏感配置文件均在 `.gitignore` 中，不应提交版本控制。

文件读取与图片能力：

- 文本读取支持常见 Windows 中文编码 fallback
- 支持 PDF / Word / Excel 摘要
- `.zip` 只做索引预览，不解压
- 图片摘要使用独立 Vision 配置（不复用主整理模型上下文）

运行时文件：

- `output/runtime/backend.json`：后端运行时发现文件

历史与执行产物：

- `output/history/executions`：执行 journal
- `output/history/latest_by_directory.json`：目录到最近一次执行的索引
- `output/icon_workbench/`：图标工坊会话与生成产物
- `output/sessions/`：会话状态与锁文件

日志：

- `logs/backend/runtime.log`：基础运行日志（按天轮转）
- `logs/backend/debug.jsonl`：结构化调试日志（由“详细日志”开关控制）

## 状态机与跨端协议

### session stage 是协议，不只是展示字段

主链路阶段：

- 初次整理常见流：`draft -> scanning -> planning -> ready_for_precheck -> ready_to_execute -> executing -> completed`
- 增量归档常见流：`draft -> scanning -> selecting_incremental_scope -> planning -> ready_for_precheck -> ready_to_execute -> executing -> completed`

补充说明：

- `selecting_incremental_scope` 是当前真实阶段名，不是历史文档遗留字段；增量模式扫描后会先停在这里等待用户确认本轮处理范围。
- `planning` 之前的阶段也会影响前端工作区展示与可操作按钮，不要只把它当后端内部状态。

重要分组：

- 终止态：`abandoned`、`completed`、`stale`
- 加锁态：`scanning`、`executing`、`rolling_back`
- 异常恢复：`interrupted`、`stale`

很多 `SESSION_STAGE_CONFLICT` 都与此有关。修改阶段流转前，先看：

- `file_pilot/app/session_service.py`
- 相关测试：`tests/test_session_service.py`、`tests/test_main_flow.py`

### session_snapshot / stage / 事件名称是跨端契约

Python 与前端/桌面共享的契约包括：

- `session_snapshot` 结构
- session stage 名称
- SSE 事件名称
- unresolved choices block 结构
- 前端 `RuntimeConfig` 中的 `base_url` / `api_token`

补充：

- `plan_snapshot.placement`
- `target_slots[*].real_path`
- `strategy.new_directory_root`
- `strategy.review_root`

现在也已经是前后端共享的重要消费字段

**只改一端通常会把工作台打坏**。涉及这些字段时，至少同步检查：

- `file_pilot/app/session_service.py`
- `file_pilot/api/main.py`
- `frontend/src/types/session.ts`
- `frontend/src/lib/use-session.ts`
- `frontend/src/lib/runtime.ts`

## 修改时优先回归的测试

会话 / 状态机 / 快照：

```bash
python -m unittest tests.test_session_service -v
python -m unittest tests.test_session_lifecycle_service -v
python -m unittest tests.test_scan_workflow_service -v
python -m unittest tests.test_planning_conversation_service -v
python -m unittest tests.test_api_sessions -v
python -m unittest tests.test_main_flow -v
```

单个 Python 测试类：

```bash
python -m unittest tests.test_session_service.OrganizerSessionServiceTests -v
python -m unittest tests.test_target_resolver.TargetResolverTests -v
```

运行时发现 / API 启动：

```bash
python -m unittest tests.test_api_runtime -v
```

回退链路：

```bash
python -m unittest tests.test_rollback_service -v
python -m unittest tests.test_rollback_last_execution -v
```

图标工坊与设置：

```bash
python -m unittest tests.test_api_icon_workbench -v
python -m unittest tests.test_icon_workbench_service -v
python -m unittest tests.test_icon_workbench_client -v
python -m unittest tests.test_settings_service -v
```

前端接口或工作台状态：

```bash
cd frontend
npm run typecheck
```

Tauri / 桌面宿主：

```bash
cd desktop/src-tauri
cargo check
```

## 推荐开发工作流（概要）

整理主链路开发：

1. 运行 `python -m file_pilot.api`
2. 如需前端联调，在 `frontend/` 运行 `npm run dev`
3. 修改会话状态机、事件流、`session_snapshot` 或 API schema 时：
   - 同时看 `tests/test_api_*.py`、`tests/test_session_*.py`、`tests/test_main_flow.py`
   - 同时更新前端 `src/types/session.ts` 与相关 hooks

图标工坊开发：

1. 在设置页补齐文本模型、图标生图和抠图配置
2. 回归：
   - `tests/test_api_icon_workbench.py`
   - `tests/test_icon_workbench_service.py`
   - `tests/test_icon_workbench_client.py`
   - `tests/test_settings_service.py`

桌面端联调：

1. 确保 `frontend/` 与 `desktop/` 依赖已安装
2. 在 `desktop/` 运行 `npm run tauri:dev`
3. 桌面无法连接后端时优先检查：
   - `output/runtime/backend.json`
   - `logs/backend/runtime.log`
   - 前端是否读取了 `window.__FILE_PILOT_RUNTIME__`
