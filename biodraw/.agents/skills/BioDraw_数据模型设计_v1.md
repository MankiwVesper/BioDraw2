# BioDraw 数据模型设计 v1

## 1. 文档目的

本文档用于在《BioDraw 详细设计方案（当前阶段整理稿）》与《BioDraw 工程架构设计 v1》的基础上，进一步明确项目核心数据模型，为后续智能体编码、人工开发、工程文件设计、状态管理和渲染实现提供统一的数据定义基线。

本文档重点回答以下问题：

- BioDraw 的核心数据对象有哪些
- 每个核心对象包含哪些字段
- 哪些字段属于持久化数据，哪些字段属于运行时或编辑态数据
- 对象、轨迹、动画、工程文件之间如何关联
- 第一阶段支持哪些对象类型、路径类型、动画类型
- 后续扩展时应如何保持兼容性

---

## 2. 设计原则

数据模型设计应尽量遵循以下原则：

1. **先满足第一阶段 MVP，不为远期复杂能力过度设计**
2. **优先支持“素材 → 场景对象 → 路径 → 动画 → 播放 → 保存”主链路**
3. **持久化结构与运行时结构分离，但保持映射清晰**
4. **领域模型不依赖 UI 框架、渲染库或 DOM**
5. **所有关键对象都应具备稳定 ID**
6. **尽量使用显式字段，避免隐式推断过多**
7. **版本字段必须保留，为后续格式升级提供空间**

---

## 3. 数据模型分层

BioDraw 的数据模型建议分为三层：

### 3.1 素材层
负责描述素材库中的基础资源。

核心对象：
- `MaterialItem`
- `MaterialCategory`
- `MaterialVariant`

### 3.2 场景层
负责描述画布中的实际对象、路径、动画和场景文档。

核心对象：
- `SceneObject`
- `MotionPath`
- `AnimationClip`
- `SceneDocument`

### 3.3 工程层
负责描述保存到磁盘或加载到编辑器中的完整工程。

核心对象：
- `ProjectDocument`
- `ProjectMeta`

---

## 4. 通用基础类型

建议先定义一批全局通用类型，供后续所有领域模型复用。

```ts
type Id = string
type TimestampISO = string
type Numeric = number
```

### 4.1 二维点

```ts
type Point2D = {
  x: number
  y: number
}
```

### 4.2 二维尺寸

```ts
type Size2D = {
  width: number
  height: number
}
```

### 4.3 矩形区域

```ts
type Rect2D = {
  x: number
  y: number
  width: number
  height: number
}
```

### 4.4 颜色值

第一阶段建议直接使用字符串表示，例如：

```ts
type ColorValue = string
```

例如：
- `#22c55e`
- `rgba(0,0,0,0.4)`

### 4.5 可见性

```ts
type VisibilityFlag = boolean
```

---

## 5. 素材层模型

## 5.1 MaterialCategory

用于描述素材库中的分类结构。

```ts
type MaterialCategory = {
  id: Id
  name: string
  parentId?: Id | null
  order: number
  description?: string
}
```

### 字段说明

- `id`：分类唯一标识
- `name`：分类名称，例如“细胞与细胞器”
- `parentId`：父分类 ID，一级分类可为 `null`
- `order`：排序值
- `description`：分类说明，可选

---

## 5.2 MaterialItem

用于描述素材库中的单个素材项。

```ts
type MaterialItem = {
  id: Id
  name: string
  englishName?: string
  categoryId: Id
  tags: string[]
  description?: string

  assetType: 'svg' | 'png' | 'webp'
  assetPath: string
  thumbnailPath?: string

  defaultWidth: number
  defaultHeight: number

  styleCapabilities: MaterialStyleCapabilities
  animationCapabilities: MaterialAnimationCapabilities

  variants?: MaterialVariant[]
  defaultStateKey?: string

  source?: MaterialSource
}
```

### 字段说明

- `id`：素材唯一标识
- `name`：中文名称
- `englishName`：英文名称，可选
- `categoryId`：所属分类 ID
- `tags`：关键词标签
- `description`：素材说明
- `assetType`：资源类型
- `assetPath`：素材文件路径
- `thumbnailPath`：缩略图路径
- `defaultWidth` / `defaultHeight`：默认落入画布的尺寸
- `styleCapabilities`：样式能力定义
- `animationCapabilities`：动画能力定义
- `variants`：可选的状态或变体
- `defaultStateKey`：默认状态键
- `source`：来源信息

---

## 5.3 MaterialStyleCapabilities

描述素材是否支持颜色、透明度等样式变化。

```ts
type MaterialStyleCapabilities = {
  recolorable: boolean
  opacityAdjustable: boolean
  scalable: boolean
  rotatable: boolean
}
```

### 说明

第一阶段建议至少支持：
- 缩放
- 旋转
- 透明度变化

变色能力是否真正可用，由具体素材决定。

---

## 5.4 MaterialAnimationCapabilities

描述素材是否适合参与某类动画。

```ts
type MaterialAnimationCapabilities = {
  movable: boolean
  stateSwitchable: boolean
  pathBindable: boolean
  fadeable: boolean
  scalable: boolean
  rotatable: boolean
}
```

### 说明

例如：
- 水分子：`movable = true`
- 通道蛋白：`stateSwitchable = true`
- 标签：`fadeable = true`

---

## 5.5 MaterialVariant

描述素材的状态变体。

```ts
type MaterialVariant = {
  key: string
  label: string
  assetPath?: string
  hiddenParts?: string[]
  visibleParts?: string[]
}
```

### 第一阶段说明

第一阶段可简化为：
- `assetPath` 指向替代版本
- 或通过 `hiddenParts / visibleParts` 控制结构化 SVG 的显示部分

例如：
- 通道蛋白：`closed` / `open`
- 囊泡：`normal` / `fusion`
- 染色体：`single` / `replicated`

---

## 5.6 MaterialSource

记录素材来源和授权信息。

```ts
type MaterialSource = {
  sourceName: string
  sourceUrl?: string
  license?: string
  author?: string
  notes?: string
}
```

### 说明

这部分不会直接影响编辑器运行，但对素材库长期维护很重要。

---

## 6. 场景层模型

场景层是 BioDraw 的核心数据层。  
它负责描述画布中真正被编辑、被播放、被保存的内容。

---

## 6.1 SceneObjectType

第一阶段建议支持以下对象类型：

```ts
type SceneObjectType =
  | 'material'
  | 'label'
  | 'arrow'
  | 'path-helper'
```

### 说明

- `material`：来自素材库的普通对象
- `label`：文本标注对象
- `arrow`：教学箭头对象
- `path-helper`：编辑辅助路径对象，一般不作为最终导出元素

---

## 6.2 SceneObject

用于描述画布中的单个对象。

```ts
type SceneObject = {
  id: Id
  type: SceneObjectType
  name: string

  materialId?: Id | null

  x: number
  y: number
  width: number
  height: number

  rotation: number
  scaleX: number
  scaleY: number
  opacity: number

  visible: boolean
  locked?: boolean

  zIndex: number

  anchorX?: number
  anchorY?: number

  style?: SceneObjectStyle
  stateKey?: string

  pathIds?: Id[]
  animationIds: Id[]

  meta?: SceneObjectMeta
}
```

### 字段说明

- `id`：对象唯一标识
- `type`：对象类型
- `name`：对象名称
- `materialId`：当 `type = material` 时指向素材库素材
- `x / y`：对象位置
- `width / height`：对象尺寸
- `rotation`：旋转角度
- `scaleX / scaleY`：缩放比例
- `opacity`：透明度
- `visible`：是否可见
- `locked`：是否锁定，第一阶段可预留
- `zIndex`：层级顺序
- `anchorX / anchorY`：锚点位置，可选
- `style`：对象样式覆盖
- `stateKey`：当前状态键
- `pathIds`：关联路径 ID 列表
- `animationIds`：动画片段 ID 列表
- `meta`：额外元信息

---

## 6.3 SceneObjectStyle

用于描述对象级样式覆盖。

```ts
type SceneObjectStyle = {
  fill?: ColorValue
  stroke?: ColorValue
  strokeWidth?: number
  textColor?: ColorValue
  fontSize?: number
}
```

### 第一阶段说明

第一阶段不应把样式系统做得过重。  
对普通素材对象来说，这里更多是“覆盖式样式”，而不是完整绘图样式系统。

---

## 6.4 SceneObjectMeta

用于存放对象的额外信息。

```ts
type SceneObjectMeta = {
  createdFrom?: 'material-drop' | 'duplicate' | 'import'
  notes?: string
}
```

第一阶段可只做最基础用途，后续可扩展。

---

## 6.5 LabelObject 扩展字段建议

如果 `type = 'label'`，建议通过额外字段表达文本内容。

```ts
type LabelObjectData = {
  text: string
  align?: 'left' | 'center' | 'right'
}
```

可将其放入：

```ts
type SceneObject = {
  ...
  data?: LabelObjectData | ArrowObjectData | MaterialObjectData
}
```

为保持模型统一，建议采用 `data` 承载对象特有字段。

---

## 6.6 ArrowObject 扩展字段建议

```ts
type ArrowObjectData = {
  arrowKind: 'line' | 'curve' | 'double' | 'dashed'
  points?: number[]
}
```

第一阶段如不重点做箭头编辑，可只支持简单直线箭头。

---

## 6.7 MaterialObjectData

```ts
type MaterialObjectData = {
  materialVariantKey?: string
}
```

用于表示当前使用的是素材的哪个状态或变体。

---

## 7. 路径层模型

## 7.1 MotionPathKind

```ts
type MotionPathKind = 'line' | 'polyline' | 'bezier'
```

第一阶段只支持这三类路径。

---

## 7.2 PathPoint

```ts
type PathPoint = {
  x: number
  y: number
  inHandleX?: number
  inHandleY?: number
  outHandleX?: number
  outHandleY?: number
}
```

### 字段说明

- `x / y`：锚点位置
- `inHandleX / inHandleY`：入控制柄
- `outHandleX / outHandleY`：出控制柄

### 第一阶段约束

- 直线路径：只使用 `x / y`
- 折线路径：多个点，仅使用 `x / y`
- 贝塞尔路径：使用控制柄

---

## 7.3 MotionPath

```ts
type MotionPath = {
  id: Id
  name?: string
  kind: MotionPathKind

  points: PathPoint[]
  pathData: string

  closed: boolean
  visible: boolean

  boundObjectIds?: Id[]

  style?: MotionPathStyle
}
```

### 字段说明

- `id`：路径唯一标识
- `name`：路径名称
- `kind`：路径类型
- `points`：编辑态锚点数据
- `pathData`：播放态和导出态使用的 SVG Path 字符串
- `closed`：是否闭合
- `visible`：编辑态是否显示
- `boundObjectIds`：已绑定对象 ID 列表
- `style`：编辑态显示样式

---

## 7.4 MotionPathStyle

```ts
type MotionPathStyle = {
  stroke?: ColorValue
  strokeWidth?: number
  dash?: number[]
}
```

### 第一阶段说明

该样式主要用于编辑辅助显示，不一定持久影响最终导出。

---

## 8. 动画层模型

## 8.1 AnimationClipType

第一阶段建议支持以下动画类型：

```ts
type AnimationClipType =
  | 'move'
  | 'moveAlongPath'
  | 'fade'
  | 'scale'
  | 'rotate'
  | 'stateChange'
```

### 第一阶段重点
真正优先实现的是：
- `moveAlongPath`
- `stateChange`（可先预留）
- `fade`（可后置）
- `scale` / `rotate`（可预留结构）

---

## 8.2 AnimationClipBase

```ts
type AnimationClipBase = {
  id: Id
  objectId: Id
  type: AnimationClipType

  startTimeMs: number
  durationMs: number
  easing?: EasingType

  enabled?: boolean
}
```

### 字段说明

- `id`：动画片段 ID
- `objectId`：所属对象 ID
- `type`：动画类型
- `startTimeMs`：起始时间
- `durationMs`：持续时间
- `easing`：缓动类型
- `enabled`：是否启用

---

## 8.3 EasingType

第一阶段建议不要做复杂自定义曲线，只使用少量枚举值。

```ts
type EasingType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
```

---

## 8.4 MoveAlongPathClip

```ts
type MoveAlongPathClip = AnimationClipBase & {
  type: 'moveAlongPath'
  payload: {
    pathId: Id
    followPathAngle?: boolean
    speedMode?: 'duration' | 'speed'
    speed?: number
    loop?: boolean
  }
}
```

### 字段说明

- `pathId`：绑定路径 ID
- `followPathAngle`：是否沿路径方向旋转
- `speedMode`：速度模式
- `speed`：速度值，可选
- `loop`：是否循环

### 第一阶段建议

第一阶段实际计算时，内部建议还是以 `durationMs` 为主，`speed` 作为可选辅助字段。

---

## 8.5 StateChangeClip

```ts
type StateChangeClip = AnimationClipBase & {
  type: 'stateChange'
  payload: {
    fromStateKey?: string
    toStateKey: string
  }
}
```

### 说明

用于对象状态切换，例如：
- 通道蛋白从 closed 切换为 open
- 囊泡从 normal 切换为 fusion

---

## 8.6 FadeClip

```ts
type FadeClip = AnimationClipBase & {
  type: 'fade'
  payload: {
    fromOpacity: number
    toOpacity: number
  }
}
```

---

## 8.7 ScaleClip

```ts
type ScaleClip = AnimationClipBase & {
  type: 'scale'
  payload: {
    fromScaleX: number
    fromScaleY: number
    toScaleX: number
    toScaleY: number
  }
}
```

---

## 8.8 RotateClip

```ts
type RotateClip = AnimationClipBase & {
  type: 'rotate'
  payload: {
    fromRotation: number
    toRotation: number
  }
}
```

---

## 8.9 动画联合类型

```ts
type AnimationClip =
  | MoveAlongPathClip
  | StateChangeClip
  | FadeClip
  | ScaleClip
  | RotateClip
```

---

## 9. 场景文档模型

SceneDocument 用于描述当前编辑器中的完整场景内容。

## 9.1 SceneDocument

```ts
type SceneDocument = {
  version: string

  canvas: SceneCanvasConfig

  materials: Id[]
  objects: SceneObject[]
  paths: MotionPath[]
  animations: AnimationClip[]

  globalDurationMs: number
}
```

### 字段说明

- `version`：场景文档版本号
- `canvas`：画布配置
- `materials`：当前场景引用到的素材 ID 列表
- `objects`：对象列表
- `paths`：路径列表
- `animations`：动画片段列表
- `globalDurationMs`：全局时长

---

## 9.2 SceneCanvasConfig

```ts
type SceneCanvasConfig = {
  width: number
  height: number
  backgroundColor?: ColorValue
}
```

### 第一阶段说明

先只保留最基础字段，后续可再扩展背景图、网格开关等能力。

---

## 10. 工程层模型

工程层是在场景文档之上，加入项目元信息后的完整持久化结构。

## 10.1 ProjectMeta

```ts
type ProjectMeta = {
  id: Id
  title: string
  description?: string
  createdAt: TimestampISO
  updatedAt: TimestampISO
}
```

---

## 10.2 ProjectDocument

```ts
type ProjectDocument = {
  version: string
  meta: ProjectMeta
  scene: SceneDocument
}
```

### 字段说明

- `version`：工程文件版本号
- `meta`：工程元信息
- `scene`：场景文档

---

## 11. 播放器运行时模型

播放器状态不应全部持久化到工程文件中。  
它更适合保存在运行时状态里。

## 11.1 PlayerState

```ts
type PlayerState = {
  status: 'stopped' | 'playing' | 'paused'
  currentTimeMs: number
  speedRate: number
}
```

### 字段说明

- `status`：播放器状态
- `currentTimeMs`：当前播放时间
- `speedRate`：播放倍率

---

## 11.2 EditorState（建议形态）

```ts
type EditorState = {
  project: ProjectDocument

  editor: {
    selectedObjectIds: Id[]
    selectedPathId: Id | null
    activeTool: 'select' | 'path-edit' | 'pan'
    isPathEditing: boolean
    zoom: number
    panX: number
    panY: number
  }

  player: PlayerState

  materials: {
    selectedCategory: Id | null
    keyword: string
    favorites: Id[]
    recentIds: Id[]
  }
}
```

---

## 12. 持久化字段与运行时字段边界

为了避免工程文件污染，建议明确哪些字段进入保存文件，哪些不进入。

## 12.1 进入工程文件的字段

- 工程元信息
- 画布尺寸
- 素材引用列表
- 对象列表
- 路径列表
- 动画片段列表
- 全局时长

## 12.2 不进入工程文件的字段

- 当前选中对象
- 当前缩放比例
- 当前面板展开状态
- 当前悬停对象
- 播放器临时运行状态
- 最近使用素材列表（如需，也可本地单独存储，不必进工程文件）

---

## 13. 第一阶段模型约束

为了降低第一阶段实现复杂度，建议明确以下约束。

### 13.1 对象选择
- 第一阶段 UI 可只支持单选
- 但数据结构保留多选扩展能力

### 13.2 路径
- 第一阶段只支持一条对象绑定一条主运动路径
- 不支持复杂路径嵌套
- 不支持路径布尔运算

### 13.3 动画
- 第一阶段一个对象可拥有多个动画片段
- 但重点只实现 `moveAlongPath`
- 多动画叠加冲突问题可先简化处理

### 13.4 状态切换
- 第一阶段可先预留字段和模型
- 是否完整实现取决于首批素材是否已具备状态变体

### 13.5 文本和箭头
- 第一阶段只需支持最小能力
- 不要让其复杂度拖累主链路

---

## 14. 推荐的类型文件拆分方式

建议将类型文件按领域拆分：

```text
src/domain/materials/types.ts
src/domain/scene/types.ts
src/domain/paths/types.ts
src/domain/animation/types.ts
src/domain/project/types.ts
src/domain/player/types.ts
```

同时在需要的地方建立聚合导出：

```text
src/domain/types.ts
```

这样有利于：
- 智能体按模块修改
- 避免一个巨大 types 文件失控
- 降低互相引用混乱

---

## 15. 兼容性与版本策略

由于后续工程文件一定会演进，建议从第一阶段开始保留版本字段。

### 15.1 版本字段建议

- `ProjectDocument.version`
- `SceneDocument.version`

### 15.2 当前建议版本值

第一阶段可使用：

```ts
const PROJECT_VERSION = '1.0.0'
const SCENE_VERSION = '1.0.0'
```

### 15.3 升级原则

后续如修改工程结构：
- 新增字段优先兼容旧文件
- 删除字段前应考虑迁移逻辑
- 复杂升级通过 `projectDeserializer` 做适配

---

## 16. 第一阶段最关键的类型实现顺序

建议按以下顺序先落类型：

### Step 1
- `MaterialItem`
- `MaterialCategory`

### Step 2
- `SceneObject`
- `SceneObjectType`

### Step 3
- `PathPoint`
- `MotionPath`

### Step 4
- `AnimationClip`
- `MoveAlongPathClip`

### Step 5
- `SceneDocument`
- `ProjectDocument`

### Step 6
- `EditorState`
- `PlayerState`

这样顺序更符合主链路，也更利于后续代码渐进落地。

---

## 17. 与后续文档的关系

本文档应作为以下后续文档的基础：

- 《BioDraw 主界面交互说明 v1》
- 《BioDraw 工程文件结构设计 v1》
- 《BioDraw MVP 开发任务拆解 v1》
- 《BioDraw 轨迹编辑器设计 v1》

也就是说：

- 本文档定义“数据长什么样”
- 后续交互文档定义“用户怎么操作这些数据”
- 后续任务文档定义“先实现哪一部分数据和逻辑”

---

## 18. 结语

这份数据模型设计文档的目标，不是一次性穷尽未来所有能力，而是为当前阶段建立一套**足够清晰、足够稳定、足够适合智能体编码实现**的核心数据骨架。

后续所有实现都应尽量反复对照下面这句话：

**当前新增的数据字段，是否真的服务于 BioDraw 第一阶段“素材 → 场景 → 路径 → 动画 → 播放 → 保存”主链路？**

如果没有，就不应轻易加入。
