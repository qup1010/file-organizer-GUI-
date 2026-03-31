# Frontend Workbench

这是 File Organizer 的本地工作台前端，基于 Next.js + React，主要负责：

- 启动新的整理任务
- 承接 `/workspace` 整理工作区
- 展示 `/history` 历史记录
- 提供 `/settings` 统一设置页
- 承接 `/icons` 图标工坊界面

## 桌面体验优先

- 这个前端最终运行在 Tauri 桌面壳里，设计和实现时应默认按桌面工作台思考，而不是按网页落地页或通用 SaaS 页面思考。
- 页面应优先服务任务连续性、信息密度、分栏协作和长时间操作稳定性，不要先追求网页式“首屏氛围”。
- 优先使用稳定的应用框架结构，例如工具栏、侧栏、主工作区、详情区、状态区，而不是居中单列内容流。
- 避免引入网页式 hero、超大宣传区、漂浮卡片堆叠、强展示型动效和偏营销化文案。
- 做响应式时优先适配桌面窗口缩放与窄宽度，不要把“移动端网页体验”当成默认目标。
- 具体视觉和交互判断以根目录 [DESIGN.md](../DESIGN.md) 为准。

## 当前状态

- 已有首页启动台、整理工作区、历史页、设置页、图标工坊等主要路由。
- 前端会优先读取 `window.__FILE_ORGANIZER_RUNTIME__.base_url`，没有时回退到 `NEXT_PUBLIC_API_BASE_URL`，最后才用本地默认值。
- 如果桌面壳注入了 `window.__FILE_ORGANIZER_RUNTIME__.api_token`，前端会自动携带该 token 调用受保护接口和 SSE。
- API client 已接入本地整理会话、历史、设置和图标工坊端点。
- 当前前端已围绕真实 `session_snapshot`、扫描进度、预检结果、执行结果、历史记录和图标工坊状态进行渲染。

## 运行

```powershell
Set-Location frontend
npm install
npm run dev
```

类型检查：

```powershell
npm run typecheck
```

## 运行时发现与 Tauri 接线约定

桌面壳或其他宿主应向前端注入：

```ts
window.__FILE_ORGANIZER_RUNTIME__ = {
  base_url: "http://127.0.0.1:8765",
  api_token: "optional-token",
};
```

前端不会猜测后端端口，也不会直接解析后端 stdout。

## 主要路由

- `/`：新建任务入口
- `/workspace`：整理工作区
- `/history`：整理历史与回退入口
- `/settings`：模型、默认值和调试设置
- `/icons`：图标工坊

