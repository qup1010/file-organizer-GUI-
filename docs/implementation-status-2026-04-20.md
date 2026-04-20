# FilePilot 实现状态说明（2026-04-20）

> 关联文档：
> - [未来架构设计](/D:/code/projects/active/FilePilot/docs/future_architecture.md)
> - [整理流程产品说明](/D:/code/projects/active/FilePilot/docs/organize-flow-product-spec-2026-04-20.md)
> - [能力差距清单](/D:/code/projects/active/FilePilot/docs/organize-capability-gap-2026-04-20.md)

---

## 1. 结论

截至 2026-04-20，后端已经不处于“概念验证”阶段，而是进入了：

- **主链已打通**
- **核心映射架构已落地**
- **仍保留少量兼容层**

如果只回答一个问题：

**后端已经足够支撑当前产品继续演进，接下来工作的重心应该更多放在前端消费层和产品表达层，而不是继续大规模重写后端主干。**

---

## 2. 已实现的核心能力

## 2.1 会话输入模型已升级

当前创建会话已经不再以单一 `target_dir` 为唯一主语，而是支持：

- `sources[]`
- `organize_method`
- `output_dir`
- `target_profile_id`
- `target_directories[]`

这意味着系统已经具备：

- 多文件输入
- 多目录输入
- 文件与目录混合输入
- “整体分类”和“归入已有分类”两种主流程

这部分已经属于真实实现，不再只是产品设计。

---

## 2.2 领域模型主干已落地

当前后端已经有稳定的结构化领域模型：

- `SourceRef`
- `TargetSlot`
- `MappingEntry`
- `OrganizeTask`
- `IdRegistry`

对应的核心语义已经成立：

- `F-ID -> 源文件`
- `D-ID -> 目标目录`
- `F-ID -> D-ID`

这说明系统的核心整理问题，已经从“裸路径移动”升级成“映射分配再执行”。

---

## 2.3 分析层已接回真实分析

此前新 `sources[]` 链路里，`file source` 一度只是占位摘要；该问题已经修复。

现在：

- `directory source` 会走真实扫描分析
- `file source` 也会走真实分析链

因此“选中文件直接整理”不再是假扫描。

---

## 2.4 模型侧已基本去绝对路径暴露

当前模型可见的主表达已经收口到：

- `entry_id / item_id`
- `display_name`
- `entry_type`
- 摘要 / 用途

真实绝对路径保留在：

- 后端映射层
- 执行层
- journal

这意味着系统已经基本实现：

**模型操作 ID，系统操作路径**

这是 [future_architecture.md](/D:/code/projects/active/FilePilot/docs/future_architecture.md) 里非常关键的一条原则。

---

## 2.5 快照层与预检层已经映射化

当前：

- `plan_snapshot.items`
- `plan_snapshot.groups`
- `plan_snapshot.mappings`

已经主要从：

- `task.sources`
- `task.mappings`
- `task.targets`

正向投影出来。

同时：

- `run_precheck()`

也已经主要依赖：

- `task.mappings`
- `source_ref_id`
- `target_slot_id`
- `IdRegistry`

来生成预检结果和 `move_preview`。

这部分已经不再是旧的“从路径字符串反推状态”。

---

## 2.6 执行层已经有映射执行模型

当前已经新增：

- `MappedExecutionAction`
- `MappedExecutionPlan`

当前执行链路是：

```text
OrganizeTask + MappingEntry
-> MappedExecutionPlan
-> ExecutionPlan
-> 文件系统执行
```

这意味着：

- 执行前主语已经映射化
- 文件系统动作层仍保留路径执行

这是当前合理的中间态，不是缺陷。

---

## 2.7 journal 与 rollback 已经支持路径 + ID 双写

当前 execution / rollback journal 已经写入：

- 路径字段
- `item_id`
- `source_ref_id`
- `target_slot_id`
- `display_name`

因此后端现在不仅能执行，还能把映射语义保留下来，供：

- 历史查看
- 回退
- 后续更强的 item 级追踪

---

## 2.8 历史与前端消费已经开始接上新语义

目前前端已经完成这些接入：

- 启动入口改成两步式
- 支持 `sources[]`
- 预检页开始显示：
  - `display_name`
  - `item_id`
  - `target_slot_id`
- 完成页开始显示：
  - `display_name`
  - `item_id · target_slot_id`
- 历史详情页开始消费 journal 中的新 ID 字段
- 工作台主预览区已经开始把：
  - 待处理队列
  - 独立确认弹窗
  - 执行 / 回退确认提示
  从“路径主语”收口到“条目主语 + 路径说明”

也就是说，新语义已经开始走到用户可见层，而不是只停在后端。

---

## 3. 目前还没有完全完成的部分

## 3.1 执行 / 回退动作层仍然是路径执行

当前执行和回退最后仍然落在：

- `source Path`
- `target Path`

这不是问题，而是当前明确保留的工程边界。

如果以后要继续推进，可以让 execution / rollback preview 进一步向 item 视图靠拢，但这已经不是主链阻塞点。

---

## 3.2 仍有兼容层存在

当前仍保留了若干兼容结构：

- `PendingPlan / PlanMove`
- `organize_mode`
- 旧 `stage`
- 少量 legacy snapshot fallback

这些兼容层已经明显降级，但尚未完全删除。

当前判断：

- **它们不再主导主链**
- **但还没有彻底退场**

---

## 3.3 前端对新语义的消费还不够充分

虽然前端已经开始接：

- `item_id`
- `display_name`
- `target_slot_id`

但当前主要集中在：

- 预检页
- 完成页
- 历史详情页
- 工作台部分主提示与条目编辑区

工作台更多区域仍然处于“旧表达 + 新字段并存”的状态。

因此当前最自然的下一步仍然是：

- 继续把前端提示、摘要、预览和历史表达统一成条目导向

而不是继续深挖后端主链。

---

## 4. 对照未来架构文档的实现程度

按 [future_architecture.md](/D:/code/projects/active/FilePilot/docs/future_architecture.md) 的核心原则来看，当前实现程度可以这样判断：

### 已基本实现

1. `Sources` 与 `Targets` 已经成为独立输入
2. 映射主语已经落地
3. 模型操作 ID，系统操作路径已经基本成立
4. `OrganizeTask + MappingEntry` 已经成为主干
5. 预检与执行前主语已经明显映射化

### 部分实现

1. `PendingPlan` 仍然存在于 planner 边界
2. 执行和回退仍然是路径动作层
3. 旧阶段值和兼容字段仍未完全清理

### 尚未作为重点推进

1. 更强的多会话 / 多任务 item 级追踪
2. 更彻底的 execution / rollback 纯映射协议
3. 前端基于 item 语义的更完整交互体系

---

## 5. 当前推荐的工作重点

如果按 ROI 排序，当前建议如下：

### 第一优先级：前端继续消费新语义

重点包括：

- 工作台提示文本
- 执行预览 / 回退预览
- 历史详情与历史摘要
- 工作台预览区与条目编辑区
- 进一步减少“只有路径，没有条目身份”的展示

### 第二优先级：文档同步

当前新的实现状态已经明显领先于部分旧设计文档，需要继续同步：

- 哪些能力已经落地
- 哪些仍然是兼容层
- 哪些不再只是未来计划

### 第三优先级：谨慎评估是否继续深挖执行层

现阶段后端主链已经足够稳定可用。  
除非后续出现新的稳定性或产品需求，否则不建议立即继续做大规模执行层重构。

---

## 6. 一句话总结

**后端主链已经基本从“路径驱动”切换到“映射驱动”，并且这个切换已经贯穿到分析、规划、快照、预检、执行前模型、journal 和 rollback 元数据。**

当前剩余工作的重心，已经主要不是“把后端做出来”，而是：

**让前端和文档把这套新能力真正用起来、表达出来。**
