<div align="center">
  <img src="./frontend/public/app-icon.png" alt="FilePilot Logo" width="128" />

  <h1>FilePilot</h1>

  <p>面向 Windows 的本地 AI 文件整理工作台</p>

  <p>
    <img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=flat-square" alt="Platform Windows" />
    <img src="https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+" />
    <img src="https://img.shields.io/badge/FastAPI-Local_API-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI Local API" />
    <img src="https://img.shields.io/badge/Next.js-15-111827?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/License-MIT-84cc16?style=flat-square" alt="MIT License" />
  </p>

  <p>
    <a href="#项目简介">项目简介</a> |
    <a href="#当前能力">当前能力</a> |
    <a href="#界面截图">界面截图</a> |
    <a href="#项目结构">项目结构</a> |
    <a href="#快速开始">快速开始</a> |
    <a href="#开发与验证">开发与验证</a> |
    <a href="#运行时契约">运行时契约</a> |
    <a href="#使用提醒">使用提醒</a>
  </p>

</div>

---

## 项目简介

FilePilot 是一个运行在本地 Windows 环境中的文件整理工作台。它把“扫描目录、AI 分析、生成整理方案、执行前预检、确认执行、写入日志、必要时回退”串成一条完整链路，并提供桌面工作台与本地 API 两层能力。

当前仓库包含三部分：

- `file_pilot/`：FastAPI 本地服务、整理会话、扫描分析、执行与回退能力
- `frontend/`：Next.js 工作台前端
- `desktop/`：Tauri 桌面宿主

## 当前能力

### 文件整理主链路

- 启动页支持多文件、多文件夹、混合来源
- 启动时先收集来源，再决定去向
- 去向支持两种模式：
  - 归入已有目录
  - 生成新的分类结构
- 支持全局默认 placement：
  - `new_directory_root`
  - `review_root`
- 支持单次任务覆盖 placement
- 扫描目录并生成 AI 整理方案
- 进入执行前预检，检查冲突和风险
- 输入大写 `YES` 后执行
- 写入执行日志并保留历史
- 支持最近一次执行回退

### 任务模式

#### 生成新结构

- 面向首次整理的杂乱目录
- 允许生成新的分类目录结构
- `Review` 默认跟随 `new_directory_root/Review`

#### 归入已有目录

- 面向已有结构的增量归档
- 支持从已保存的目标目录配置中选择，也支持在当前任务中手动指定目标目录
- 目标目录需要显式授权，不会自动把父目录授权扩展到所有子目录
- 拿不准的条目会进入 `Review`

### 其他工作台能力

- 历史记录浏览与最近一次回退入口
- 设置页统一维护模型配置、启动默认值与部分调试配置
- 图标工坊：扫描文件夹、生成文件夹图标、应用或恢复图标

## 设计理念

FilePilot 的界面遵循 `Desktop Architectural Workbench` 思路：稳定框架优先、信息密度优先、操作反馈优先，而不是网页式或营销式布局。详细规范见 [DESIGN.md](./DESIGN.md)。

## 界面截图

![FilePilot Screenshot](./docs/assets/filepilot-screenshot.png)

## 项目结构

```text
file_pilot/
  analysis/        扫描分析、文件读取、摘要与视觉相关能力
  api/             FastAPI 本地 API、运行时发现
  app/             会话服务、状态编排、目标目录配置
  execution/       执行计划、执行日志、结果报告
  icon_workbench/  图标工坊服务
  organize/        整理对话、提示词、计划约束
  rollback/        最近一次执行回退
frontend/          Next.js 工作台前端
desktop/           Tauri 桌面宿主
tests/             Python 单元测试与集成测试
docs/              设计、规格、现状记录与补充文档
```

## 快速开始

### 1. 安装 Python 依赖

```powershell
pip install -r requirements.txt
```

### 2. 启动本地 API

```powershell
python -m file_pilot.api
```

默认地址：

- `http://127.0.0.1:8765`

启动后会写入运行时文件：

- `output/runtime/backend.json`

### 3. 启动前端工作台

```powershell
Set-Location frontend
npm install
npm run dev
```

### 4. 启动桌面壳

```powershell
Set-Location desktop
npm install
npm run tauri:dev
```

桌面联调时，Tauri 会负责拉起本地 `python -m file_pilot.api`，前端优先读取运行时注入值而不是写死端口。

## 开发与验证

### 常用命令

```powershell
python -m unittest discover -s tests -p "test_*.py"

python -m unittest tests.test_session_service -v
python -m unittest tests.test_api_runtime -v
python -m unittest tests.test_api_sessions -v
python -m unittest tests.test_rollback_service -v

Set-Location frontend
npm run typecheck
npm run lint
npm test

Set-Location ..\desktop\src-tauri
cargo check
```

### 推荐工作流

#### API / 工作台开发

1. 运行 `python -m file_pilot.api`
2. 在 `frontend/` 运行 `npm run dev`
3. 如果改动会话快照、事件流或阶段推进，优先回归：
   - `tests/test_api_*.py`
   - `tests/test_session_*.py`
   - `tests/test_api_sessions.py`

#### 桌面联调

1. 确保 `frontend/` 与 `desktop/` 依赖已安装
2. 在 `desktop/` 运行 `npm run tauri:dev`
3. 确认前端读取的是 `window.__FILE_PILOT_RUNTIME__.base_url`
4. 如联调异常，先检查 `output/runtime/backend.json`

#### 回退验证

1. 先完成一次真实整理执行并生成 journal
2. 通过桌面工作台或 API 触发回退预检
3. 确认预检无误后再执行回退
4. 修改回退逻辑时，至少回归 `tests/test_rollback_service.py`

## 运行时契约

以下契约是当前前后端与桌面壳之间的稳定接口，改动时需要同步检查相关实现和类型定义：

- 后端运行时文件：`output/runtime/backend.json`
- 前端运行时入口：`window.__FILE_PILOT_RUNTIME__.base_url`
- 健康检查接口：`GET /api/health`

桌面壳可向前端注入：

```ts
window.__FILE_PILOT_RUNTIME__ = {
  base_url: "http://127.0.0.1:8765",
  api_token: "optional-token",
};
```

## 子项目文档

- 前端工作台说明见 [frontend/README.md](./frontend/README.md)
- Tauri 桌面宿主说明见 [desktop/README.md](./desktop/README.md)
- 更细的规格、设计与阶段性记录见 [docs/](./docs/)

## 使用提醒

- 更适合整理下载目录、桌面、素材暂存目录等“容易堆积、但允许重新归类”的位置
- 不建议直接作用于系统目录、开发环境目录、同步盘根目录或频繁变化的工作目录
- 第一次使用建议先拿测试目录试跑
- 执行前务必查看整理方案与预检结果
- 文件分析质量会受到模型能力、接口稳定性与上下文窗口影响
- 当前主要面向 Windows 环境

## License

[MIT](./LICENSE)
