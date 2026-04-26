# FilePilot 整理流程能力差距清单

> 日期：2026-04-20  
> 基线文档：  
> - [整理流程产品说明](/d:/code/projects/active/FilePilot/docs/organize-flow-product-spec-2026-04-20.md)  
> - [未来架构设计](/d:/code/projects/active/FilePilot/docs/future_architecture.md)

---

## 一、结论

当前系统已经具备了“任务类型驱动 + 目标目录导向 + 结构化映射”的主干，但距离最新产品流程还存在明显差距。

最关键的缺口不是算法，而是**入口模型与后端输入模型仍然偏单目录**。  
当前代码仍然主要围绕：

- 单个 `target_dir`
- 单次 `createSession(target_dir, strategy)`
- `organize_mode / task_type`

运行。

而最新产品流程要求系统围绕以下三件事工作：

1. `Source Collection`
2. `Organize Method`
3. `Target Definition`

这意味着当前最需要补齐的能力有三类：

1. 多来源待整理文件集
2. 整体分类的显式输出目录
3. 可保存 / 可切换的分类目录配置

---

## 二、当前已具备的能力

## 2.1 任务类型语义已接入

当前后端和前端已经正式支持：

- `organize_full_directory`
- `organize_into_existing`

并保留与旧 `organize_mode` 的双轨兼容。

已存在事实：

- 后端策略归一化已支持 `task_type -> organize_mode`
- 前端启动链已能提交 `task_type`
- 启动页已经改成“任务类型优先”

对应代码：

- [strategy_templates.py](/d:/code/projects/active/FilePilot/file_pilot/organize/strategy_templates.py)
- [session-launcher.tsx](/d:/code/projects/active/FilePilot/frontend/src/components/session-launcher.tsx)

## 2.2 归入已有目录主链已成立

当前“归入已有目录”已经具备以下能力：

1. 创建会话时带 `task_type / organize_mode`
2. 扫描后进入目标目录选择
3. `confirm-targets` 提交目标目录池
4. 基于目标目录池生成 `target_directory_tree`
5. 进入后续规划、预检、执行、回退

对应代码：

- [scan_workflow_service.py](/d:/code/projects/active/FilePilot/file_pilot/app/scan_workflow_service.py)
- [main.py](/d:/code/projects/active/FilePilot/file_pilot/api/main.py)

## 2.3 结构化领域模型已经具备

当前已经有：

- `SourceRef`
- `TargetSlot`
- `MappingEntry`
- `OrganizeTask`

以及配套的：

- `TaskState`
- `IdRegistry`

对应代码：

- [domain/models.py](/d:/code/projects/active/FilePilot/file_pilot/domain/models.py)
- [models.py](/d:/code/projects/active/FilePilot/file_pilot/app/models.py)
- [id_registry.py](/d:/code/projects/active/FilePilot/file_pilot/app/id_registry.py)

这意味着在概念层，系统已经接近目标模型。

---

## 三、核心差距

## 3.1 差距一：Source Collection 仍然是单目录心智

### 当前状态

当前启动、建会话和扫描的主入口仍然以单个目录为中心：

- 前端创建会话仍然调用 `createSession(target_dir, ...)`
- 后端 `POST /api/sessions` 仍然以 `target_dir` 为核心输入
- 当前启动页仍只有一个“目标目录”输入框

对应代码：

- [api.ts](/d:/code/projects/active/FilePilot/frontend/src/lib/api.ts)
- [session-launcher-actions.ts](/d:/code/projects/active/FilePilot/frontend/src/lib/session-launcher-actions.ts)
- [main.py](/d:/code/projects/active/FilePilot/file_pilot/api/main.py)

### 与目标流程的差距

目标流程要求：

- 支持选择文件
- 支持选择目录
- 支持批量
- 支持跨多个路径混合组成一个待整理文件集

当前这些都没有真正进入产品主链。

### 已有基础

有一部分基础已经存在，但尚未接入主流程：

- 前端 runtime 已有 `pick_directory`
- 前端 runtime 已有 `pick_directories`

对应代码：

- [runtime.ts](/d:/code/projects/active/FilePilot/frontend/src/lib/runtime.ts)

但当前缺失：

- `pick_files`
- 启动页的“待整理文件集”展示
- 后端对多来源 source collection 的正式 API

### 结论

当前系统还没有真正支持“用户定义待整理文件集”，只支持“围绕一个目录启动任务”。

---

## 3.2 差距二：整体分类缺少显式输出目录能力

### 当前状态

当前的“整理整个目录”本质仍然是：

- 对单个目录启动扫描
- 在该目录上下文中生成分类方案

但产品流程已经明确：

> 整体分类生成出来的新分类目录，默认放在用户指定的输出目录下。

### 当前缺口

当前代码里没有正式的“输出目录”概念：

- 前端没有单独的输出目录字段
- 后端 `create_session` 也没有单独接收 output root
- 扫描目录和输出目录仍是耦合的

这会导致“整体分类”在产品上仍然像“整理当前目录”，而不是“把某批内容输出到指定位置”。

### 结论

如果要落实新产品流程，必须新增：

1. 前端的输出目录选择能力
2. 后端的输出目录输入字段
3. 执行层对“source roots”和“output root”分离的支持

---

## 3.3 差距三：分类目录配置还不存在

### 当前状态

当前“归入已有目录”虽然能选目标目录，但它仍是一次性的会话输入：

- 用户当次手动选择目标目录
- 系统生成 `target_directories`
- 本次会话使用

当前没有真正的“目录配置”能力：

- 不能保存为命名配置
- 不能在下次整理时一键复用
- 不能切换多套配置

### 目标能力

产品流程要求系统支持：

1. 临时选择目录直接使用
2. 将当前目录集合保存为配置
3. 在未来任务中切换不同配置

### 当前代码情况

当前代码库中没有看到“分类目录配置”相关的正式模型或接口：

- 没有 target profile / target preset 的 API
- 没有设置页或持久化结构来保存这类目录配置

### 结论

这是当前产品流程和现有实现之间最大的产品能力缺口之一。

---

## 四、次级差距

## 4.1 前端入口仍未进入“待整理文件集优先”

虽然启动页已经重排成“任务类型优先”，但它还没有升级成：

1. 先选待整理文件集
2. 再选整理方式

目前仍然是：

- 先定一个目录
- 再围绕这个目录做任务选择

这意味着当前启动页只是过渡方案，不是最终形态。

## 4.2 API 主语仍然不是 Source Collection

当前主 API 仍然围绕：

- `target_dir`
- `resume_if_exists`
- `strategy`

而不是围绕：

- `sources`
- `organize_method`
- `target_definition`

这会让未来接多来源、多目录配置时，接口层发生较大变化。

## 4.3 多来源执行尚未进入执行层设计

未来架构文档已经明确指出：

- 当前执行和 journal 仍有单根路径假设

这意味着即使前端能选多个来源，执行层也还不能自然承接。

---

## 五、能力差距优先级

建议按以下优先级推进。

## P0：产品入口和后端主语对齐

目标：

- 让系统真正能表示 `Source Collection`

需要补的能力：

1. 前端支持“选择文件 / 选择目录 / 批量”
2. 会话创建接口支持来源集合输入
3. `TaskState.sources` 从单目录扫描结果升级为显式来源定义

这是最高优先级，因为它决定后续流程能否真正落地。

## P1：整体分类的输出目录

目标：

- 让“整体分类”从“整理当前目录”升级成“输出到指定目录”

需要补的能力：

1. 前端输出目录选择
2. 后端 output root 输入
3. 执行层 source/output 分离

## P1：分类目录配置

目标：

- 让“归入现有分类”从一次性选择升级成可复用能力

需要补的能力：

1. 目录配置模型
2. 配置保存 / 删除 / 切换
3. 启动页配置选择器

## P2：多来源执行链收口

目标：

- 从建模层推进到执行层完整支持

需要补的能力：

1. ExecutionPlan 多来源
2. Journal 多 involved paths
3. 回退链兼容多来源

---

## 六、建议的落地阶段

## Phase A：定义新的启动输入模型

先定义并固定新的启动输入：

- `sources[]`
- `organize_method`
- `target_definition`

此阶段先不要求完整 UI 打磨，但必须把输入模型定下来。

## Phase B：前端实现 Source Collection 入口

目标：

- 启动页第一步变成“选择待整理内容”
- 支持目录 / 文件 / 批量

## Phase C：补整体分类输出目录

目标：

- 在“整体分类”分支中新增输出目录

## Phase D：补分类目录配置

目标：

- 在“归入现有分类”分支中新增目录配置保存与切换

## Phase E：再推动执行层多来源支持

目标：

- 让前端和领域模型的通用性真正延伸到执行层

---

## 七、最终判断

当前系统不是“方向错了”，而是处在一个**主干已建立、但输入模型仍偏旧**的阶段。

最准确的判断是：

1. 当前已经完成了任务类型、目标目录导向、结构化映射这些中层能力
2. 当前还没有完成待整理文件集、多来源输入、输出目录、目录配置这些上层产品能力
3. 下一步最应该补的不是继续修文案，而是**把产品入口主语从单目录升级为 Source Collection**

一句话总结：

**现在最大的差距，不在 AI 规划，也不在工作台，而在“启动时用户到底在定义什么输入”。**
