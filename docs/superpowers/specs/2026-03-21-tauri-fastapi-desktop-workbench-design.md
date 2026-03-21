# Tauri FastAPI Desktop Workbench 设计说明

## 目标

将当前以 CLI 为主的本地文件整理原型升级为桌面工作台：

- 桌面技术栈采用 `Tauri + Next.js/React + FastAPI`
- 保留现有 Python 领域能力，不重写分析、整理、执行、回退核心逻辑
- 首版优先跑通完整闭环：`选目录 -> 扫描 -> 生成计划 -> 调整 -> 预检 -> 执行 -> 回退`
- 首版交互以“向导主导 + AI 辅助调整”为主，不追求复杂动画与强展示感

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
- `POST /api/sessions/{session_id}/resolve-item`
- `POST /api/sessions/{session_id}/move-item`

### Precheck

- `POST /api/sessions/{session_id}/precheck`

### Execution

- `POST /api/sessions/{session_id}/execute`
- `POST /api/sessions/{session_id}/cleanup-empty-dirs`

### Rollback

- `POST /api/sessions/{session_id}/rollback`
- `GET /api/sessions/{session_id}/journal`

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
