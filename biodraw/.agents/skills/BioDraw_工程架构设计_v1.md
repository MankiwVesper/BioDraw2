# BioDraw 工程架构设计 v1

## 1. 文档目的

本文档用于在《BioDraw 详细设计方案（当前阶段整理稿）》基础上，进一步明确项目的工程结构、模块边界、数据分层、状态组织和第一阶段实现约束，使智能体或开发者能够据此开展相对稳定的编码工作。

本文档重点回答以下问题：

- 前端工程应如何分层
- 各核心模块应如何拆分
- 哪些部分属于 UI，哪些属于领域逻辑，哪些属于渲染逻辑
- 第一阶段项目目录如何组织
- 状态管理如何分层
- 哪些能力应在第一阶段先实现，哪些暂不进入架构主链路

---

## 2. 架构设计目标

工程架构设计应尽量满足以下目标：

1. **贴合产品主链路**
   - 素材 → 画布 → 动画 → 预览 → 保存 / 导出

2. **避免通用编辑器式过度抽象**
   - 不提前为了“未来可能支持任意绘图”而做过重设计

3. **让 UI、领域逻辑、渲染逻辑解耦**
   - React 组件不直接堆叠业务规则
   - Konva 渲染逻辑不污染产品数据结构

4. **便于智能体按模块分步开发**
   - 每个目录的职责尽量清楚
   - 类型、状态、交互、渲染各归其位

5. **为后续扩展保留合理空间**
   - 后续可扩展素材库、轨迹编辑器、时间系统、导出器
   - 但第一阶段不为未落地能力付出过高复杂度

---

## 3. 技术基线

第一阶段建议采用以下技术基线：

- **框架**：React
- **语言**：TypeScript
- **构建工具**：Vite
- **画布交互层**：react-konva / Konva
- **样式方案**：可先采用基础 CSS 或 CSS Modules；不强依赖复杂 UI 框架
- **状态管理**：第一阶段优先采用 React 本地状态 + Context + 领域 Store 封装
- **数据格式**：
  - 素材主格式：SVG
  - 轨迹格式：SVG Path
  - 工程文件：JSON
  - 导出成果：MP4（后续落地）

---

## 4. 总体分层

建议将整个前端工程划分为五层：

### 4.1 应用层（App Layer）
负责：
- 页面级布局
- 顶部工具栏
- 左中右区域装配
- 页面级路由（如果后续有多个页面）

### 4.2 功能层（Feature Layer）
负责：
- 素材库功能
- 画布编辑功能
- 动画设计功能
- 预览控制功能
- 工程管理功能

这一层体现“用户能操作什么”。

### 4.3 领域层（Domain Layer）
负责：
- 场景对象模型
- 素材模型
- 轨迹模型
- 动画动作模型
- 工程文件模型
- 领域服务与纯函数逻辑

这一层体现“系统内部数据如何表达”。

### 4.4 渲染层（Render Layer）
负责：
- 将 SceneObject 映射为 Konva 节点
- 将轨迹数据映射为可编辑和可预览图形
- 将播放时间映射为对象状态

这一层体现“数据如何变成画面”。

### 4.5 基础设施层（Infrastructure Layer）
负责：
- 素材加载
- 本地工程保存 / 读取
- 导出任务接口
- 日志、工具函数、ID 生成等

---

## 5. 第一阶段核心模块划分

第一阶段建议围绕以下核心模块组织工程：

1. **app**
2. **editor**
3. **materials**
4. **scene**
5. **animation**
6. **player**
7. **project**
8. **render**
9. **shared**

---

## 6. 推荐目录结构

建议第一阶段使用如下目录结构：

```text
src/
  app/
    App.tsx
    routes/
    providers/
    layout/

  pages/
    editor/

  features/
    editor-shell/
    toolbar/
    materials-panel/
    canvas-panel/
    inspector-panel/
    animation-panel/
    preview-controls/
    project-actions/

  domain/
    materials/
      types.ts
      materialCatalog.ts
      selectors.ts

    scene/
      types.ts
      sceneDocument.ts
      sceneObject.ts
      sceneMutations.ts
      sceneSelectors.ts

    paths/
      types.ts
      pathBuilder.ts
      pathGeometry.ts
      pathMutations.ts

    animation/
      types.ts
      animationClip.ts
      animationSelectors.ts
      animationMutations.ts

    player/
      types.ts
      playerEngine.ts
      playerSelectors.ts

    project/
      types.ts
      projectSerializer.ts
      projectDeserializer.ts

  render/
    canvas/
      CanvasRoot.tsx
      CanvasStage.tsx
      CanvasLayerManager.tsx

    objects/
      renderSceneObject.tsx
      renderers/
        SvgMaterialRenderer.tsx
        PathRenderer.tsx
        SelectionRenderer.tsx
        HandlesRenderer.tsx

    preview/
      previewFrame.ts
      sceneFrameResolver.ts

  infrastructure/
    storage/
      localProjectStorage.ts
    materials/
      svgLoader.ts
      materialManifestLoader.ts
    export/
      exportService.ts
    ids/
      createId.ts

  state/
    editor/
      EditorContext.tsx
      EditorStore.ts
      editorReducer.ts
      editorActions.ts
      editorSelectors.ts

  shared/
    types/
    utils/
    constants/
    hooks/

  styles/
```

---

## 7. 各目录职责说明

## 7.1 app
负责应用入口与顶层装配。

建议职责：
- 注册全局 Provider
- 组织整体布局
- 负责最外层页面框架

不建议放：
- 具体素材库逻辑
- 具体画布编辑逻辑
- 领域模型实现

---

## 7.2 pages
负责页面级组织。

第一阶段可以只有：
- `pages/editor/EditorPage.tsx`

职责：
- 组装整个编辑器页面
- 将工具栏、素材区、画布区、动画区等拼起来

---

## 7.3 features
负责“用户能操作的功能区”。

建议拆成下面这些功能组件：

### editor-shell
整体编辑器骨架。

### toolbar
顶部栏，负责：
- 新建
- 保存
- 导出
- 播放
- 暂停
- 重播

### materials-panel
左侧素材面板，负责：
- 分类展示
- 搜索
- 素材项列表
- 拖拽开始

### canvas-panel
中间画布区域，负责：
- 承载 Konva Stage
- 画布区域交互入口
- 画布缩放 / 平移（后续可扩展）

### inspector-panel
右侧属性区，第一阶段负责：
- 位置
- 尺寸
- 旋转
- 当前状态
- 基础动画信息

### animation-panel
右侧或下方动画区，第一阶段负责：
- 轨迹选择 / 编辑入口
- 时长设置
- 速度设置
- 动作列表展示

### preview-controls
播放控制条。

### project-actions
保存、加载、导入、导出等操作入口。

---

## 7.4 domain
这是项目最关键的一层。

职责：
- 定义核心业务类型
- 提供纯函数
- 提供不可依赖 React 的领域逻辑
- 为 state 与 render 提供稳定的数据结构

这一层应尽量：
- 无 UI 依赖
- 无 Konva 依赖
- 无浏览器 DOM 依赖

### domain/materials
负责：
- 素材定义
- 素材元数据
- 素材目录清单
- 素材分类选择器

### domain/scene
负责：
- 场景文档
- 场景对象
- 对象增删改
- 对象查询
- 对象排序

### domain/paths
负责：
- 路径点结构
- pathData 生成
- 路径几何计算
- 路径编辑变换

### domain/animation
负责：
- AnimationClip 定义
- 动画动作结构
- 动画片段的创建 / 修改 / 删除
- 动画查询逻辑

### domain/player
负责：
- 当前时间
- 播放状态
- 时间推进
- 根据时间解析对象状态

### domain/project
负责：
- 工程文件结构
- 场景文档与工程文件之间的序列化 / 反序列化

---

## 7.5 render
负责把领域数据映射为画面。

这是“领域层”和“Konva 层”之间的桥。

建议原则：
- render 层知道 Konva
- domain 层不知道 Konva

### render/canvas
负责：
- Stage / Layer 组织
- 画布级事件派发
- 空白点击、选中层、辅助层等

### render/objects
负责：
- 根据对象类型选择不同 renderer
- 将 SceneObject 转换成 Konva 节点

例如：
- SVG 素材对象渲染器
- 路径辅助线渲染器
- 选中框渲染器
- 控制点渲染器

### render/preview
负责：
- 某一时刻的场景帧解析
- 将播放器时间映射为渲染状态

---

## 7.6 infrastructure
负责与外部世界打交道。

第一阶段建议包含：

### storage
- 本地保存工程
- 从本地读取工程

### materials
- SVG 文件读取
- 素材 manifest 加载

### export
- 导出服务抽象
- 第一阶段先定义接口，不必一次做完全部实现

### ids
- ID 生成工具

---

## 7.7 state
负责应用级状态组织。

注意：
- 领域规则在 `domain`
- 状态容器在 `state`

第一阶段建议不要把所有逻辑都塞进 Context Provider 里，而是做一个相对清晰的 EditorStore。

建议职责：
- 当前工程
- 当前选中对象
- 当前选中轨迹
- 当前工具模式
- 当前播放状态
- 当前素材过滤条件

---

## 7.8 shared
放通用内容：

- 通用类型
- 常量
- 小型工具函数
- 通用 hooks

不建议把业务逻辑丢到这里，避免 shared 变成杂物堆。

---

## 8. 状态设计建议

第一阶段建议把状态分成四类：

### 8.1 持久状态
需要进入工程文件保存的状态，例如：
- 场景对象
- 路径
- 动画片段
- 工程元数据

### 8.2 编辑态状态
只在编辑器会话中存在，例如：
- 当前选中对象 ID
- 当前选中轨迹 ID
- 当前是否在轨迹编辑模式
- 当前缩放比例
- 当前悬停对象

### 8.3 播放态状态
例如：
- 是否播放中
- 当前播放时间
- 当前播放倍率

### 8.4 UI 状态
例如：
- 左侧素材面板是否展开
- 当前素材分类
- 搜索关键词
- 右侧面板 tab

---

## 9. 推荐的 EditorStore 结构

```ts
type EditorState = {
  project: ProjectDocument
  editor: {
    selectedObjectIds: string[]
    selectedPathId: string | null
    activeTool: 'select' | 'path-edit' | 'pan'
    isPathEditing: boolean
    zoom: number
    panX: number
    panY: number
  }
  player: {
    status: 'stopped' | 'playing' | 'paused'
    currentTimeMs: number
    speedRate: number
  }
  materials: {
    selectedCategory: string | null
    keyword: string
    favorites: string[]
    recentIds: string[]
  }
}
```

第一阶段建议：
- `selectedObjectIds` 先保留数组形式，尽管初期只支持单选
- 这样后续扩展多选时不必推翻数据结构

---

## 10. 模块依赖方向约束

必须尽量遵守以下依赖方向：

```text
app / pages / features
        ↓
      state
        ↓
     domain
        ↓
 infrastructure

render 同时依赖 domain 和 state
features 可依赖 state 和 render
domain 不可反向依赖 React / render / features
```

### 约束说明

- `domain` 不允许 import React 组件
- `domain` 不允许 import Konva
- `render` 不应包含产品规则的最终定义
- `features` 不应直接手写底层 pathData 算法
- `infrastructure` 不应定义业务模型的最终语义

---

## 11. 第一阶段对象类型建议

第一阶段对象类型不宜太多，建议先支持：

```ts
type SceneObjectType =
  | 'material'
  | 'label'
  | 'arrow'
  | 'path-helper'
```

更细的区分通过 `materialId` 和素材元数据完成。

### 说明

- `material`：来自素材库的主体对象
- `label`：文本标注
- `arrow`：教学箭头
- `path-helper`：编辑辅助对象，通常不进最终导出成果

---

## 12. 第一阶段渲染策略

建议采用以下渲染策略：

### 编辑态
- Konva 渲染真实对象
- 显示选中框
- 显示控制点
- 显示路径辅助线

### 预览态
- 使用同一套场景对象
- 隐藏编辑辅助层
- 根据播放器当前时间解析对象状态
- 只渲染最终可见元素

### 约束
第一阶段不要分裂成两套完全独立的渲染系统。  
应尽量让“编辑态”和“预览态”共享同一套场景数据与大部分 renderer，只是在渲染参数上有区分。

---

## 13. 第一阶段工程文件与内存模型关系

建议区分：

### 工程文件（磁盘 / JSON）
用于保存和加载，强调可序列化。

### 运行时模型（内存）
用于编辑和播放，可能包含一些缓存字段、索引字段。

建议关系：
- 领域层定义标准工程结构
- state 中可持有工程结构本身
- render 层需要的派生数据通过 selector 计算，不直接污染工程文件

---

## 14. 第一阶段开发顺序建议

建议按下面顺序推进，而不是并行散做。

### M1：基础骨架
目标：
- 建立项目目录
- 建立类型文件骨架
- 建立 EditorPage 三栏布局
- 建立空的 EditorStore

验收：
- 编辑器页面结构正常显示
- 左中右三区域存在
- 顶部工具栏存在

### M2：素材库 MVP
目标：
- 定义 MaterialItem
- 实现素材 manifest
- 左侧分类展示
- 支持拖拽素材进入画布

验收：
- 能从素材面板拖一个素材进入画布
- 进入后生成一个 SceneObject

### M3：画布对象编辑 MVP
目标：
- 对象选中
- 对象拖拽
- 基础属性展示
- 坐标微调

验收：
- 对象拖动与输入框修改都能改变位置
- 选中状态可视化正常

### M4：轨迹编辑 MVP
目标：
- 创建路径
- 编辑锚点
- 生成 pathData
- 将路径绑定到对象动作

验收：
- 至少支持一条对象路径并可见
- 拖动锚点后路径形状更新

### M5：播放预览 MVP
目标：
- 播放 / 暂停 / 停止
- 按当前时间计算对象沿路径位置
- 预览时隐藏编辑辅助元素

验收：
- 对象可以沿绑定路径运动
- 播放控制有效

### M6：工程保存 MVP
目标：
- 当前工程导出为 JSON
- 支持重新导入恢复

验收：
- 保存后再次加载，场景、路径、动画基本恢复

### M7：导出架构预留
目标：
- 定义导出服务接口
- 明确输入与输出边界
- 暂不必一次实现最终 MP4

验收：
- 导出服务接口已可被调用
- 导出上下文模型已明确

---

## 15. 第一阶段暂不进入主架构的内容

以下内容不应在第一阶段占据主架构核心：

- 复杂多轨时间线编辑器
- 多人协作
- 云端项目同步
- 自定义素材绘制器
- 高级模板系统
- 大量滤镜和复杂特效
- 复杂撤销重做系统
- 多页面 / 多场景工程
- 多选编组和复杂对齐分布工具

这些后续可以扩展，但第一阶段不应因此把当前架构设计得过重。

---

## 16. 对智能体编码最重要的执行原则

如果后续由智能体参与编码，应遵循以下原则：

1. **先补类型，再写组件**
2. **先做最小链路，再做扩展能力**
3. **先保证模块职责清楚，再追求复用**
4. **领域逻辑优先写成纯函数**
5. **不要把路径算法、动画逻辑直接写死在 React 组件里**
6. **不要让 Konva 事件处理直接修改杂乱无章的局部状态**
7. **所有核心数据结构先落在 `domain` 里，再向 UI 暴露**

---

## 17. 本文档与其他文档的关系

本文档是“总纲文档”与“编码任务文档”之间的桥梁。

它上接：
- 《BioDraw 详细设计方案（当前阶段整理稿）》

它下接：
- 《数据模型设计 v1》
- 《主界面交互说明 v1》
- 《MVP 开发任务拆解 v1》
- 《导出方案设计 v1》

也就是说：

- 总纲文档回答“做什么”
- 本文档回答“工程上怎么组织”
- 后续任务文档回答“先做哪一块、怎么验收”

---

## 18. 结语

这份工程架构设计的目标，不是提前把未来几年所有可能都设计进去，而是为当前阶段建立一套**足够稳、足够清晰、足够贴近产品主链路**的开发骨架。

后续所有工程实现，都应尽量反复对照下面这句话：

**当前代码结构，是否真的在帮助项目更快实现“素材 → 画布 → 动画 → 预览 → 导出”这条主链路？**

如果没有，就应及时收敛。
