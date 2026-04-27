# Icon Workbench Remove Chat Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除图标工坊遗留的对话链路，仅保留主工作台的目标管理、风格选择、预览生成、图标应用与结果回写。

**Architecture:** 后端收口为纯工作台服务，移除 chat agent、待确认动作和消息历史；前端同步移除对话 UI 与对应 API 调用；`reportClientAction` 保留，继续作为桌面壳执行结果回写入口。旧 session 数据允许被读取，但新的 session payload 不再输出对话字段。

**Tech Stack:** Python service/FastAPI、Next.js/TypeScript、Tauri、unittest、npm typecheck

---

### Task 1: 收口后端模型与服务边界

**Files:**
- Modify: `file_pilot/icon_workbench/models.py`
- Modify: `file_pilot/icon_workbench/service.py`
- Modify: `file_pilot/icon_workbench/prompts.py`
- Delete: `file_pilot/icon_workbench/chat_agent.py`

- [ ] 删除 `IconWorkbenchSession` 中的对话字段与相关 dataclass，保留旧字段兼容读取但不再输出。
- [ ] 移除 `IconWorkbenchService` 中的 `chat_agent` 依赖与 `send_message` / `confirm_pending_action` / `dismiss_pending_action` / pending-action 辅助方法。
- [ ] 将 `report_client_action` 改为直接返回执行摘要，不再依赖 chat message 结构。
- [ ] 删除仅供图标工坊对话链路使用的 prompt 与 chat agent 文件。

### Task 2: 收口图标工坊 API 与类型

**Files:**
- Modify: `file_pilot/api/main.py`
- Modify: `frontend/src/lib/icon-workbench-api.ts`
- Modify: `frontend/src/types/icon-workbench.ts`

- [ ] 删除图标工坊消息发送、确认动作、取消动作相关接口与 schema。
- [ ] 保留 `client-actions/report` 路由，并让前端只暴露主工作台仍会使用的方法与类型。
- [ ] 清理 `IconWorkbenchSession`、`IconWorkbenchActionResponse`、chat/pending-action payload 等前端类型。

### Task 3: 清理前端工作台中的对话遗留

**Files:**
- Modify: `frontend/src/components/icons/icon-workbench-v2.tsx`
- Delete: `frontend/src/components/icons/icon-chat-panel.tsx`

- [ ] 删除图标工坊页面中的待确认动作展示、确认/取消处理函数及相关状态。
- [ ] 保留单个应用、批量应用、恢复默认图标和 `reportClientAction` 调用。
- [ ] 确认工作台顶部状态栏和底部操作栏在无对话链路时仍然自洽。

### Task 4: 回归测试与验证

**Files:**
- Modify: `tests/test_icon_workbench_service.py`
- Modify: `tests/test_api_icon_workbench.py`

- [ ] 删除 message / pending-action / confirm / dismiss 相关测试。
- [ ] 保留并更新 analyze / generate / template / apply-ready / report-client-action 覆盖。
- [ ] 运行 `python -m unittest tests.test_icon_workbench_service tests.test_api_icon_workbench -v`
- [ ] 运行 `Set-Location frontend; npm run typecheck`
