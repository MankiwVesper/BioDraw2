# BioDraw MVP 开发任务拆解 v1

## 1. 文档目的

本文档用于在《BioDraw 详细设计方案（当前阶段整理稿）》《BioDraw 工程架构设计 v1》《BioDraw 数据模型设计 v1》《BioDraw 主界面交互说明 v1》的基础上，将 BioDraw 第一阶段 MVP 的开发工作拆解为可执行的里程碑、任务项与验收标准，以便智能体或开发者能够按阶段推进实现。

本文档重点回答以下问题：

- 第一阶段到底先做什么
- 各里程碑的边界是什么
- 每一阶段需要落哪些文件和能力
- 每一阶段做到什么程度算完成
- 哪些内容明确不进入当前里程碑
- 如何避免开发过程中不断发散

---

## 2. MVP 范围定义

BioDraw 第一阶段 MVP 的目标不是做出一个完整成熟产品，而是打通以下核心链路：

**素材进入画布 → 对象摆放 → 路径设计 → 动画播放 → 工程保存**

若条件允许，再为导出能力做接口预留。

### 2.1 第一阶段必须完成的主链路

1. 基础编辑器布局
2. 基础素材库展示
3. 素材拖拽进入画布
4. 画布对象选中与拖拽
5. 右侧属性区基础数值编辑
6. 路径创建与锚点编辑
7. 对象沿路径播放预览
8. 工程保存为 JSON 并重新加载

### 2.2 第一阶段不要求完整实现的内容

- MP4 真正导出成品
- 复杂时间线编辑器
- 多对象编组
- 复杂撤销重做
- 多人协作
- 复杂路径布尔运算
- 自定义素材绘制器
- 云端工程同步
- 高级模板系统
- 完整状态变体系统
- 高级文本排版能力

---

## 3. 里程碑划分总览

建议将第一阶段拆分为 7 个里程碑：

- **M1：项目基础骨架**
- **M2：素材库 MVP**
- **M3：画布对象编辑 MVP**
- **M4：轨迹编辑 MVP**
- **M5：播放预览 MVP**
- **M6：工程保存与加载 MVP**
- **M7：导出架构预留**

建议按顺序推进，不要大规模并行散做。

---

## 4. M1：项目基础骨架

## 4.1 目标

建立第一阶段的工程骨架、基础目录结构、核心类型占位和页面布局，使项目进入“可持续落代码”的状态。

## 4.2 本阶段必须完成的内容

### 任务 1：初始化目录结构
根据《BioDraw 工程架构设计 v1》建立最小可用目录：

```text
src/
  app/
  pages/
  features/
  domain/
  render/
  infrastructure/
  state/
  shared/
```

### 任务 2：建立 EditorPage 基础布局
页面中至少出现以下区域：

- 顶部工具栏
- 左侧素材区
- 中间画布区
- 右侧属性 / 动画区

### 任务 3：建立基础类型占位
至少建立下列类型文件：

- `domain/materials/types.ts`
- `domain/scene/types.ts`
- `domain/paths/types.ts`
- `domain/animation/types.ts`
- `domain/project/types.ts`
- `domain/player/types.ts`

### 任务 4：建立 EditorStore 骨架
至少具备以下状态字段骨架：

- `project`
- `editor`
- `player`
- `materials`

### 任务 5：建立空白画布承载区
中间区域可以先只显示占位文字，例如：

- “画布区域”

但其结构必须可继续承载 Konva Stage。

## 4.3 本阶段建议涉及文件

- `src/pages/editor/EditorPage.tsx`
- `src/features/editor-shell/*`
- `src/features/toolbar/*`
- `src/features/materials-panel/*`
- `src/features/canvas-panel/*`
- `src/features/inspector-panel/*`
- `src/state/editor/*`
- `src/domain/*/types.ts`

## 4.4 验收标准

满足以下条件则视为 M1 完成：

- 编辑器页面能正常打开
- 左中右三区域与顶部栏可见
- 工程目录结构已建立
- 基础类型文件已创建
- EditorStore 能正常提供初始状态
- 项目可正常运行，不报阻断性错误

## 4.5 本阶段明确不做的内容

- 实际素材展示
- Konva 对象渲染
- 对象交互
- 路径编辑
- 播放逻辑

---

## 5. M2：素材库 MVP

## 5.1 目标

让用户可以在左侧看到分类化素材列表，并将一个素材拖入画布，生成场景对象。

## 5.2 本阶段必须完成的内容

### 任务 1：定义素材数据结构
实现以下类型：

- `MaterialCategory`
- `MaterialItem`
- `MaterialStyleCapabilities`
- `MaterialAnimationCapabilities`

### 任务 2：建立素材清单 manifest
至少准备一小批静态素材数据，建议围绕“跨膜运输”主题，例如：

- 细胞膜
- 通道蛋白
- 载体蛋白
- 水分子
- 葡萄糖
- ATP
- 囊泡
- 箭头
- 文本标注

### 任务 3：实现左侧分类展示
支持：

- 一级分类切换
- 对应素材列表展示

### 任务 4：实现素材搜索
支持按 `name` 和 `tags` 过滤。

### 任务 5：实现素材拖拽进入画布
用户拖拽素材到画布后：

- 创建新的 `SceneObject`
- 对象类型为 `material`
- `materialId` 指向对应素材
- 对象位置根据释放点确定
- 对象自动被选中

## 5.3 本阶段建议涉及文件

- `src/domain/materials/types.ts`
- `src/domain/materials/materialCatalog.ts`
- `src/features/materials-panel/*`
- `src/state/editor/editorActions.ts`
- `src/domain/scene/sceneMutations.ts`

## 5.4 验收标准

满足以下条件则视为 M2 完成：

- 左侧能看到素材分类和素材列表
- 可通过关键词搜索素材
- 可将素材拖入画布
- 拖入后画布中出现对象
- 新对象自动成为当前选中对象

## 5.5 本阶段明确不做的内容

- 素材收藏系统
- 最近使用列表完整实现
- 复杂素材预览面板
- 素材状态切换完整支持

---

## 6. M3：画布对象编辑 MVP

## 6.1 目标

让用户能够在画布中选中对象、拖拽对象，并在右侧通过数值微调对象的基本属性。

## 6.2 本阶段必须完成的内容

### 任务 1：接入 Konva Stage
中间画布区使用 `react-konva` 建立最小可用 Stage / Layer 结构。

### 任务 2：实现 SceneObject 的可视化渲染
支持将 `material` 类型对象渲染到画布中。

第一阶段可先使用简化方式：
- 占位矩形
- 或基础 SVG 预览

### 任务 3：实现对象选中
点击对象后：
- 该对象成为当前选中对象
- 右侧区域显示对象信息
- 画布中有明显选中反馈

### 任务 4：实现对象拖拽
拖动对象时：
- 对象在画布中实时移动
- 松手后更新 `x / y`

### 任务 5：实现右侧属性面板基础编辑
至少支持修改：

- `x`
- `y`
- `width`
- `height`
- `rotation`

### 任务 6：实现双向同步
要求：
- 画布拖拽后，右侧数值同步更新
- 右侧输入后，画布对象同步更新

## 6.3 本阶段建议涉及文件

- `src/render/canvas/CanvasRoot.tsx`
- `src/render/objects/renderSceneObject.tsx`
- `src/render/objects/renderers/SvgMaterialRenderer.tsx`
- `src/features/canvas-panel/*`
- `src/features/inspector-panel/*`
- `src/state/editor/editorSelectors.ts`
- `src/domain/scene/sceneSelectors.ts`
- `src/domain/scene/sceneMutations.ts`

## 6.4 验收标准

满足以下条件则视为 M3 完成：

- 画布中对象可见
- 点击对象可选中
- 选中对象可拖动
- 右侧能显示基础属性
- 修改右侧数值后画布同步变化
- 拖动对象后右侧数值同步变化

## 6.5 本阶段明确不做的内容

- 多选
- 编组
- 对齐分布
- 复杂控制柄缩放
- 高级旋转手柄
- 锁定 / 隐藏完整系统

---

## 7. M4：轨迹编辑 MVP

## 7.1 目标

让用户为对象创建一条运动路径，并能对路径点进行可视化编辑。

## 7.2 本阶段必须完成的内容

### 任务 1：定义路径模型
实现以下类型：

- `MotionPathKind`
- `PathPoint`
- `MotionPath`

### 任务 2：实现进入路径编辑模式
选中对象后，点击“编辑轨迹”按钮可进入路径编辑模式。

### 任务 3：实现路径创建
第一阶段建议支持：

- 折线路径创建
- 至少支持连续点选添加路径点

### 任务 4：实现路径点编辑
支持：

- 路径点显示
- 拖动路径点改变位置
- 路径实时重绘

### 任务 5：生成 pathData
路径编辑后，能够从 `points` 生成 `pathData`。

### 任务 6：将路径绑定到对象
路径创建完成后：

- 路径 ID 记录到对象 `pathIds`
- 或建立对应的 `moveAlongPath` 动画片段

## 7.3 本阶段建议涉及文件

- `src/domain/paths/types.ts`
- `src/domain/paths/pathBuilder.ts`
- `src/domain/paths/pathMutations.ts`
- `src/render/objects/renderers/PathRenderer.tsx`
- `src/render/objects/renderers/HandlesRenderer.tsx`
- `src/features/animation-panel/*`
- `src/state/editor/editorActions.ts`

## 7.4 验收标准

满足以下条件则视为 M4 完成：

- 选中对象后可进入轨迹编辑模式
- 可创建至少一条路径
- 路径点可拖动
- 路径会随拖动更新
- 路径与对象有明确绑定关系

## 7.5 本阶段明确不做的内容

- 复杂贝塞尔控制柄完整编辑
- 多路径叠加
- 闭合路径高级用法
- 路径复用给多个对象
- 高级吸附与对齐

---

## 8. M5：播放预览 MVP

## 8.1 目标

让对象能够根据当前时间沿路径运动，并支持基础播放、暂停、停止控制。

## 8.2 本阶段必须完成的内容

### 任务 1：建立 PlayerState
实现：

- `status`
- `currentTimeMs`
- `speedRate`

### 任务 2：实现播放器状态切换
支持：

- `stopped`
- `playing`
- `paused`

### 任务 3：实现 moveAlongPath 动画解析
根据：

- 当前时间
- 动画开始时间
- 动画时长
- 绑定路径

计算对象当前位置。

### 任务 4：实现播放控制按钮
支持：

- 播放
- 暂停
- 停止

### 任务 5：预览时隐藏编辑辅助元素
播放过程中：
- 不显示锚点
- 不显示控制柄
- 可弱化或隐藏路径辅助线

## 8.3 本阶段建议涉及文件

- `src/domain/player/types.ts`
- `src/domain/player/playerEngine.ts`
- `src/render/preview/sceneFrameResolver.ts`
- `src/features/preview-controls/*`
- `src/state/editor/editorReducer.ts`
- `src/domain/animation/types.ts`

## 8.4 验收标准

满足以下条件则视为 M5 完成：

- 点击播放后对象沿路径运动
- 点击暂停后停留在当前帧
- 点击停止后对象回到初始状态
- 播放期间编辑辅助元素被隐藏或弱化
- 不同对象如有路径和动画，可各自正确解析

## 8.5 本阶段明确不做的内容

- 复杂多轨时间线
- 时间头拖拽
- 逐帧编辑
- 多动画复杂叠加冲突处理
- 高级 easing 曲线编辑器

---

## 9. M6：工程保存与加载 MVP

## 9.1 目标

让用户能将当前工程保存为 JSON 文件，并在之后重新加载恢复场景。

## 9.2 本阶段必须完成的内容

### 任务 1：定义工程文档结构
实现：

- `ProjectMeta`
- `ProjectDocument`
- `SceneDocument`

### 任务 2：实现工程序列化
支持将当前工程状态导出为 JSON。

### 任务 3：实现工程反序列化
支持从 JSON 恢复：

- 画布配置
- 对象
- 路径
- 动画
- 工程元数据

### 任务 4：实现保存按钮逻辑
点击保存后：
- 生成 JSON 文件
- 触发本地下载或本地保存

### 任务 5：实现加载入口
第一阶段可用：
- 文件选择框
- 或简单导入按钮

## 9.3 本阶段建议涉及文件

- `src/domain/project/types.ts`
- `src/domain/project/projectSerializer.ts`
- `src/domain/project/projectDeserializer.ts`
- `src/infrastructure/storage/localProjectStorage.ts`
- `src/features/project-actions/*`

## 9.4 验收标准

满足以下条件则视为 M6 完成：

- 能导出当前工程为 JSON
- 再次加载后可恢复对象、路径、动画
- 恢复后仍可继续编辑和播放
- 工程版本字段被正确保留

## 9.5 本阶段明确不做的内容

- 云端保存
- 自动保存
- 历史版本管理
- 工程冲突合并
- 跨版本复杂迁移逻辑

---

## 10. M7：导出架构预留

## 10.1 目标

为后续 MP4 导出建立明确接口边界，但不要求在本里程碑内完成完整视频导出能力。

## 10.2 本阶段必须完成的内容

### 任务 1：定义导出服务接口
至少应明确：

- 输入：`ProjectDocument` 或标准渲染上下文
- 输出：导出任务结果或占位结果

### 任务 2：定义导出上下文模型
需要明确导出时将使用哪些数据，例如：

- 画布尺寸
- 全局时长
- 播放器逐帧解析能力
- 背景配置
- 对象渲染结果

### 任务 3：在 UI 中预留导出入口
即使 MP4 尚未完全实现，也要保证：
- 按钮存在
- 调用链路清晰
- 后续可接入真正导出器

## 10.3 本阶段建议涉及文件

- `src/infrastructure/export/exportService.ts`
- `src/domain/project/types.ts`
- `src/features/project-actions/*`

## 10.4 验收标准

满足以下条件则视为 M7 完成：

- 导出接口已被抽象出来
- 导出按钮能触发统一入口
- 不会把导出逻辑散落写进各个组件
- 后续 MP4 实现有明确接入点

## 10.5 本阶段明确不做的内容

- 真正稳定的 MP4 编码导出
- 浏览器端完整录制链路
- 后端渲染服务
- 批量导出

---

## 11. 建议的开发顺序与节奏

建议严格按以下顺序推进：

1. M1 基础骨架
2. M2 素材库
3. M3 对象编辑
4. M4 轨迹编辑
5. M5 播放预览
6. M6 工程保存
7. M7 导出预留

### 原因
这条顺序严格贴合主链路：

**有壳子 → 有素材 → 能落对象 → 能画路径 → 能播放 → 能保存 → 再谈导出**

如果顺序打乱，极易出现：
- 代码结构混乱
- 功能互相阻塞
- 智能体不断回滚和重写

---

## 12. 每个里程碑完成后的建议动作

为了避免越做越乱，每个里程碑完成后建议都做以下检查：

### 12.1 结构检查
- 新代码是否放在正确目录
- 类型是否优先落在 domain
- 组件是否承担了过多业务逻辑

### 12.2 交互检查
- 当前链路是否顺畅
- 是否新增了文档未定义的复杂交互

### 12.3 运行检查
- 页面是否能正常打开
- 当前阶段主功能是否稳定可用

### 12.4 收敛检查
- 是否出现提前实现后续阶段能力的倾向
- 是否为了“以后也许要用”而引入过重抽象

---

## 13. 智能体执行时的任务粒度建议

如果后续由智能体参与实现，建议不要一次性下发“完成一个里程碑”的超大任务，而应继续拆成更小任务。

例如 M3 可拆成：

- M3-1：Konva Stage 接入
- M3-2：SceneObject 基础渲染
- M3-3：对象选中逻辑
- M3-4：对象拖拽逻辑
- M3-5：右侧属性区读取当前对象
- M3-6：属性修改回写画布

### 原则
- 一次一个可验证的小目标
- 每步都有清晰验收
- 避免让智能体跨越太多文件和太多概念层级

---

## 14. 当前最适合先编码的起点

如果现在立刻开始编码，建议从以下最小起点开始：

### 起点任务 A
建立 M1 基础骨架：
- `EditorPage`
- 顶部工具栏
- 左中右布局
- 初始 EditorStore

### 起点任务 B
建立基础类型文件：
- `MaterialItem`
- `SceneObject`
- `MotionPath`
- `AnimationClip`
- `ProjectDocument`

### 起点任务 C
建立素材 manifest 和左侧素材区占位 UI

这三个起点完成后，项目就进入可持续推进状态。

---

## 15. 本文档与其他文档的关系

本文档是最接近“执行层”的文档。

它建立在以下文档之上：

- 《BioDraw 详细设计方案（当前阶段整理稿）》：定义方向
- 《BioDraw 工程架构设计 v1》：定义结构
- 《BioDraw 数据模型设计 v1》：定义数据
- 《BioDraw 主界面交互说明 v1》：定义操作
- **本文档**：定义开发阶段与执行顺序

也就是说：

- 前面几份文档回答“应该做成什么样”
- 本文档回答“先做哪一步，做到什么算合格”

---

## 16. 结语

这份 MVP 开发任务拆解文档的目标，不是替代代码实现，而是为当前阶段提供一套**可执行、可验收、可收敛**的开发路径。

后续无论是智能体还是人工开发，都应尽量反复对照下面这句话：

**当前正在做的任务，是否真的属于 BioDraw 第一阶段 MVP 主链路的一部分？**

如果不是，就不应优先投入。
