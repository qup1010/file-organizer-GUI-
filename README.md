# file-organizer-test

这是一个面向继续开发的本地文件整理 CLI 原型。当前已经实现一条可运行的整理链路：

1. 扫描目标目录当前层条目
2. 由 AI 生成分析结果，并做程序化校验
3. 基于分析结果生成整理命令流，并再次校验
4. 展示执行预览，用户输入 `YES` 后才真正执行
5. 执行完成后输出结果报告，并记录可回退日志

当前主流程：

`扫描目录 -> AI 分析 -> 结果校验 -> 生成命令流 -> 预览确认 -> 执行 -> 写入执行日志`

## 运行方式

项目现在使用包原生入口：

```bash
python -m file_organizer
```

按目录回退最近一次执行：

```bash
python -m file_organizer.rollback D:/Downloads
```

回退流程会先读取该目录最近一次执行日志，展示回退预览，只有输入 `YES` 才执行。

## 当前项目结构

项目已经重组为按流程域拆分的包结构：

```text
file_organizer/
  analysis/    扫描分析、文件读取、分析提示词
  organize/    整理对话、命令解析、命令流校验
  execution/   执行计划、执行日志、执行报告
  rollback/    回退计划、回退预检、回退执行
  cli/         终端展示与事件输出
  shared/      配置、路径工具、history/journal 公共存储
  workflows/   主流程编排与入口逻辑
```

根目录不再保留兼容脚本和兼容模块；所有运行入口与实现模块都收敛到 `file_organizer/` 包内。

## 文件读取能力

当前读取端支持以下能力：

- 普通文本读取，包含常见中文 Windows 编码 fallback：`UTF-8`、`UTF-8 with BOM`、`GBK`、`UTF-16`
- `PDF`、`Word`、`Excel` 摘要提取
- `.zip` 压缩包索引预览，只列目录和文件摘要，不解压、不读取内部正文
- 图片简短摘要：遇到 `.png`、`.jpg`、`.jpeg`、`.webp`、`.bmp` 时，可通过独立 Vision 配置生成一句自然语言摘要

图片分析与主分析模型解耦：

- 不复用主分析模型配置
- 不继承主分析阶段消息历史
- 采用严格模式，不自动降级到 OCR 或主模型猜测

相关配置：

```env
IMAGE_ANALYSIS_ENABLED=true
IMAGE_ANALYSIS_BASE_URL=https://your-vision-endpoint/v1
IMAGE_ANALYSIS_API_KEY=your_api_key
IMAGE_ANALYSIS_MODEL=your_vision_model
```

如果未启用或配置不完整，图片读取会明确返回失败信息，而不是隐式回退。

## 测试

项目当前以 `unittest` 作为基线验证方式：

```bash
python -m unittest discover -s tests -p "test_*.py"
```

新增与调整后的测试覆盖了：

- `python -m file_organizer`
- `python -m file_organizer.rollback`
- `workflows` 层不再依赖 `os.chdir()` 的整理主流程编排
- `shared` 层的 history/journal 索引存储
- 包内 analysis / organize / execution / rollback 模块的核心行为
- 文件读取端的编码 fallback、`.zip` 索引预览与独立图片摘要调用
