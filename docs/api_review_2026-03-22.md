# FilePilot Desktop API 文档（审阅版）

本文档基于当前实际后端实现整理，代码来源以 [`file_pilot/api/main.py`](D:\3_Projects\Active\File-Organizer-CLI - v2\file_pilot\api\main.py)、[`file_pilot/app/session_service.py`](D:\3_Projects\Active\File-Organizer-CLI - v2\file_pilot\app\session_service.py)、[`frontend/src/lib/api.ts`](D:\3_Projects\Active\File-Organizer-CLI - v2\frontend\src\lib\api.ts)、[`frontend/src/types/session.ts`](D:\3_Projects\Active\File-Organizer-CLI - v2\frontend\src\types\session.ts) 为准。

## 1. 总览

- 协议：HTTP + JSON，另有 1 个 SSE 实时事件流接口
- 服务定位：桌面应用本地后端，不是公网多租户 API
- 核心资源：`session`
- 核心流程：
  1. 创建会话
  2. 扫描目录
  3. 对话/手动调整计划
  4. 预检
  5. 执行
  6. 查看 journal / 回滚 / 清理空目录

## 2. 通用约定

### 2.1 SessionStage

当前前端定义的阶段枚举如下：

- `idle`
- `draft`
- `scanning`
- `planning`
- `ready_for_precheck`
- `ready_to_execute`
- `executing`
- `completed`
- `rolling_back`
- `abandoned`
- `stale`
- `interrupted`

实际后端可用动作来自 [`session_service.py`](D:\3_Projects\Active\File-Organizer-CLI - v2\file_pilot\app\session_service.py)：

- `draft`: `scan`, `abandon`
- `scanning`: 无
- `ready_to_execute`: `execute`, `abandon`, `view_journal`
- `completed`: `rollback`, `view_journal`, `cleanup_empty_dirs`
- `stale` / `interrupted`: `refresh`, `view_journal`, `abandon`
- 其他可编辑阶段：`submit_intent`, `update_item`, `precheck`, `abandon`

### 2.2 SessionSnapshot 主要字段

大多数会话类接口最终都会返回 `session_snapshot`，或者直接返回一个 `SessionSnapshot` 对象。

核心字段：

- `session_id`: 会话 ID
- `target_dir`: 目标目录
- `stage`: 当前阶段
- `summary`: 当前摘要
- `assistant_message`: 最近一条 AI 消息
- `scanner_progress`: 扫描进度
- `plan_snapshot`: 当前计划快照
- `precheck_summary`: 预检结果
- `execution_report`: 执行结果
- `rollback_report`: 回滚结果
- `last_journal_id`: 最近一次 journal ID
- `integrity_flags`: 完整性/陈旧性标记
- `available_actions`: 前端可用动作
- `messages`: 当前会话消息历史
- `updated_at`: 更新时间
- `stale_reason`: 陈旧原因
- `last_error`: 最近错误

### 2.3 错误返回现状

当前项目里存在两套错误风格：

风格 A：统一 JSON 错误对象

```json
{
  "error_code": "SESSION_STAGE_CONFLICT",
  "session_snapshot": { "...": "..." }
}
```

风格 B：FastAPI 默认异常格式

```json
{
  "detail": "SESSION_NOT_FOUND"
}
```

这两套风格目前并存，前端如果想稳定处理错误，需要额外兼容。

## 3. 会话类接口

### 3.1 健康检查

#### `GET /api/health`

用途：检测后端是否可用。

响应示例：

```json
{
  "status": "ok",
  "instance_id": "desktop-instance"
}
```

备注：

- `instance_id` 可能为 `null`

### 3.2 创建会话

#### `POST /api/sessions`

请求体：

```json
{
  "target_dir": "D:/Downloads",
  "resume_if_exists": true
}
```

响应字段：

- `mode`: `created` | `resume_available`
- `session_id`
- `restorable_session`
- `session_snapshot`

逻辑：

- `mode=created`：新建会话
- `mode=resume_available`：发现已有可恢复会话，返回旧会话快照

### 3.3 获取会话

#### `GET /api/sessions/{session_id}`

响应：直接返回 `SessionSnapshot`

注意：

- 这里不是 `{ session_snapshot: ... }`
- 它与部分其他接口的包装风格不同

### 3.4 恢复会话

#### `POST /api/sessions/{session_id}/resume`

响应：直接返回 `SessionSnapshot`

逻辑：

- 恢复已存在会话
- 如果目录内容变化，可能直接变成 `stale`

### 3.5 放弃会话

#### `POST /api/sessions/{session_id}/abandon`

响应：

```json
{
  "session_id": "xxx",
  "session_snapshot": { "...": "..." }
}
```

### 3.6 启动扫描

#### `POST /api/sessions/{session_id}/scan`

响应：

```json
{
  "session_id": "xxx",
  "session_snapshot": { "...": "..." }
}
```

逻辑：

- 一般从 `draft` 进入 `scanning`
- 扫描完成后，自动转 `planning`
- 扫描完成后会尝试自动触发首次 AI 规划

### 3.7 刷新会话

#### `POST /api/sessions/{session_id}/refresh`

响应：

```json
{
  "session_id": "xxx",
  "session_snapshot": { "...": "..." }
}
```

适用场景：

- `stale`
- `interrupted`

### 3.8 用户发送消息

#### `POST /api/sessions/{session_id}/messages`

请求体：

```json
{
  "content": "把目录改成中文"
}
```

响应：

```json
{
  "session_id": "xxx",
  "assistant_message": {
    "role": "assistant",
    "content": "..."
  },
  "session_snapshot": { "...": "..." }
}
```

逻辑：

- 后端会把用户输入写入 `messages`
- 调用整理规划器
- 更新 `pending_plan` / `plan_snapshot`
- 根据结果停留在 `planning` 或进入 `ready_for_precheck`

### 3.9 手动更新单个条目目标

#### `POST /api/sessions/{session_id}/update-item`

请求体：

```json
{
  "item_id": "md",
  "target_dir": "Study",
  "move_to_review": false
}
```

说明：

- `target_dir` 和 `move_to_review` 二选一更合理，但当前实现没有在路由层强约束

响应：

```json
{
  "session_id": "xxx",
  "session_snapshot": { "...": "..." }
}
```

### 3.10 预检

#### `POST /api/sessions/{session_id}/precheck`

响应：

```json
{
  "session_id": "xxx",
  "session_snapshot": { "...": "..." }
}
```

预检结果位于：

- `session_snapshot.precheck_summary`

其中主要字段：

- `can_execute`
- `blocking_errors`
- `warnings`
- `mkdir_preview`
- `move_preview`

### 3.11 执行整理

#### `POST /api/sessions/{session_id}/execute`

请求体：

```json
{
  "confirm": true
}
```

响应：

```json
{
  "session_id": "xxx",
  "session_snapshot": { "...": "..." }
}
```

执行结果位于：

- `session_snapshot.execution_report`

主要字段：

- `execution_id`
- `journal_id`
- `success_count`
- `failure_count`
- `status`
- `has_cleanup_candidates`
- `cleanup_candidate_count`

### 3.12 回滚

#### `POST /api/sessions/{session_id}/rollback`

请求体：

```json
{
  "confirm": true
}
```

响应：

```json
{
  "session_id": "xxx",
  "session_snapshot": { "...": "..." }
}
```

回滚结果位于：

- `session_snapshot.rollback_report`

### 3.13 清理空目录

#### `POST /api/sessions/{session_id}/cleanup-empty-dirs`

响应：

```json
{
  "session_id": "xxx",
  "cleaned_count": 1,
  "session_snapshot": { "...": "..." }
}
```

适用阶段：

- `completed`

### 3.14 获取 journal 摘要

#### `GET /api/sessions/{session_id}/journal`

响应字段：

- `journal_id`
- `execution_id`
- `target_dir`
- `status`
- `created_at`
- `item_count`
- `success_count`
- `failure_count`
- `rollback_attempt_count`
- `items`

`items[]` 子项字段：

- `action_type`
- `status`
- `source`
- `target`
- `display_name`

### 3.15 获取历史记录

#### `GET /api/history`

响应：数组

每项字段：

- `execution_id`
- `target_dir`
- `status`
- `created_at`
- `item_count`

注意：

- 该接口当前没有在 [`frontend/src/lib/api.ts`](D:\3_Projects\Active\File-Organizer-CLI - v2\frontend\src\lib\api.ts) 里统一封装，而是在页面里直接 `fetch`

### 3.16 会话事件流

#### `GET /api/sessions/{session_id}/events`

协议：SSE，`text/event-stream`

初始事件：

- `event: session.snapshot`

`data` 中会携带：

- `event_type`
- `session_id`
- `stage`
- `session_snapshot`

运行期间常见事件类型：

- `scan.started`
- `scan.completed`
- `plan.updated`
- `plan.action`
- `plan.ai_typing`
- `command_validation_pass`
- `command_validation_fail`
- `cleanup.completed`
- `rollback.completed`

## 4. 工具类接口

### 4.1 打开目录

#### `POST /api/utils/open-dir`

请求体：

```json
{
  "path": "D:/Downloads"
}
```

响应：

```json
{
  "status": "ok"
}
```

说明：

- 实际调用 Windows `explorer`

### 4.2 选择目录

#### `POST /api/utils/select-dir`

请求体：无

响应：

```json
{
  "path": "D:/Downloads"
}
```

或：

```json
{
  "path": null
}
```

说明：

- 实际拉起本地 `tkinter` 文件夹选择器

### 4.3 获取当前配置

#### `GET /api/utils/config`

响应字段：

- `active_id`
- `config`
- `profiles`

### 4.4 更新当前配置

#### `POST /api/utils/config`

请求体：

- 直接传配置字段对象

响应：

```json
{
  "status": "ok"
}
```

### 4.5 切换配置 Profile

#### `POST /api/utils/config/switch`

请求体：

```json
{
  "id": "default"
}
```

响应：

```json
{
  "status": "ok",
  "active_id": "default"
}
```

### 4.6 新建配置 Profile

#### `POST /api/utils/config/profiles`

请求体：

```json
{
  "name": "工作配置",
  "copy": true
}
```

响应：

```json
{
  "status": "ok",
  "id": "profile_xxx"
}
```

### 4.7 删除配置 Profile

#### `DELETE /api/utils/config/profiles/{profile_id}`

响应：

```json
{
  "status": "ok"
}
```

### 4.8 测试 LLM 连通性

#### `POST /api/utils/test-llm`

请求体：

- `test_type`: `text` 或 `vision`
- 文本模型相关字段：`OPENAI_API_KEY`, `OPENAI_BASE_URL`
- 视觉模型相关字段：`IMAGE_ANALYSIS_API_KEY`, `IMAGE_ANALYSIS_BASE_URL`

响应成功：

```json
{
  "status": "ok",
  "message": "文本模型链路连通性测试通过"
}
```

响应失败：

```json
{
  "status": "error",
  "message": "..."
}
```

注意：

- 失败时当前仍然返回 HTTP 200，而不是 4xx/5xx

## 5. 前后端接口风格现状

### 5.1 已在 ApiClient 里统一封装的接口

- `/api/sessions`
- `/api/sessions/{id}`
- `/api/sessions/{id}/resume`
- `/api/sessions/{id}/abandon`
- `/api/sessions/{id}/scan`
- `/api/sessions/{id}/refresh`
- `/api/sessions/{id}/messages`
- `/api/sessions/{id}/update-item`
- `/api/sessions/{id}/precheck`
- `/api/sessions/{id}/execute`
- `/api/sessions/{id}/cleanup-empty-dirs`
- `/api/sessions/{id}/rollback`
- `/api/sessions/{id}/journal`
- `/api/utils/open-dir`
- `/api/utils/select-dir`

### 5.2 未在 ApiClient 统一封装、由页面直接调用的接口

- `/api/history`
- `/api/utils/config`
- `/api/utils/config/switch`
- `/api/utils/config/profiles`
- `/api/utils/test-llm`

这说明前端 API 接入风格当前并不统一。

## 6. 我看到的“不太合逻辑 / 值得你重点审阅”的点

### 6.1 错误返回风格不统一

现状：

- 有些接口返回 `{ error_code, session_snapshot }`
- 有些接口返回 `{ detail: "SESSION_NOT_FOUND" }`

问题：

- 前端错误处理要写两套
- 文档难统一
- 用户态提示映射会变复杂

建议：

- 全部收敛成统一错误结构

### 6.2 成功返回结构不统一

现状：

- `GET /api/sessions/{id}` 和 `POST /resume` 直接返回 `SessionSnapshot`
- 其他大多数接口返回 `{ session_id, session_snapshot }`

问题：

- 调用方心智负担更高
- 封装 SDK 时需要特殊分支

建议：

- 二选一统一：
- 要么全部直接返回 `SessionSnapshot`
- 要么全部返回带包装对象

### 6.3 `test-llm` 失败仍返回 200

现状：

- 业务失败通过 `{ status: "error" }` 表示
- HTTP 层仍是 200

问题：

- 不符合常规 API 语义
- 前端 `fetch().ok` 会误判成功

建议：

- 连通失败时返回 4xx/5xx
- 或前端专门把它视为“业务状态接口”，但需要文档明确

### 6.4 `/events` 缺少显式 404 保护

现状：

- 事件流接口里一开始直接 `get_snapshot(session_id)`
- 路由层没有像其他接口那样包 `FileNotFoundError`

问题：

- 如果 session 不存在，可能变成 500 或非预期异常，而不是标准 404

建议：

- 在进入 SSE 之前先做存在性校验

### 6.5 `update-item` 入参语义有点模糊

现状：

- 同时支持 `target_dir` 和 `move_to_review`

问题：

- 两个字段理论上会互相冲突
- 当前文档层面不够明确

建议：

- 明确约束：
- `move_to_review=true` 时忽略 `target_dir`
- 或改成更清晰的单一字段，比如 `mode: "move" | "review"`

### 6.6 工具类接口混合了“纯数据 API”和“本地系统动作”

现状：

- `/api/utils/config` 是配置数据
- `/api/utils/open-dir` 是本地副作用
- `/api/utils/select-dir` 会弹系统窗口

问题：

- 从 REST 视角不够干净
- 从桌面应用视角可以接受，但需要在文档中明确“这些是本地 OS 能力，不是普通服务端接口”

建议：

- 至少在命名或分组上区分：
- `utils/config/*`
- `desktop/*` 或 `shell/*`

### 6.7 前端 API 接入方式不统一

现状：

- 一部分接口走 `ApiClient`
- 一部分页面直接 `fetch`

问题：

- 鉴权、错误处理、日志、重试策略以后不好统一

建议：

- 逐步把 `history/config/test-llm` 也收敛到统一 client

### 6.8 文档设计与实际代码已有漂移

现状：

- 规格文档里写了一些错误码和返回约定
- 实际代码未完全遵循

问题：

- 研发、前端、测试基于不同真相工作

建议：

- 明确“以代码为准”或“以文档为准”
- 然后做一次对齐

## 7. 建议你优先审阅的决策点

如果你要快速判断这套 API 是否合理，我建议先只看这 5 件事：

1. `SessionSnapshot` 是否应该成为绝对统一的主响应结构
2. 错误结构是否要统一成单一格式
3. `messages` / `update-item` / `precheck` 的阶段约束是否足够清晰
4. `utils` 是否要拆成“配置接口”和“桌面动作接口”
5. SSE 事件模型是否要形成正式枚举，而不是当前这种隐式约定

