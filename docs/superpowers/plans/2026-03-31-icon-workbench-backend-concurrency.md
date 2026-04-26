# Icon Workbench Backend Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图标工坊后端在分析与预览生成阶段受 `concurrency_limit` 控制地并发处理多个目标文件夹，同时保持现有 API 形态和前端流程不变。

**Architecture:** 在服务层引入受限线程池，对每个目标文件夹的分析和生图任务并发执行，最后统一把结果回写到 session 中。并发数直接读取图标工坊当前配置的 `concurrency_limit`，最小为 1，沿用现有配置来源，不改前端协议。

**Tech Stack:** Python、ThreadPoolExecutor、FastAPI、unittest

---

### Task 1: 为并发行为补测试

**Files:**
- Modify: `tests/test_icon_workbench_service.py`

- [ ] 新增一个分析并发测试，验证多个文件夹时每个目标都会被处理，且工作线程数受到 `concurrency_limit` 约束。
- [ ] 新增一个生成并发测试，验证 `generate_previews` 对多个文件夹能并发执行且仍然把结果写回各自版本列表。
- [ ] 先运行 `python -m unittest tests.test_icon_workbench_service -v`

### Task 2: 在服务层实现受限并发

**Files:**
- Modify: `file_pilot/icon_workbench/service.py`

- [ ] 提取通用的并发执行辅助方法，输入目标列表、配置并发数、单项处理函数，输出统一的结果映射。
- [ ] 将 `analyze_folders()` 改成按目标文件夹并发分析，保留单个文件夹上的错误隔离逻辑。
- [ ] 将 `generate_previews()` 改成按目标文件夹并发生成，保留版本编号、错误写回和现有 session 序列化行为。
- [ ] 控制线程池最大并发为 `config.concurrency_limit` 与目标数量的较小值。

### Task 3: 回归验证

**Files:**
- Modify: `tests/test_api_icon_workbench.py`

- [ ] 确认 API 测试不需要改接口，只需回归现有行为。
- [ ] 运行 `python -m unittest tests.test_icon_workbench_service tests.test_api_icon_workbench -v`
- [ ] 如无前端类型变化，不重复跑前端 typecheck。
