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
- 执行前预检，确认风险和冲突
- 执行文件移动
- 保存执行历史，并支持最近一次执行回退
- 为文件夹生成、应用和恢复图标

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

## 限制说明

- 目前只支持 Windows 环境
- 需要用户自行配置模型服务和 API Key
- 文件分析结果会受到模型能力和接口稳定性影响
- 图标生成功能依赖额外模型配置
- 建议整理的目录文件数不超过600（需要视具体模型和上下文窗口而定）, 并且需要能够稳定使用`tool_call` , 推荐接入较强的文本模型。

## 开发

项目统一入口和常用命令保留在这里；更细的桌面宿主与前端约定分别见 [desktop/README.md](desktop/README.md) 和 [frontend/README.md](frontend/README.md)。

### 常用命令

```powershell
python -m unittest discover -s tests -p "test_*.py"

Set-Location frontend
npm run typecheck
npm test

Set-Location ..\desktop\src-tauri
cargo check
```

### 推荐开发流程

1. 先运行 `python -m file_organizer.api`
2. 前端开发时在 `frontend/` 运行 `npm run dev`
3. 提交前至少执行相关 `unittest` 和 `npm run typecheck`
4. 如涉及桌面端，再补跑 `cargo check` 或 `npm run tauri:dev`


## License

[MIT](./LICENSE)
