# Tauri FastAPI Desktop Workbench 设计说明

## 目标

将当前以 CLI 为主的本地文件整理原型升级为桌面工作台：

- 桌面技术栈采用 `Tauri + Next.js/React + FastAPI`
- 保留现有 Python 领域能力，不重写分析、整理、执行、回退核心逻辑
- 首版优先跑通完整闭环：`选目录 -> 扫描 -> 生成计划 -> 调整 -> 预检 -> 执行 -> 回退`
- 首版交互以“向导主导 + AI 辅助调整”为主，不追求复杂动画与强展示感

## 首版里程碑边界

本设计覆盖的是一个单一 MVP 里程碑：本地桌面工作台的首版闭环，而不是多个互相独立的产品。

该 MVP 必须包含：

- 本地目录选择与扫描
- AI 结构化分析与整理计划生成
- 轻量手动调整
- 预检与显式执行确认
- 执行 journal 与最近一次回退
- 轻量会话恢复
- `stale` / `interrupted` 基础恢复引导

以下内容明确延后到后续里程碑：

- token 级流式 AI 输出
- 复杂批量规则编辑器
- 执行中断后的断点续执行
- 多会话并发工作台
- 复杂动画与视觉增强
- 自动回退后自动重扫

## 非目标

以下能力不纳入首版范围：

- token 级流式聊天输出
- 复杂批量规则编辑器
- 执行中断后的断点续执行
- 多会话并发工作台
- 高保真视觉动效与复杂设计系统

## 当前项目基础

当前仓库已经具备桌面化的核心业务基础：

- `analysis`：目录扫描、文件读取、AI 结构化分析
- `organize`：增量 `plan diff`、`PendingPlan` / `FinalPlan`、计划校验
- `execution`：执行预检、实际文件移动、journal 落盘
- `rollback`：最近一次执行回退
- `shared`：配置、路径工具、history store
- `cli/workflows`：现有终端工作流与展示层

当前问题不在于能力缺失，而在于编排中心仍然偏 CLI：输入、状态推进、展示、AI 循环、执行确认耦合在 `workflow` 中，不利于桌面前后端接入。

## 总体架构

桌面版采用四层结构：

### 1. Domain Core

保留现有业务核心模块，尽量保持“纯输入 -> 纯输出”的函数式风格：

- `analysis`
- `organize`
- `execution`
- `rollback`
- `shared`

这一层不依赖 CLI、FastAPI、Tauri。

### 2. Application Services

新增应用服务层，负责“桌面工作台语义”的编排：

- `AsyncScanner`
- `OrganizerSession`
- `OrganizerSessionService`
- `SessionStore`

这一层负责状态机、锁定规则、会话持久化、异步任务推进、快照生成。

### 应用服务公开方法

为便于规划和测试，首版将应用服务层的公开边界固定如下：

#### `AsyncScanner`

- `start(session_id: str) -> None`
  - 启动后台扫描任务
- `get_progress(session_id: str) -> ScannerProgress`
  - 获取当前进度快照
- `cancel(session_id: str) -> None`
  - 首版可保留接口但不对前端暴露

#### `SessionStore`

- `create(target_dir: Path) -> OrganizerSession`
- `load(session_id: str) -> OrganizerSession | None`
- `save(session: OrganizerSession) -> None`
- `find_latest_by_directory(target_dir: Path) -> OrganizerSession | None`
- `mark_abandoned(session_id: str) -> None`
- `acquire_directory_lock(target_dir: Path, owner_id: str) -> LockResult`
- `release_directory_lock(target_dir: Path, owner_id: str) -> None`

#### `OrganizerSessionService`

- `create_session(target_dir: str, resume_if_exists: bool) -> CreateSessionResult`
- `resume_session(session_id: str) -> OrganizerSession`
- `start_scan(session_id: str) -> OrganizerSession`
- `refresh_session(session_id: str) -> OrganizerSession`
- `submit_user_intent(session_id: str, content: str) -> SessionMutationResult`
- `update_item_target(session_id: str, item_id: str, target_dir: str | None, move_to_review: bool) -> SessionMutationResult`
- `run_precheck(session_id: str) -> SessionMutationResult`
- `execute(session_id: str, confirm: bool) -> SessionMutationResult`
- `cleanup_empty_dirs(session_id: str) -> SessionMutationResult`
- `rollback(session_id: str, confirm: bool) -> SessionMutationResult`
- `get_snapshot(session_id: str) -> SessionSnapshot`
- `get_journal_summary(session_id: str) -> JournalSummary`

这些方法构成 CLI、FastAPI 和测试的统一调用面。

### 服务层返回值最小 Schema

`LockResult`

- `acquired: bool`
- `lock_owner_session_id`
- `reason`
  - `acquired`
  - `active_lock`
  - `stale_lock_reclaimed`
  - `unknown_lock_state`

`CreateSessionResult`

- `mode`
  - `created`
  - `resume_available`
- `session`
- `restorable_session`

`SessionMutationResult`

- `session_snapshot`
- `assistant_message`
- `changed: bool`
- `warnings`

`JournalSummary`

- `journal_id`
- `execution_id`
- `status`
- `success_count`
- `failure_count`
- `created_at`

`available_actions`

- `scan`
- `refresh`
- `update_item`
- `submit_intent`
- `precheck`
- `execute`
- `cleanup_empty_dirs`
- `rollback`
- `view_journal`
- `abandon`

### 3. API Layer

使用 `FastAPI` 暴露本地 API：

- REST 负责创建会话、提交用户意图、预检、执行、回退
- SSE 负责扫描进度与状态变化推送

API 层保持薄，不承载业务判断。

### 4. Presentation Layer

- `Tauri + Next.js/React`：桌面前端
- `CLI`：保留为薄适配层与调试入口

CLI 不再作为业务中心，而是复用应用服务层。

## 交互形态

首版采用“向导主导 + 对话抽屉/输入区辅助”的混合式工作台：

- 主体是结构化整理工作区，不是聊天应用
- AI 用于辅助批量调整和解释当前变化
- 手动调整范围限定为轻量版：
  - 确认待定项
  - 修改单个条目的目标目录
  - 将项目归入 `Review`

前端优先呈现：

- 当前阶段
- 当前计划
- 待确认项
- 本轮变化
- 预检风险
- 执行结果与回退入口

## OrganizerSession 设计

`OrganizerSession` 是桌面工作台的单一事实来源。它不只保存消息，还保存完整整理上下文。

建议字段：

- `session_id`
- `target_dir`
- `stage`
- `messages`
- `scan_lines`
- `pending_plan`
- `plan_snapshot`
- `user_constraints`
- `scanner_progress`
- `assistant_message`
- `precheck_summary`
- `execution_report`
- `rollback_report`
- `last_journal_id`
- `integrity_flags`
- `created_at`
- `updated_at`
- `stale_reason`
- `last_error`

## 状态机

首版状态机建议如下：

- `draft`
- `scanning`
- `planning`
- `stale`
- `ready_for_precheck`
- `ready_to_execute`
- `executing`
- `completed`
- `rolling_back`
- `interrupted`

主链路：

`draft -> scanning -> planning -> ready_for_precheck -> ready_to_execute -> executing -> completed`

恢复链路：

`planning -> stale -> scanning -> planning`

回退链路：

`completed -> rolling_back -> stale`

异常链路：

`scanning/executing/rolling_back -> interrupted`

### 状态语义

- `stale`：当前目录内容已变化，旧计划不再完全可信，禁止直接执行
- `interrupted`：应用异常关闭或任务中途中断，需要用户查看详情或重新建立信任
- `rolling_back`：回退中的显式锁定态

### 关键动作语义

为避免 `resume / scan / refresh / recover` 语义混淆，首版统一定义如下：

- `create session`
  - 创建空 session，初始状态为 `draft`
- `scan`
  - 从 `draft` 启动首次扫描
  - 状态迁移：`draft -> scanning -> planning`
- `resume`
  - 表示“加载已有 session，并立即执行一次陈旧性检测后返回快照”
  - 若目录未变化，则保持原业务状态
  - 若目录已变化，则将 session 修正为 `stale`
- `refresh`
  - 仅允许从 `stale` 或 `interrupted` 触发
  - 语义是“重新扫描当前目录，并尝试将旧计划映射到新扫描结果”
  - 状态迁移：`stale/interrupted -> scanning -> planning`
- `recover`
  - 首版不提供独立 recover 动作
  - 恢复行为由 `resume` 完成，重新建立信任由 `refresh` 完成

换句话说：

- `resume` 是“加载旧状态并做一次状态修正”
- `refresh` 是“重扫并重建可信计划”
- `scan` 是“首次建立计划”

## AsyncScanner 设计

当前扫描逻辑是同步阻塞的。桌面版不重写分析核心，而是在其外层增加 `AsyncScanner` 包装：

- 以后台任务方式运行扫描
- 按条目推进进度
- 将阶段性结果写回 session
- 通过 SSE 推送进度事件

### 扫描事件建议字段

- `processed_count`
- `total_count`
- `current_item`
- `message`
- `recent_analysis_items`

其中 `recent_analysis_items` 最多保留最近 3-5 条，字段为：

- `entry_name`
- `suggested_purpose`
- `summary`

前端扫描页据此展示“最近理解结果”滚动流水线，增强即时反馈。

## 计划快照设计

后端关键接口不再返回纯文本，而是返回结构化 `plan_snapshot`。

建议包含：

- `summary`
- `groups`
- `unresolved_items`
- `review_items`
- `invalidated_items`
- `change_highlights`
- `stats`
- `readiness`
- `integrity_flags`

### 条目最小 Schema

为避免 `item_name` 歧义，首版的扫描项、计划项、待确认项统一使用稳定引用：

- `item_id`
  - 首版建议采用 `source_relpath` 的规范化字符串
  - 当前项目默认只处理目标目录当前层，因此通常等于原始条目名
  - 即使显示名重复，内部仍以 `item_id` 作为唯一键
- `display_name`
- `source_relpath`
- `target_relpath`
- `status`
  - `planned`
  - `unresolved`
  - `review`
  - `invalidated`
- `suggested_purpose`
- `summary`

首版所有写操作接口应优先使用 `item_id`，而不是只用 `item_name`。

### Session Snapshot 最小 Schema

`session_snapshot` 至少包含：

- `session_id`
- `target_dir`
- `stage`
- `summary`
- `scanner_progress`
- `plan_snapshot`
- `precheck_summary`
- `execution_report`
- `rollback_report`
- `last_journal_id`
- `integrity_flags`
- `available_actions`
- `updated_at`

其中：

- `scanner_progress`
  - `processed_count`
  - `total_count`
  - `current_item`
  - `recent_analysis_items`
- `plan_snapshot`
  - `groups`
  - `unresolved_items`
  - `review_items`
  - `invalidated_items`
  - `change_highlights`
  - `stats`
  - `readiness`
- `integrity_flags`
  - `is_stale`
  - `has_invalidated_items`
  - `has_partial_execution`
  - `has_partial_rollback`

### Report 最小 Schema

`execution_report` 至少包含：

- `execution_id`
- `journal_id`
- `success_count`
- `failure_count`
- `status`
  - `success`
  - `partial_failure`
  - `aborted`
- `has_cleanup_candidates`
- `cleanup_candidate_count`

`rollback_report` 至少包含：

- `journal_id`
- `restored_from_execution_id`
- `success_count`
- `failure_count`
- `status`
  - `success`
  - `partial_failure`
  - `aborted`

`precheck_summary` 至少包含：

- `can_execute`
- `blocking_errors`
- `warnings`
- `mkdir_preview`
- `move_preview`

### 快照安全规则

在 `stale -> refresh` 过程中，如果出现以下情况：

- 原已分类条目消失
- 原用户确认项消失
- 原路径映射失败
- 原分类信任链失效

则这些项目必须进入：

- `invalidated_items`

并同时：

- 在 `Review` 分组中高亮
- 在摘要区提示数量
- 明确提示用户重新确认这些条目

系统不得静默吞掉这些失效分类。

## Session Persistence

首版必须支持轻量化会话恢复。

### 存储方式

- `output/sessions/<session_id>.json`
- `output/sessions/latest_by_directory.json`

### 恢复策略

- `target_dir` 作为恢复入口键
- 用户再次打开同目录时，提示是否继续上次整理
- 恢复后进行陈旧性检查
- 若目录内容与原扫描结果不一致，则标记为 `stale`

### 首版恢复边界

优先可靠恢复以下场景：

- 已扫描完成但未执行的会话
- 已执行完成、可查看结果和回退的会话

首版不尝试恢复：

- 扫描中断后的继续扫描
- 执行中断后的继续执行

### 中断与 Journal 关联

若应用在 `executing` 中被关闭，恢复时：

- session 进入 `interrupted`
- 自动关联最近一次未完成 journal
- 快照中写入 `last_journal_id`
- 前端提示用户优先查看执行详情或尝试回退

## API 设计

首版接口围绕 `session` 组织。

### Session

- `POST /api/sessions`
- `GET /api/sessions/{session_id}`
- `POST /api/sessions/{session_id}/resume`
- `POST /api/sessions/{session_id}/abandon`

### Streaming

- `GET /api/sessions/{session_id}/events`

使用 `SSE`，用于推送：

- `scan.started`
- `scan.progress`
- `scan.completed`
- `plan.updated`
- `session.stale`
- `precheck.ready`
- `execution.started`
- `execution.completed`
- `rollback.started`
- `rollback.completed`
- `session.interrupted`
- `session.error`

### Scan

- `POST /api/sessions/{session_id}/scan`
- `POST /api/sessions/{session_id}/refresh`

### Planning

- `POST /api/sessions/{session_id}/messages`
- `POST /api/sessions/{session_id}/update-item`

### Precheck

- `POST /api/sessions/{session_id}/precheck`

### Execution

- `POST /api/sessions/{session_id}/execute`
- `POST /api/sessions/{session_id}/cleanup-empty-dirs`

### Rollback

- `POST /api/sessions/{session_id}/rollback`
- `GET /api/sessions/{session_id}/journal`

### 最小接口契约

下表只定义首版实现和测试所必需的最小契约，详细 schema 可在实现阶段进一步固化为 Pydantic 模型。

| Endpoint | Request | Success Response | Errors | Preconditions | State Result |
|----------|---------|------------------|--------|---------------|--------------|
| `POST /api/sessions` | `target_dir`, `resume_if_exists` | `mode`, `session_id`, `stage`, `restorable_session`, `session_snapshot` | `400 INVALID_TARGET_DIR`, `403 DIRECTORY_NOT_ACCESSIBLE` | `target_dir` 存在且可读 | `mode=created` 时新建 `draft`；`mode=resume_available` 时不创建新 session，只返回可恢复对象 |
| `GET /api/sessions/{session_id}` | 无 | `session_snapshot` | `404 SESSION_NOT_FOUND` | session 存在 | 不变 |
| `POST /api/sessions/{session_id}/resume` | 无 | `session_snapshot` | `404 SESSION_NOT_FOUND`, `409 SESSION_NOT_RESUMABLE` | session 已落盘 | 加载后立即执行陈旧性检测；结果为原状态或 `stale` |
| `POST /api/sessions/{session_id}/abandon` | 无 | `session_snapshot` | `404 SESSION_NOT_FOUND`, `409 SESSION_STAGE_CONFLICT` | 不处于锁定态 | 当前 session 归档，不再作为默认恢复对象 |
| `GET /api/sessions/{session_id}/events` | SSE 连接 | `event_type`, `stage`, `session_snapshot`, 可选进度字段 | 连接断开时前端重连 | session 存在 | 不变 |
| `POST /api/sessions/{session_id}/scan` | 无 | `accepted`, `session_snapshot` | `404 SESSION_NOT_FOUND`, `409 SESSION_STAGE_CONFLICT` | `draft` | 进入 `scanning` |
| `POST /api/sessions/{session_id}/refresh` | 无 | `accepted`, `session_snapshot` | `404 SESSION_NOT_FOUND`, `409 SESSION_STAGE_CONFLICT` | `stale` 或 `interrupted` | 进入 `scanning`，完成后到 `planning` |
| `POST /api/sessions/{session_id}/messages` | `content` | `assistant_message`, `session_snapshot` | `404 SESSION_NOT_FOUND`, `409 SESSION_STAGE_CONFLICT`, `504 AI_TIMEOUT` | `planning` 或 `ready_for_precheck` | 更新计划，留在 `planning` 或进入 `ready_for_precheck` |
| `POST /api/sessions/{session_id}/update-item` | `item_id`, `target_dir`, `move_to_review` | `session_snapshot` | `404 ITEM_NOT_FOUND`, `409 SESSION_STAGE_CONFLICT`, `422 INVALID_TARGET_DIR` | `planning` | 更新计划，可能进入 `ready_for_precheck` |
| `POST /api/sessions/{session_id}/precheck` | 无 | `precheck_summary`, `session_snapshot` | `409 SESSION_STAGE_CONFLICT`, `422 PLAN_NOT_READY` | `ready_for_precheck` 或 `planning` | 预检通过后进入 `ready_to_execute`，失败则回 `planning` |
| `POST /api/sessions/{session_id}/execute` | `confirm=true` | `session_snapshot` 含 `execution_report` | `409 SESSION_STAGE_CONFLICT`, `422 PRECHECK_REQUIRED`, `500 EXECUTION_ABORTED` | `ready_to_execute` | 可正常结束到 `completed`；部分失败仍为 `completed`；仅在无法形成可信 report 时进入 `interrupted` |
| `POST /api/sessions/{session_id}/cleanup-empty-dirs` | 无 | `session_snapshot`, `cleaned_count` | `409 SESSION_STAGE_CONFLICT` | `completed` 且存在候选目录 | 保持 `completed` |
| `POST /api/sessions/{session_id}/rollback` | `confirm=true` | `session_snapshot` 含 `rollback_report` | `409 SESSION_STAGE_CONFLICT`, `422 ROLLBACK_NOT_AVAILABLE`, `500 ROLLBACK_ABORTED` | `completed` 或 `interrupted` 且存在 journal | 可正常结束到 `stale`；部分失败仍返回 `stale` + `rollback_report`；仅在无法形成可信 report 时保持 `interrupted` |
| `GET /api/sessions/{session_id}/journal` | 无 | `journal_summary` | `404 JOURNAL_NOT_FOUND` | session 存在且关联 journal | 不变 |

### 错误码分层

首版错误码分为四类：

- 请求错误：`400` / `422`
  - 非法路径、非法目标目录、非法参数
- 状态冲突：`409`
  - `SESSION_STAGE_CONFLICT`
- 资源缺失：`404`
  - session、item、journal 不存在
- 运行失败：`500` / `504`
  - 文件系统错误、AI 超时、执行失败、回退失败

所有非查询接口的错误响应都应尽量附带：

- `error_code`
- `message`
- `stage`
- `session_snapshot`

### `POST /sessions` 响应分支

为避免首页恢复流歧义，`POST /api/sessions` 首版只允许两种成功模式：

- `mode=created`
  - 后端已创建一个新的 `draft` session
  - 返回新 `session_id`
- `mode=resume_available`
  - 后端发现同目录存在可恢复 session
  - 本次请求不创建新 session
  - 返回 `restorable_session.session_id`
  - 前端据此弹出“继续/重新开始”选择

前端若选择继续，显式调用 `POST /resume`。  
前端若选择放弃旧会话并重新开始，必须遵循固定顺序：

1. 调用 `POST /api/sessions/{old_session_id}/abandon`
2. 后端释放目录锁并将旧 session 标记为 `abandoned`
3. 前端再次调用 `POST /api/sessions`，并设置 `resume_if_exists=false`

首版不允许“带活动锁直接覆盖旧 session”。

### 单一条目更新语义

首版不再区分“resolve-item”与“move-item”两条写路径，统一使用：

- `POST /api/sessions/{session_id}/update-item`

规则如下：

- `move_to_review=true`
  - 忽略 `target_dir`
  - 将条目放入 `Review`
- `move_to_review=false`
  - 必须提供 `target_dir`
  - 将条目目标目录改为该目录

只要这次更新解决了待确认项，就应同时把它从 `unresolved_items` 中移除。

## 桌面进程编排

首版桌面集成采用“由 Tauri 守护 Python FastAPI 子进程”的模式。

### 启动方式

- Tauri 启动时拉起本地 Python 后端进程
- 后端绑定到本机回环地址
- 端口优先从配置读取；若被占用则回退到动态端口
- Tauri 通过健康检查接口确认 FastAPI 已就绪

### 地址发现

- 后端启动成功后，将实际监听地址写入唯一的运行时 JSON 文件：
  - `output/runtime/backend.json`
- 文件至少包含：
  - `base_url`
  - `port`
  - `pid`
  - `started_at`
- Tauri 轮询该文件并结合健康检查确认后端可用
- 前端只从 Tauri 注入的运行时配置中读取 `base_url`
- 前端不自行猜测端口，也不直接解析 stdout

### 守护与退出

- 若 FastAPI 进程异常退出，Tauri 应提示“本地服务已断开”，并提供重试入口
- 用户退出桌面应用时，Tauri 负责回收 Python 子进程
- 若回收失败，后端进程也必须支持下次启动时通过健康检查与端口冲突检测自恢复

## 目录身份规范化

所有与目录相关的持久化、恢复、锁定逻辑都必须复用同一套规范化规则，避免同一物理目录被识别成多个对象。

规范化后的 `canonical_target_dir` 规则：

- 转为绝对路径
- 解析 `.` / `..`
- 去除尾随分隔符
- 在 Windows 上统一大小写比较语义
- 若符号链接或 junction 可安全解析，则使用解析后的真实路径

以下位置都必须使用 `canonical_target_dir`，而不是原始输入字符串：

- `OrganizerSession.target_dir`
- `latest_by_directory.json` 的 key
- `directory_hash`
- 目录锁文件
- 会话查找与恢复逻辑

## 目录锁规则

为避免同一目录被多个活动 session 同时写入，首版使用目录级锁文件。

### 锁文件位置

- `output/sessions/locks/<directory_hash>.lock`

锁文件内容至少包含：

- `target_dir`
- `owner_session_id`
- `pid`
- `created_at`
- `updated_at`

### 生命周期

- 创建或恢复活动 session 时尝试获取锁
- session 进入 `completed`、`abandoned`，或应用正常退出时释放锁
- 锁持有期间，同目录的新建/恢复请求返回活动 session 信息或冲突提示

### 陈旧锁清理

若发现锁存在，但：

- 持有进程不存在
- 且 `updated_at` 超过允许阈值

则可判定为陈旧锁并自动清理。

若锁状态不明确，则不自动覆盖，优先提示用户该目录已有活动会话。

## 恢复索引文件规则

`latest_by_directory.json` 与 session 文件同样属于恢复链路的关键数据，必须具备相同级别的可靠性。

### 原子更新

索引更新采用与 session 文件一致的策略：

- 先写入同目录临时文件
- 成功后原子替换正式文件

### 并发写保护

- 仅允许 `SessionStore` 负责读写该索引
- 在同一进程内通过 session store 串行化写入
- 若未来出现多进程写入，再升级为文件锁；首版先不对外暴露多进程写入口

### 损坏恢复

若索引文件损坏或无法解析：

- 回退为空索引
- 记录错误日志
- 不阻塞新 session 创建
- 不尝试从损坏索引恢复旧会话

## 长请求与锁定规则

### `POST /messages` 长请求

AI 规划请求可能持续 5-15 秒。首版不做 token 流式输出，但必须按长请求设计：

- 前端超时时间建议设为 60 秒
- 提交时明确进入“AI 正在思考方案...”状态
- 锁定会影响计划的操作区域
- 请求完成后使用新的 `session_snapshot` 直接重渲染

### Stage Guard

应用服务层统一做阶段校验，禁止在锁定态下调用不合法操作。

锁定态：

- `scanning`
- `executing`
- `rolling_back`

锁定态下，除查询类接口外，其余 Planning / Precheck / Refresh 等操作统一返回：

- HTTP `409 Conflict`
- 错误码：`SESSION_STAGE_CONFLICT`
- 返回当前 `stage` 与最新 `session_snapshot`

## Session 持久化细节

### 会话文件格式

每个 session JSON 至少包含：

- `version`
- `session_id`
- `target_dir`
- `stage`
- `messages`
- `scan_lines`
- `pending_plan`
- `plan_snapshot`
- `last_journal_id`
- `updated_at`

`version` 用于后续 schema 迁移。首版固定为 `1`。

### 原子写入

为避免部分写入损坏，session 文件写入应采用：

- 先写入同目录临时文件
- 成功后原子替换正式文件

### 损坏恢复策略

若 session 文件损坏或 JSON 无法解析：

- 当前 session 不参与自动恢复
- 记录错误日志
- 对应目录仍允许用户重新开始新会话

若 `latest_by_directory.json` 指向了不存在或损坏的 session：

- 忽略该索引项
- 不阻塞新会话创建

### 最新会话选择规则

若同一目录存在多个未完成 session：

- 优先选择 `updated_at` 最新的一条
- 若最新一条损坏，则回退到次新的一条
- 若都不可恢复，则提示重新开始

## 异常矩阵

首版必须明确处理以下异常场景：

| 场景 | 检测点 | 后端处理 | 前端表现 |
|------|--------|----------|----------|
| 目录不存在 | 创建 session / 扫描前 | 返回 `400 INVALID_TARGET_DIR` | 阻止进入工作台 |
| 目录无权限 | 创建 session / 扫描 / 执行 | 返回 `403 DIRECTORY_NOT_ACCESSIBLE` 或 `500 FILESYSTEM_ERROR` | 明确错误提示，不保留执行按钮 |
| AI 超时/失败 | `/messages`、扫描分析 | 返回 `504 AI_TIMEOUT` 或 `500 AI_REQUEST_FAILED` | 保留当前计划，提示重试 |
| SSE 断线 | 事件流连接 | 前端自动重连，失败时退回 `GET /api/sessions/{session_id}` 同步 | 显示“实时连接已断开，正在重连” |
| journal 损坏 | 恢复 / journal 查询 / rollback | 标记 `interrupted`，禁用 rollback，允许重新扫描 | 展示“执行记录损坏，无法安全回退” |
| session 文件损坏 | 恢复 | 忽略损坏文件，允许重建 | 弹提示“旧会话不可恢复” |
| 并发打开同一目录 | 创建 session / resume | 目录级锁或返回已存在活动 session | 提示“该目录已有活动会话” |
| 执行部分失败 | `execute` | 写入 `execution_report`，状态仍进入 `completed` 但失败数 > 0 | 完成页突出失败项并保留 journal / rollback 入口 |
| 执行完全中止且无可信 report | `execute` | 标记 `interrupted`，保留最近 journal 引用 | 提示查看执行详情，不提供继续执行 |
| 回退部分失败 | `rollback` | 写入 `rollback_report`，状态进入 `stale` | 提示用户重新扫描，且标记未完全恢复 |
| 回退完全中止且无可信 report | `rollback` | 保持 `interrupted` | 提示查看 journal 并人工处理 |
| 刷新映射失败 | `refresh` 后计划映射 | 将条目写入 `invalidated_items` 和 `Review` | 红点或高亮提示重新确认 |

## 前端信息架构

首版建议采用少路由、强状态页的结构：

### 1. 首页 Home

- 选择目录
- 最近目录
- 恢复未完成会话提示

### 2. 工作台 Workspace

顶部：

- 当前目录
- 阶段条
- 主操作按钮

左侧主区：

- `scanning`：进度条、当前条目、最近理解结果
- `planning`：待确认项、计划分组预览、本轮变化
- `stale/interrupted`：警示区与恢复动作

右侧侧栏：

- 文件数
- 目标目录数
- 待确认数
- `Review` 数
- 失效项数
- 当前计划摘要

底部输入区：

- 自然语言输入框
- 快捷操作按钮

### 3. 预检视图 Precheck

- 目录预览
- 移动预览
- 阻断问题
- 警告
- 执行确认

### 4. 完成视图 Completed

直接使用 `execution_report` 渲染：

- 成功数
- 失败数
- 日志 ID
- 查看详情
- 回退
- 清理空目录

### 5. 回退后的处理

回退成功后：

- session 进入 `stale`
- 快照中带 `rollback_report`
- 前端提示“目录状态已变化，建议重新扫描以继续整理”

## 前端状态管理

前端遵循“服务端快照为真”的原则，状态分为三层：

### 1. 服务端状态

- `session`
- `stage`
- `session_snapshot`

### 2. 界面状态

- 当前展开目录
- 当前过滤条件
- 当前选中待确认项
- 输入框内容
- 侧栏开关

### 3. 短暂交互状态

- 请求提交中
- SSE 连接状态
- 本地提示条显示状态

前端不维护另一份业务计划，不做本地 plan merge。

## 错误处理与数据安全

- `stale` 会话禁止直接执行
- `invalidated_items` 必须显式高亮
- `interrupted` 会话必须展示 `last_journal_id`
- `executing` 中断后不提供“继续执行”，只提供：
  - 查看详情
  - 回退
  - 重新扫描并重建计划

## 测试策略

测试分为四层：

### 1. Domain Core 单元测试

覆盖：

- 分析结果校验
- `plan diff` 应用
- 最终计划校验
- 执行预检
- 回退预检

### 2. Application Service 测试

覆盖：

- session 状态迁移
- stage guard
- stale 标记
- refresh 后 invalidated_items 生成
- interrupted 与 journal 关联

### 3. API 集成测试

覆盖：

- session 创建与恢复
- SSE 事件流
- 锁定态 `409 Conflict`
- `POST /messages` 长请求
- completed / rollback 快照完整性

### 4. 前端流程测试

覆盖首版主链路：

- 新建整理会话
- 扫描进度展示
- 待确认项处理
- AI 调整
- 预检
- 执行完成
- 回退后进入 `stale`

## 分阶段实现建议

建议按以下顺序推进：

1. 抽离 `OrganizerSession` 与 `SessionStore`
2. 引入 `OrganizerSessionService`
3. 封装 `AsyncScanner`
4. 统一 `session_snapshot`
5. 增加 FastAPI API + SSE
6. 让 CLI 改为复用应用服务层
7. 接入 Tauri + Next.js 工作台

## 后续增强

以下内容适合作为首版之后的增强项：

- 列表 layout 动画，减少整包快照替换的跳变感
- 计划项跨分组平滑过渡
- AI 回复流式输出
- 更复杂的批量规则编辑
- 自动回退后自动重扫
