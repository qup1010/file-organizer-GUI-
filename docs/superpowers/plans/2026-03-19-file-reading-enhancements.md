# File Reading Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有分析与整理主链路的前提下，为文件读取端增加编码 fallback、`.zip` 压缩包索引预览和独立 Vision 图片摘要能力，并同步更新工具说明。

**Architecture:** 保持 `read_local_file(...)` 与 `list_local_files(...)` 的字符串返回契约不变，新增内部辅助模块承接图片摘要与压缩包索引。图片分析通过独立配置与独立客户端调用，不继承主分析会话上下文；压缩包预览先仅支持 `.zip`，文本编码先采用固定顺序 fallback。

**Tech Stack:** Python 3, `unittest`, `zipfile`, OpenAI-compatible chat completions, `pypdf`, `python-docx`, `pandas`, `rich`

---

## 文件结构与职责

- 修改：`D:/3_Projects/Active/file-organizer-test/file_organizer/shared/config.py`
  负责新增图片分析配置读取与独立客户端创建。
- 新建：`D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/image_describer.py`
  负责独立 Vision 图片摘要调用与错误包装。
- 新建：`D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/archive_reader.py`
  负责 `.zip` 文件索引预览。
- 修改：`D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/file_reader.py`
  负责文件类型分发、文本编码 fallback、接入图片与压缩包读取。
- 修改：`D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/service.py`
  负责注册新工具、同步 tool descriptions、保持工具消息契约稳定。
- 修改：`D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/prompts.py`
  负责更新主分析提示词中的工具说明与适用场景。
- 修改：`D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/__init__.py`
  负责导出新增能力。
- 修改：`D:/3_Projects/Active/file-organizer-test/README.md`
  负责补充读取端新能力说明与配置说明。
- 新建：`D:/3_Projects/Active/file-organizer-test/tests/test_archive_reader.py`
  覆盖 `.zip` 索引预览。
- 新建：`D:/3_Projects/Active/file-organizer-test/tests/test_image_describer.py`
  覆盖图片独立 Vision 调用、严格模式与上下文隔离。
- 修改：`D:/3_Projects/Active/file-organizer-test/tests/test_file_parser.py`
  补充文本编码 fallback 与图片/压缩包分发行为。
- 修改：`D:/3_Projects/Active/file-organizer-test/tests/test_local_file_analysis_chat.py`
  覆盖工具列表与工具说明同步更新。

## Chunk 1: 编码鲁棒性

### Task 1: 为文本读取增加固定顺序编码 fallback

**Files:**
- Modify: `D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/file_reader.py`
- Modify: `D:/3_Projects/Active/file-organizer-test/tests/test_file_parser.py`

- [ ] **Step 1: 写失败测试，覆盖 UTF-8 BOM / GBK / UTF-16 文本读取**

```python
def test_read_local_file_supports_common_windows_encodings():
    ...
```

- [ ] **Step 2: 运行失败测试，确认当前仅 `utf-8` 读取会失败**

Run: `python -m unittest tests.test_file_parser -v`
Expected: 至少 1 个 FAIL，报编码相关断言失败。

- [ ] **Step 3: 在 `file_reader.py` 中新增固定顺序解码 helper**

实现要点：
- 先尝试 `utf-8`
- 再尝试 `utf-8-sig`
- 再尝试 `gbk`
- 再尝试 `utf-16`
- 全部失败再返回现有错误语义

- [ ] **Step 4: 运行目标测试，确认 fallback 生效且旧返回格式不变**

Run: `python -m unittest tests.test_file_parser -v`
Expected: PASS。

- [ ] **Step 5: 提交本任务**

```bash
git add D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/file_reader.py D:/3_Projects/Active/file-organizer-test/tests/test_file_parser.py
git commit -m "feat: add text encoding fallback"
```

## Chunk 2: `.zip` 压缩包索引预览

### Task 2: 新增 `.zip` 索引读取模块

**Files:**
- Create: `D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/archive_reader.py`
- Create: `D:/3_Projects/Active/file-organizer-test/tests/test_archive_reader.py`
- Modify: `D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/__init__.py`

- [ ] **Step 1: 写失败测试，覆盖普通 zip、多层目录 zip、超长索引截断**

```python
def test_read_archive_index_lists_zip_entries_without_extracting():
    ...
```

- [ ] **Step 2: 运行失败测试，确认模块和函数当前不存在**

Run: `python -m unittest tests.test_archive_reader -v`
Expected: FAIL，提示导入失败或函数未定义。

- [ ] **Step 3: 最小实现 `read_archive_index(...)`**

实现要点：
- 只支持 `.zip`
- 使用 `zipfile` 仅读目录索引
- 输出文件数量、目录摘要和前若干条路径
- 不解压、不读内部正文

- [ ] **Step 4: 运行目标测试，确认 `.zip` 行为稳定**

Run: `python -m unittest tests.test_archive_reader -v`
Expected: PASS。

- [ ] **Step 5: 提交本任务**

```bash
git add D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/archive_reader.py D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/__init__.py D:/3_Projects/Active/file-organizer-test/tests/test_archive_reader.py
git commit -m "feat: add zip archive preview"
```

### Task 3: 将 `.zip` 读取接入 `read_local_file(...)`

**Files:**
- Modify: `D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/file_reader.py`
- Modify: `D:/3_Projects/Active/file-organizer-test/tests/test_file_parser.py`

- [ ] **Step 1: 写失败测试，验证 `.zip` 文件会走索引摘要而非文本直读**
- [ ] **Step 2: 运行失败测试，确认当前分发逻辑不支持 `.zip`**

Run: `python -m unittest tests.test_file_parser -v`
Expected: FAIL。

- [ ] **Step 3: 在 `read_local_file(...)` 中增加 `.zip` 分支**
- [ ] **Step 4: 运行测试，确认返回仍是统一字符串包装格式**

Run: `python -m unittest tests.test_file_parser -v`
Expected: PASS。

- [ ] **Step 5: 提交本任务**

```bash
git add D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/file_reader.py D:/3_Projects/Active/file-organizer-test/tests/test_file_parser.py
git commit -m "feat: route zip files through archive index preview"
```

## Chunk 3: 独立 Vision 图片摘要

### Task 4: 新增图片摘要客户端与配置

**Files:**
- Modify: `D:/3_Projects/Active/file-organizer-test/file_organizer/shared/config.py`
- Create: `D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/image_describer.py`
- Create: `D:/3_Projects/Active/file-organizer-test/tests/test_image_describer.py`

- [ ] **Step 1: 写失败测试，覆盖配置缺失、成功摘要、失败严格报错、上下文隔离**

```python
def test_describe_image_uses_isolated_messages_and_returns_short_summary():
    ...
```

- [ ] **Step 2: 运行失败测试，确认模块和配置当前不存在**

Run: `python -m unittest tests.test_image_describer -v`
Expected: FAIL。

- [ ] **Step 3: 在 `config.py` 中增加图片分析独立配置与客户端工厂**

配置项：
- `IMAGE_ANALYSIS_ENABLED`
- `IMAGE_ANALYSIS_BASE_URL`
- `IMAGE_ANALYSIS_API_KEY`
- `IMAGE_ANALYSIS_MODEL`

- [ ] **Step 4: 在 `image_describer.py` 中最小实现 `describe_image(path)`**

实现要点：
- 独立 client
- 不复用主分析消息历史
- 只发送固定 system 指令与单张图片请求
- 仅返回简短自然语言摘要
- 严格失败，不自动降级

- [ ] **Step 5: 运行目标测试**

Run: `python -m unittest tests.test_image_describer -v`
Expected: PASS。

- [ ] **Step 6: 提交本任务**

```bash
git add D:/3_Projects/Active/file-organizer-test/file_organizer/shared/config.py D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/image_describer.py D:/3_Projects/Active/file-organizer-test/tests/test_image_describer.py
git commit -m "feat: add isolated vision image description"
```

### Task 5: 将图片摘要接入 `read_local_file(...)`

**Files:**
- Modify: `D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/file_reader.py`
- Modify: `D:/3_Projects/Active/file-organizer-test/tests/test_file_parser.py`

- [ ] **Step 1: 写失败测试，验证图片文件走独立 Vision 摘要分支**
- [ ] **Step 2: 运行失败测试，确认当前图片无内容语义**

Run: `python -m unittest tests.test_file_parser -v`
Expected: FAIL。

- [ ] **Step 3: 在 `file_reader.py` 中增加图片扩展名分支并接入 `describe_image(...)`**
- [ ] **Step 4: 运行目标测试，确认返回仍是现有包装格式**

Run: `python -m unittest tests.test_file_parser -v`
Expected: PASS。

- [ ] **Step 5: 提交本任务**

```bash
git add D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/file_reader.py D:/3_Projects/Active/file-organizer-test/tests/test_file_parser.py
git commit -m "feat: read image files through isolated vision summary"
```

## Chunk 4: 工具说明同步更新

### Task 6: 更新 tools 描述与 system prompt

**Files:**
- Modify: `D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/service.py`
- Modify: `D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/prompts.py`
- Modify: `D:/3_Projects/Active/file-organizer-test/tests/test_local_file_analysis_chat.py`

- [ ] **Step 1: 写失败测试，验证工具列表描述包含图片与压缩包能力说明**
- [ ] **Step 2: 运行失败测试，确认当前说明仍是旧版本**

Run: `python -m unittest tests.test_local_file_analysis_chat -v`
Expected: FAIL。

- [ ] **Step 3: 更新 `tools` 描述与 prompt 文案**

说明必须明确：
- `read_local_file` 可读取文本、办公文档、图片摘要与 `.zip` 索引摘要
- 图片摘要走独立 Vision 调用，不继承主分析上下文
- `.zip` 仅提供索引预览，不解压、不读取正文
- 文本读取支持常见中文 Windows 编码 fallback

- [ ] **Step 4: 运行目标测试**

Run: `python -m unittest tests.test_local_file_analysis_chat -v`
Expected: PASS。

- [ ] **Step 5: 提交本任务**

```bash
git add D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/service.py D:/3_Projects/Active/file-organizer-test/file_organizer/analysis/prompts.py D:/3_Projects/Active/file-organizer-test/tests/test_local_file_analysis_chat.py
git commit -m "docs: refresh analysis tool descriptions"
```

### Task 7: 更新 README 中的读取能力说明

**Files:**
- Modify: `D:/3_Projects/Active/file-organizer-test/README.md`

- [ ] **Step 1: 补充读取端新能力、Vision 独立配置与限制说明**
- [ ] **Step 2: 人工检查文档是否与实现边界一致**
- [ ] **Step 3: 提交本任务**

```bash
git add D:/3_Projects/Active/file-organizer-test/README.md
git commit -m "docs: document file reading enhancements"
```

## Chunk 5: 全量回归

### Task 8: 跑完整验证并收口

**Files:**
- Test: `D:/3_Projects/Active/file-organizer-test/tests/test_file_parser.py`
- Test: `D:/3_Projects/Active/file-organizer-test/tests/test_archive_reader.py`
- Test: `D:/3_Projects/Active/file-organizer-test/tests/test_image_describer.py`
- Test: `D:/3_Projects/Active/file-organizer-test/tests/test_local_file_analysis_chat.py`
- Test: `D:/3_Projects/Active/file-organizer-test/tests/`

- [ ] **Step 1: 运行新增与受影响测试集**

Run: `python -m unittest tests.test_file_parser tests.test_archive_reader tests.test_image_describer tests.test_local_file_analysis_chat -v`
Expected: 全部 PASS。

- [ ] **Step 2: 运行全量测试**

Run: `python -m unittest discover -s tests -p "test_*.py"`
Expected: 全部 PASS。

- [ ] **Step 3: 做最小 smoke 检查**

Run: `python -m file_organizer`
Expected: 正常启动，不因新增配置读取而崩溃。

- [ ] **Step 4: 提交收口**

```bash
git add D:/3_Projects/Active/file-organizer-test
git commit -m "feat: enhance file reading capabilities"
```
