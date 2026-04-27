<div align="center">
  <img src="./frontend/public/app-icon.png" alt="FilePilot Logo" width="128" />

  <h1>FilePilot</h1>

  <p>面向 Windows 的本地 AI 文件整理工作台</p>

  <p>
    <img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=flat-square" alt="Platform Windows" />
    <img src="https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+" />
    <img src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111827" alt="React 19" />
    <img src="https://img.shields.io/badge/License-MIT-84cc16?style=flat-square" alt="MIT License" />
  </p>

  <p>
    <a href="#项目简介">项目简介</a> |
    <a href="#主要功能">主要功能</a> |
    <a href="#界面截图">界面截图</a> |
    <a href="#快速开始">快速开始</a> |
    <a href="#使用提醒">使用提醒</a> |
    <a href="#限制说明">限制说明</a> |
  </p>

</div>

---

## 项目简介

FilePilot 用于整理本地目录：先扫描和分析，再生成整理方案，确认后执行，并支持查看历史和回退最近一次执行。

适合这些场景：

- 下载目录、桌面、素材目录长期堆积，需要重新归类和整理

## 主要功能

- 扫描目录并生成整理方案
- 支持 `初次整理` 与 `增量归档` 两种整理模式
- 执行前预检，确认风险和冲突
- 执行文件移动
- 保存执行历史，并支持最近一次执行回退
- 为文件夹生成、应用和恢复图标

## 设计理念：建筑式工作台 (Architectural Workbench)

FilePilot 并非传统的“网页式”应用，其设计遵循桌面端生产力工具的逻辑：

- **高密度布局**：最大化利用屏幕空间，移除冗余的修饰性元素，让用户一眼看到更多任务信息。
- **结构化环境**：界面像建筑平面图一样精确、冷静，通过色阶分区（Surface-based）而非硬边框来划分功能块。
- **低疲劳交互**：采用中文 UI 优先的系统字体栈，并为路径、日志、代码保留等宽字体，确保长时间使用的视觉舒适度。
- **任务中心**：避免“官网式”大图与营销文案，首屏即工具，操作即反馈。

详情请参考 [DESIGN.md](./DESIGN.md)。

## 界面截图

![FilePilot Screenshot](./docs/assets/filepilot-screenshot.png)



## 快速开始

### 安装方式

前往 GitHub Releases 下载桌面安装包，安装后直接运行。

### 首次使用

1. 打开应用
2. 在设置中填写模型服务和 API Key
3. 选择要整理的目录
4. 先查看整理方案和预检结果
5. 确认无误后再执行整理

## 使用提醒

- 只对适合整理的目录使用，例如下载目录、桌面、素材暂存目录
- 不要直接对系统目录、开发环境目录、同步盘根目录或正在频繁变化的工作目录执行整理
- 第一次使用时，建议先拿测试目录或低风险目录试跑
- 执行前先检查整理方案和预检结果，再决定是否继续

## 整理模式

### 初次整理

- 面向首次整理的杂乱目录
- 作用范围是当前目录的一层条目
- 允许新建目录并生成新的整理结构
- 扫描完成后会自动进入规划阶段

### 增量归档

- 面向已经有基础结构的目录，处理后续新增的零散内容
- 用户需要在启动页或设置页显式选择目标目录配置
- 每个可投递目标目录都需要单独保存路径，父目录不会自动授权子目录
- 增量模式下不允许新建目标目录、不允许目录改名、不允许投递到未显式配置的目录
- 拿不准的条目会进入 Review

### 当前语义边界

- 两种模式都仍以“当前目录一层条目”为可执行移动对象
- 即使在增量模式中，深层目录下的文件也不会被拆成独立计划项
- 增量模式限制的是“显式目标目录集合”，不是“递归整理范围”

## 限制说明

- 目前只支持 Windows 环境
- 需要用户自行配置模型服务和 API Key
- 文件分析结果会受到模型能力和接口稳定性影响
- 图标生成功能依赖额外模型配置
- 建议整理的目录文件数不超过600（需要视具体模型和上下文窗口而定）, 并且需要能够稳定使用`tool_call` , 推荐接入较强的文本模型。

## 本次改动记录

### 会话与 API

- 会话策略保留 `organize_mode` 和兼容字段 `destination_index_depth`
- 会话阶段保留 `selecting_incremental_scope` 作为旧会话兼容阶段
- `session_snapshot` 新增 `incremental_selection`
- 新增接口 `POST /api/sessions/{session_id}/incremental-selection`
  - 兼容旧接口：`POST /api/sessions/{session_id}/confirm-targets`

### 扫描与规划

- `initial` 模式保持当前层扫描后自动规划
- `incremental` 模式使用显式目标目录配置，扫描后直接进入规划
- 增量模式会生成：
  - 当前规划范围条目
  - 显式目标目录列表
- 规划输入统一升级为：
  - `item_id | entry_type | display_name | source_relpath | suggested_purpose | summary`
- 提示词和计划校验已按模式分流：
  - `initial`：要求覆盖当前规划范围，可新建目录
  - `incremental`：只能投递到显式配置的目标目录或 Review，禁止目录改名和新建目标目录

### 前端工作台

- 启动页支持“生成新的分类结构 / 归入现有目录”模式切换
- 归入现有目录时必须选择已保存目标目录配置，或手动添加目标目录
- 设置页支持维护多个目标目录配置
- 工作台保留增量候选选择视图作为旧会话兼容入口

### 当前验证结果

- 已通过：
  - `python -m unittest tests.test_structured_organizer_service -v`
  - `python -m unittest tests.test_api_sessions -v`
  - `python -m unittest tests.test_session_service -v`
  - `Set-Location frontend; npm run typecheck`
  - `Set-Location frontend; npm run lint`

## 开发

项目统一入口和常用命令保留在这里；更细的桌面宿主与前端约定分别见 [desktop/README.md](desktop/README.md) 和 [frontend/README.md](frontend/README.md)。

### 常用命令

```powershell
python -m unittest discover -s tests -p "test_*.py"

Set-Location frontend
npm run typecheck
npm run lint
npm test

Set-Location ..\desktop\src-tauri
cargo check
```

### 推荐开发流程

1. 先运行 `python -m file_pilot.api`
2. 前端开发时在 `frontend/` 运行 `npm run dev`
3. 提交前至少执行相关 `unittest`、`npm run typecheck` 和 `npm run lint`
4. 如涉及桌面端，再补跑 `cargo check` 或 `npm run tauri:dev`


## License

[MIT](./LICENSE)
