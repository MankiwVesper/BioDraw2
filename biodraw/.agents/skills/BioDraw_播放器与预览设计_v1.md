# BioDraw 播放器与预览设计 v1

## 1. 文档目的

本文档用于明确 BioDraw 第一阶段播放器状态机、预览模式行为和播放控制逻辑，为对象动画播放、暂停、停止、预览态渲染和后续导出链路提供统一设计依据。

---

## 2. 设计目标

第一阶段播放器的目标是：

- 能驱动对象沿路径运动
- 支持播放、暂停、停止
- 区分编辑态与预览态
- 为后续导出逐帧渲染提供基础

---

## 3. 第一阶段支持范围

### 支持
- stopped / playing / paused 三态
- 当前时间推进
- 播放倍率基础支持
- 根据时间解析对象位置
- 预览态隐藏编辑辅助层

### 暂不支持或弱化支持
- 拖动时间头
- 多轨时间线界面
- 逐帧 stepping UI
- 复杂时间区间选择
- 高级缓动曲线编辑器
- 多动画复杂冲突裁决器

---

## 4. 播放器状态模型

```ts
type PlayerState = {
  status: 'stopped' | 'playing' | 'paused'
  currentTimeMs: number
  speedRate: number
}
```

### 字段说明
- `status`：播放器状态
- `currentTimeMs`：当前时间
- `speedRate`：倍率，第一阶段建议默认为 `1`

---

## 5. 状态机设计

### 5.1 stopped
含义：
- 未播放
- 当前时间应为 0 或被认为从头开始

可转移到：
- `playing`

### 5.2 playing
含义：
- 正在播放
- 当前时间持续推进

可转移到：
- `paused`
- `stopped`

### 5.3 paused
含义：
- 已暂停
- 当前时间被冻结

可转移到：
- `playing`
- `stopped`

---

## 6. 播放控制规则

## 6.1 播放
点击播放后：

- 若当前为 `stopped`，则：
  - `currentTimeMs = 0`
  - `status = playing`

- 若当前为 `paused`，则：
  - 从当前时间继续
  - `status = playing`

## 6.2 暂停
点击暂停后：

- `status = paused`
- `currentTimeMs` 保持不变

## 6.3 停止
点击停止后：

- `status = stopped`
- `currentTimeMs = 0`

对象应回到初始状态。

---

## 7. 时间推进规则

### 7.1 基本思路
播放中由时间引擎持续推进 `currentTimeMs`。

### 7.2 第一阶段建议
可使用 `requestAnimationFrame` 驱动时间推进。

### 7.3 推进公式
每帧：
- 计算距离上一次时间戳的 delta
- `currentTimeMs += delta * speedRate`

### 7.4 终点处理
若 `currentTimeMs >= globalDurationMs`：
- 第一阶段建议自动进入 `stopped`
- 并回到 0 或停在尾帧，二者选一

### 建议
第一阶段建议：
- 到尾帧后自动 `stopped`
- 回到初始状态

这样实现最简单、行为也最稳定。

---

## 8. 场景帧解析规则

播放器本身不直接操作 Konva 节点。  
建议通过“场景帧解析器”做中间层：

输入：
- `SceneDocument`
- `currentTimeMs`

输出：
- 当前时刻各对象应呈现的状态

---

## 9. moveAlongPath 的解析规则

### 9.1 输入
- `AnimationClip`
- `MotionPath`
- `currentTimeMs`

### 9.2 过程
1. 计算动画在当前时刻是否生效
2. 若未到开始时间：
   - 返回对象初始位置
3. 若已超过结束时间：
   - 返回路径终点（或按 stop 策略处理）
4. 若处于中间过程：
   - 计算 progress = elapsed / duration
   - 沿路径求点

### 9.3 输出
- 当前 `x / y`
- 若启用 `followPathAngle`，输出当前角度

---

## 10. 编辑态与预览态的区别

## 10.1 编辑态显示内容
- 对象
- 选中框
- 路径辅助线
- 锚点
- 控制柄
- 其他编辑辅助元素

## 10.2 预览态显示内容
- 对象
- 动画结果
- 不显示编辑辅助元素

## 10.3 第一阶段建议
编辑态与预览态共用同一套场景和大部分 renderer，  
只是在显示参数上区分：
- 是否渲染辅助层
- 是否使用当前播放时间解析对象状态

---

## 11. 预览模式切换建议

### 第一阶段建议
不单独做“进入预览页面”，而是：
- 直接在当前画布内切换为预览态显示

### 行为
- 点击播放：自动进入预览态
- 点击停止：回到编辑态
- 点击暂停：保持预览态但冻结

---

## 12. 播放中编辑限制

第一阶段建议播放中限制以下行为：

- 不允许拖动对象
- 不允许编辑路径点
- 不允许修改对象属性
- 不允许进入路径创建模式

原因：
- 大幅降低状态冲突复杂度
- 保持播放逻辑简单稳定

---

## 13. 验收标准

播放器与预览系统视为完成，至少要满足：

1. 点击播放后对象能沿路径运动
2. 点击暂停后对象停在当前帧
3. 点击停止后对象回到初始状态
4. 播放时不显示路径锚点和控制柄
5. 预览态与编辑态切换明确
6. 播放逻辑不依赖直接修改杂乱 UI 状态

---

## 14. 建议实现文件

```text
src/domain/player/types.ts
src/domain/player/playerEngine.ts
src/render/preview/sceneFrameResolver.ts
src/features/preview-controls/
src/state/editor/editorReducer.ts
```

---

## 15. 结语

这份播放器与预览设计文档的目标，是为当前阶段建立一套**简单、稳定、能服务主链路**的播放基线。

后续所有播放器实现，都应尽量反复对照下面这句话：

**当前播放器逻辑，是否真的在稳定支撑 BioDraw 第一阶段“设路径—看动画”的核心体验？**

如果没有，就应及时收敛。
