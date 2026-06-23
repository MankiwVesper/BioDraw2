# BioDraw 工程文件结构设计 v1

## 1. 文档目的

本文档用于明确 BioDraw 工程文件（Project File）的持久化结构，作为工程保存、工程加载、版本兼容、导入导出链路设计的统一依据。

本文档重点回答以下问题：

- 工程文件的顶层结构是什么
- 哪些数据需要持久化，哪些不应持久化
- 素材、对象、路径、动画如何在文件中组织
- 版本字段如何设计
- 后续升级时如何兼容旧工程

---

## 2. 设计原则

1. **优先保证第一阶段 MVP 可保存、可恢复**
2. **文件结构应清晰、可读、可调试**
3. **运行时临时状态不应写入工程文件**
4. **必须保留版本字段**
5. **工程文件结构应尽量与领域模型一致**
6. **允许后续通过反序列化层做兼容升级**

---

## 3. 工程文件与运行时状态的边界

### 3.1 工程文件中应保存的内容
- 工程元信息
- 画布配置
- 使用到的素材引用
- 场景对象
- 路径
- 动画片段
- 全局时长

### 3.2 工程文件中不应保存的内容
- 当前选中对象
- 当前右侧面板 tab
- 当前缩放比例
- 当前悬停状态
- 当前播放时间
- 当前是否在路径编辑模式
- 最近使用素材列表

---

## 4. 顶层结构

建议采用如下顶层结构：

```json
{
  "version": "1.0.0",
  "meta": {},
  "scene": {}
}
```

### 4.1 version
工程文件版本号，用于兼容升级。

### 4.2 meta
工程元信息。

### 4.3 scene
完整场景数据。

---

## 5. ProjectDocument 结构

```ts
type ProjectDocument = {
  version: string
  meta: ProjectMeta
  scene: SceneDocument
}
```

---

## 6. ProjectMeta 结构

```ts
type ProjectMeta = {
  id: string
  title: string
  description?: string
  createdAt: string
  updatedAt: string
}
```

### 字段说明
- `id`：工程唯一标识
- `title`：工程标题
- `description`：工程说明
- `createdAt`：创建时间
- `updatedAt`：最后更新时间

---

## 7. SceneDocument 结构

```ts
type SceneDocument = {
  version: string
  canvas: SceneCanvasConfig
  materials: string[]
  objects: SceneObject[]
  paths: MotionPath[]
  animations: AnimationClip[]
  globalDurationMs: number
}
```

### 字段说明
- `version`：场景数据版本
- `canvas`：画布配置
- `materials`：当前场景引用的素材 ID 列表
- `objects`：场景对象数组
- `paths`：路径数组
- `animations`：动画片段数组
- `globalDurationMs`：全局时长

---

## 8. SceneCanvasConfig

```ts
type SceneCanvasConfig = {
  width: number
  height: number
  backgroundColor?: string
}
```

### 第一阶段建议
最小字段：
- `width`
- `height`
- `backgroundColor` 可选

---

## 9. objects 存储规则

### 9.1 基本原则
- `objects` 使用数组存储
- 每个对象必须有稳定 `id`
- 对象顺序可直接按场景顺序或 `zIndex` 解释

### 9.2 推荐结构
对象至少应持久化以下字段：

```ts
type SceneObject = {
  id: string
  type: 'material' | 'label' | 'arrow' | 'path-helper'
  name: string
  materialId?: string | null
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
  style?: Record<string, unknown>
  stateKey?: string
  pathIds?: string[]
  animationIds: string[]
  data?: Record<string, unknown>
  meta?: Record<string, unknown>
}
```

### 9.3 说明
- `animationIds` 用于建立对象到动画片段的关联
- `pathIds` 用于建立对象到路径的关联
- `data` 用于容纳 label、arrow 等扩展对象字段

---

## 10. paths 存储规则

### 10.1 推荐结构

```ts
type MotionPath = {
  id: string
  name?: string
  kind: 'line' | 'polyline' | 'bezier'
  points: PathPoint[]
  pathData: string
  closed: boolean
  visible: boolean
  boundObjectIds?: string[]
  style?: {
    stroke?: string
    strokeWidth?: number
    dash?: number[]
  }
}
```

### 10.2 存储原则
- `points` 是编辑态核心
- `pathData` 是播放和导出时可直接使用的结果
- 两者都应持久化，便于调试与恢复

### 10.3 PathPoint 结构

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

---

## 11. animations 存储规则

### 11.1 推荐结构
`animations` 为数组，每个元素都是一个动画片段。

```ts
type AnimationClip = {
  id: string
  objectId: string
  type: string
  startTimeMs: number
  durationMs: number
  easing?: string
  enabled?: boolean
  payload: Record<string, unknown>
}
```

### 11.2 moveAlongPath 示例

```json
{
  "id": "anim_001",
  "objectId": "obj_003",
  "type": "moveAlongPath",
  "startTimeMs": 0,
  "durationMs": 2000,
  "easing": "linear",
  "enabled": true,
  "payload": {
    "pathId": "path_001",
    "followPathAngle": false,
    "speedMode": "duration"
  }
}
```

---

## 12. materials 字段存储规则

### 12.1 为什么需要 materials
虽然对象里已经有 `materialId`，但 `scene.materials` 仍然建议保留，因为它可表示：
- 当前工程引用到的素材集合
- 便于做资源检查
- 便于后续导出时收集依赖

### 12.2 第一阶段建议
- `materials` 存储当前场景中实际引用过的素材 ID 去重列表

---

## 13. 最小工程文件示例

```json
{
  "version": "1.0.0",
  "meta": {
    "id": "project_001",
    "title": "跨膜运输演示",
    "description": "第一版示例工程",
    "createdAt": "2026-04-05T12:00:00.000Z",
    "updatedAt": "2026-04-05T12:00:00.000Z"
  },
  "scene": {
    "version": "1.0.0",
    "canvas": {
      "width": 1280,
      "height": 720,
      "backgroundColor": "#ffffff"
    },
    "materials": ["membrane_001", "water_001"],
    "objects": [
      {
        "id": "obj_001",
        "type": "material",
        "name": "细胞膜",
        "materialId": "membrane_001",
        "x": 640,
        "y": 360,
        "width": 600,
        "height": 180,
        "rotation": 0,
        "scaleX": 1,
        "scaleY": 1,
        "opacity": 1,
        "visible": true,
        "zIndex": 1,
        "animationIds": []
      },
      {
        "id": "obj_002",
        "type": "material",
        "name": "水分子",
        "materialId": "water_001",
        "x": 300,
        "y": 360,
        "width": 36,
        "height": 36,
        "rotation": 0,
        "scaleX": 1,
        "scaleY": 1,
        "opacity": 1,
        "visible": true,
        "zIndex": 2,
        "pathIds": ["path_001"],
        "animationIds": ["anim_001"]
      }
    ],
    "paths": [
      {
        "id": "path_001",
        "kind": "polyline",
        "points": [
          { "x": 300, "y": 360 },
          { "x": 980, "y": 360 }
        ],
        "pathData": "M 300 360 L 980 360",
        "closed": false,
        "visible": true,
        "boundObjectIds": ["obj_002"]
      }
    ],
    "animations": [
      {
        "id": "anim_001",
        "objectId": "obj_002",
        "type": "moveAlongPath",
        "startTimeMs": 0,
        "durationMs": 2000,
        "easing": "linear",
        "enabled": true,
        "payload": {
          "pathId": "path_001",
          "followPathAngle": false,
          "speedMode": "duration"
        }
      }
    ],
    "globalDurationMs": 2000
  }
}
```

---

## 14. 保存时的字段校验建议

保存前至少做以下校验：

1. `version` 不可为空
2. `meta.id` 不可为空
3. `scene.canvas.width / height` 必须为正数
4. 所有对象 ID 唯一
5. 所有路径 ID 唯一
6. 所有动画 ID 唯一
7. `animation.objectId` 必须能找到对应对象
8. `moveAlongPath.payload.pathId` 必须能找到对应路径

---

## 15. 加载时的容错建议

加载工程时建议：

1. 缺失可选字段时使用默认值
2. 未识别字段忽略，但不阻断加载
3. 关键字段缺失时给出错误提示
4. 通过 `version` 进行升级兼容
5. 若对象引用了不存在的素材，应标记为异常对象，而不是直接崩溃

---

## 16. 第一阶段默认值建议

### SceneObject 默认值
- `rotation = 0`
- `scaleX = 1`
- `scaleY = 1`
- `opacity = 1`
- `visible = true`
- `zIndex = 0`
- `animationIds = []`

### MotionPath 默认值
- `closed = false`
- `visible = true`

### AnimationClip 默认值
- `startTimeMs = 0`
- `enabled = true`
- `easing = 'linear'`

---

## 17. 版本兼容策略

### 17.1 版本字段
建议保留：
- `ProjectDocument.version`
- `SceneDocument.version`

### 17.2 第一阶段版本
建议：
- `ProjectDocument.version = "1.0.0"`
- `SceneDocument.version = "1.0.0"`

### 17.3 后续升级方式
后续升级通过：
- `projectDeserializer`
- `sceneDeserializer`
进行兼容转换，而不是在 UI 组件里到处写兼容判断。

---

## 18. 实现建议

建议对应实现文件至少包括：

```text
src/domain/project/types.ts
src/domain/project/projectSerializer.ts
src/domain/project/projectDeserializer.ts
src/infrastructure/storage/localProjectStorage.ts
```

---

## 19. 与其他文档的关系

本文档主要定义“工程文件怎么保存”。

它依赖：
- 《BioDraw 数据模型设计 v1》

它服务于：
- 《BioDraw MVP 开发任务拆解 v1》
- 《BioDraw 导出方案设计 v1》
- 实际保存 / 加载代码实现

---

## 20. 结语

这份工程文件结构设计的目标，是为当前阶段建立一套**稳定、可读、可恢复、可扩展**的工程持久化基础。

后续所有保存 / 加载实现，都应尽量反复对照下面这句话：

**当前工程文件结构，是否真的在稳定承载 BioDraw 第一阶段主链路所需的数据？**

如果没有，就应及时收敛。
