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

## 2.1.1 placement 已成为显式会话输入

当前系统已经不再把所有目标路径都隐含地绑定在单一 `target_dir` 上，而是显式引入：

- `new_directory_root`
- `review_root`

并形成了当前稳定语义：

- `target_slot`：已有目录槽位
- `target_dir`：相对 `new_directory_root` 的新目录路径
- `Review` / `unresolved`：固定落到 `review_root`

这意味着：

- “新目录建到哪里”
- “Review 放到哪里”

现在都已经是系统可表达、可传递、可展示的真实能力。

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

## 2.4.1 目标解析已经开始收口

此前 placement / target_dir / Review / slot 解析分散在多个 app service 中；当前已经开始收口到统一的目标解析层。

当前已经存在：

- `file_pilot/app/target_resolver.py`

它承接的规则包括：

- placement 默认化
- `target_dir` 真实路径解析
- `Review` 路径解析
- `target_slot` 回退解析
- 增量模式目标目录校验

这说明后端结构已经进入“从能跑到可维护”的收口阶段，而不只是继续堆功能。

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

## 2.8.1 前端启动流已经开始重做

前端当前已经不再只是旧的“先理解模式、再填一堆表单”的启动页。

新的方向已经开始落地为：

- 先选来源
- 再决定去向
- 再按需展开配置
- 然后进入工作区扫描态

这次重构最关键的变化不是后半段主链，而是前半段“任务启动壳子”：

- 会话启动围绕 `sources[]` 展开
- 去向分流围绕：
  - `归入现有目录`
  - `生成新的分类结构`
- placement 改成：
  - 设置页默认值
  - 启动页单次覆盖

需要特别注意的一点：

- 前端虽然正在收敛成统一来源入口心智
- 但桌面端当前原生能力仍然是：
  - `选择文件`
  - `选择文件夹`

也就是说，当前“统一入口”主要是产品结构统一，而不是底层已经实现单次原生混选。

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

## 3.2.1 前端启动流仍在收口中

虽然新的启动流方向已经明确，且前端实现已经开始切换，但当前仍处于“新旧表达并存”的阶段：

- 启动页新的任务壳结构已经开始落地
- 工作区主链仍沿用现有扫描 / 方案 / 预检 / 执行模型
- placement 的默认值、任务覆盖与摘要展示已经开始接上
- 但前端测试与部分局部交互仍需要继续收口

当前更准确的判断是：

- **启动流方向已经确定**
- **核心实现已经开始落地**
- **仍需要继续打磨与回归**

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
- 继续把启动流从“配置器”压缩成“任务启动壳子”
- 继续让 placement 规则在设置页、启动页、工作区三处表达一致

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

- 启动页来源输入
- 去向分流
- placement 默认值与任务覆盖
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
- 哪些前端入口能力只是“产品统一表达”，哪些已经是底层原生能力

### 第三优先级：谨慎评估是否继续深挖执行层

现阶段后端主链已经足够稳定可用。  
除非后续出现新的稳定性或产品需求，否则不建议立即继续做大规模执行层重构。

---

## 6. 一句话总结

**后端主链已经基本从“路径驱动”切换到“映射驱动”，并且这个切换已经贯穿到分析、规划、快照、预检、执行前模型、journal 和 rollback 元数据。**

当前剩余工作的重心，已经主要不是“把后端做出来”，而是：

**让前端和文档把这套新能力真正用起来、表达出来。**
