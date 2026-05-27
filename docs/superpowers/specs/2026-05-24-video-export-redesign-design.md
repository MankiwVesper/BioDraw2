# BioDraw 视频导出重设计

- **日期**：2026-05-24
- **作者**：Mankiw + Claude
- **状态**：草案 → 待用户审

## 1. 背景与目标

### 1.1 现状问题

当前视频导出基于 `canvas.captureStream(fps) + MediaRecorder` 实现，存在以下问题：

- **时长不准确**：MediaRecorder 按物理时间录制，渲染速度跟不上 stepMs 时视频会被拉长。实测 60 fps / 10 秒设置导出得到 22 秒视频。
- **尾部丢失**：MP4 容器停止时丢失约 1 秒未完结 GOP。已尝试 tailHold 补偿，但因 `captureStream` 在 canvas 不重绘时不产帧而无效。
- **帧率失真**：实际帧率 = 总帧数 / 物理录制时长，与设置值偏差大。

### 1.2 目标

> 将用户精心设计的动画完整、准确地导出。视频清晰流畅、不卡顿。

具体可验证目标：
- 视频时长 = 设置范围（±50ms 容差）
- 帧率 = 设置 fps（不取决于场景复杂度）
- 支持 12 / 24 / 30 / 60 fps
- 支持 MP4 与 WebM 两种容器
- 单帧 PNG 与序列帧 ZIP 导出**不受影响**

### 1.3 非目标

- 不改 ToolbarPanel UI 布局
- 不改 store 中 videoExport state/actions 的对外接口
- 不动单帧 PNG / 序列帧 ZIP 导出逻辑
- 不修复其它已知 P1/P2 问题（如自定义画布底色未生效、stateChange clip 被过滤等），由后续任务处理

## 2. 技术方案

### 2.1 核心思路

放弃 MediaRecorder 物理时间录制，改用 **WebCodecs `VideoEncoder` + mp4-muxer/webm-muxer** 离线编码：

- 每帧手动设置 PTS（`timestamp = frameIndex × 1e6 / fps` 微秒）
- 编码与物理时间完全解耦
- 渲染慢 → 导出耗时长，但产出视频的时长、帧率严格准确

### 2.2 浏览器与依赖

- 目标浏览器：现代 Chrome / Edge（用户已确认）
- 新增依赖：
  - `mp4-muxer` ^5.x（约 30 KB）
  - `webm-muxer` ^5.x（约 30 KB）
  - 同一作者 Vannevar Labs，MIT 协议

## 3. 架构与模块

### 3.1 分层

按项目既有 5 层约定（app / state / domain / infrastructure / render）：

```
biodraw/src/infrastructure/video-encoder/   ← 新增（纯 TS、无 React/Konva）
├── VideoExportEncoder.ts
├── encoderConfig.ts
└── index.ts

biodraw/src/features/canvas-panel/
├── useVideoExport.ts                       ← 新增（React/Konva 桥）
└── CanvasPanel.tsx                         ← 改（删旧 useEffect，调 hook）
```

### 3.2 VideoExportEncoder（infrastructure）

```ts
interface EncoderOptions {
  width: number;
  height: number;
  fps: number;
  format: 'mp4' | 'webm';
  bitrate?: number;
}

interface EncoderResolution {
  format: 'mp4' | 'webm';
  codec: string;
  extension: 'mp4' | 'webm';
}

class VideoExportEncoder {
  static async resolveSupported(opts: EncoderOptions): Promise<EncoderResolution | null>;
  constructor(opts: EncoderOptions, resolution: EncoderResolution);
  async encodeFrame(source: CanvasImageSource, frameIndex: number): Promise<void>;
  async finalize(): Promise<Blob>;
  cancel(): void;
  readonly resolution: EncoderResolution;
}
```

- 不依赖 React、Konva、DOM 之外的浏览器 API
- 内部维护 `VideoEncoder` 与对应 `Muxer` 实例
- `encodeFrame` 内部处理 backpressure（队列 > 8 时让出）
- 关键帧间隔 = `fps`（即每秒一个 IDR）

### 3.3 encoderConfig（infrastructure）

```ts
function getDefaultBitrate(width: number, height: number, fps: number): number;
function getCodecCandidates(format: 'mp4' | 'webm'): Array<{ format; codec; extension }>;
```

- bitrate 按分辨率 × fps 线性估算（1080p30 ≈ 8 Mbps，720p30 ≈ 4 Mbps）
- codec 候选表硬编码 H.264 / VP9 / VP8 优先级

### 3.4 useVideoExport（feature）

封装现 useEffect 中所有 React/Konva 相关逻辑：

- 监听 `videoExportRequestId`、`exportCancelCount`
- 暂停 / 等图 / fit / 保存 stage 原状
- 主循环：`flushSync(setCurrentTimeMs) → stage.draw() → captureCanvasContent → encoder.encodeFrame`
- 进度上报 / 取消响应 / 错误处理 / 资源清理 / 触发下载 / 恢复 stage

签名：

```ts
function useVideoExport(params: {
  stageRef: React.RefObject<Konva.Stage>;
  fitCanvasRef: React.MutableRefObject<() => void>;
  canvasWidthRef: React.MutableRefObject<number>;
  canvasHeightRef: React.MutableRefObject<number>;
  objectsSnapRef: React.MutableRefObject<SceneObject[]>;
  commitTextChangeRef: React.MutableRefObject<() => void>;
}): void;
```

## 4. 数据流

### 4.1 触发链（不变）

```
ToolbarPanel.triggerVideoExport
  → store.requestVideoExport(opts)   // videoExportRequestId++
  → useVideoExport useEffect 触发
```

### 4.2 主流程

```
[0] 前置（与现有逻辑相同）
    - 若有正在编辑文本，commitTextChange
    - waitForMaterialImages(objects)
    - 保存 stageScale / stagePos / currentTimeMs / wasPlaying
    - pausePlayback / fitCanvas
    - setVideoExportStatus('running', '0/N (0%)')

[1] 编码器初始化
    resolution = await VideoExportEncoder.resolveSupported(opts)
    if (!resolution) → setVideoExportStatus('error', ...) → return
    encoder = new VideoExportEncoder(opts, resolution)

[2] 主循环（无 sleep、无 rAF 节流）
    for frameIndex in [0, totalFrames):
      if (cancelled) → encoder.cancel() → return
      timeMs = clamp(startMs + frameIndex * stepMs, 0, endMs)

      flushSync(() => setCurrentTimeMs(timeMs))   // React 同步 commit
      stage.draw()                                 // Konva 同步重绘
      frameCanvas = captureCanvasContent(stage, cvW, cvH, width)
      await encoder.encodeFrame(frameCanvas, frameIndex)
      setVideoExportStatus('running', formatExportProgress(frameIndex+1, totalFrames))

      if ((frameIndex+1) % 8 === 0)
        await new Promise(r => requestAnimationFrame(r))   // 让 UI 响应取消

[3] 收尾
    videoBlob = await encoder.finalize()
    if (cancelled) return
    triggerDownload(videoBlob, `${prefix}_${stamp}.${ext}`)
    setVideoExportStatus('done', `${totalFrames} 帧`)
    若 resolution.format !== opts.format，状态消息加降级提示

[4] 恢复（finally 块）
    setCurrentTimeMs(originalTimeMs)
    setStageScale(originalScale) / setStagePos(originalPos)
    if (wasPlaying) playPlayback()
    （异常路径）encoder.cancel()
```

### 4.3 单帧 PTS 计算

```ts
const timestampUs = Math.round(frameIndex * 1_000_000 / fps);
new VideoFrame(canvas, { timestamp: timestampUs });
```

### 4.4 关键设计点对比

| 维度 | 现有方案 | 新方案 |
|---|---|---|
| 渲染等待 | `waitForNextPaint` 双 rAF ≈ 33ms | `flushSync` + `stage.draw()` 同步 ~1ms |
| 节流 | `setTimeout` 到 `loopStart + N × stepMs` | 无节流，按计算速度跑 |
| 时长来源 | 物理时间（recorder.start → stop 真实经过） | PTS 手动指定，与物理时间无关 |
| 尾部补偿 | tailHold 重绘最后一帧 | 不需要 |
| 内存 | 单帧 canvas 复用 | VideoFrame `.close()` 立即释放显存 |
| 主线程让出 | 隐式（每 rAF） | 每 8 帧显式 `await rAF` |

## 5. 错误处理 / 取消 / 降级

### 5.1 错误处理矩阵

| 错误类型 | 触发时机 | 处理 | 用户感知 |
|---|---|---|---|
| WebCodecs 不可用 | 启动前 `typeof VideoEncoder === 'undefined'` | 直接报错 return | `error: 当前浏览器不支持 WebCodecs` |
| codec 不支持 | `resolveSupported` 全部候选失败 | 报错 return | `error: 未找到可用的视频编码格式` |
| `VideoEncoder.onerror` | 编码过程中 | 终止 + cleanup | `error: 视频编码失败：${msg}` |
| 用户取消 | exportCancelCount 增加 | encoder.cancel + return | 状态恢复 `idle` |
| 渲染 / 采样异常 | captureCanvasContent 抛错 | try/catch + cleanup | `error: ${msg}` |
| muxer.finalize 失败 | 收尾阶段 | encoder.cancel | `error: ${msg}` |

### 5.2 Format 降级表

```
请求       → 尝试顺序
mp4        → mp4 (H.264 avc1.42E01E) → webm (VP9) → webm (VP8) → 失败
webm       → webm (VP9) → webm (VP8) → mp4 (H.264) → 失败
```

若实际格式 ≠ 用户请求，状态消息追加 `已导出 ${ext.toUpperCase()}（浏览器不支持 ${requested.toUpperCase()}）`。

### 5.3 取消语义

```
useEditorStore.cancelExport()       // exportCancelCount++
  → exportCancelCountRef 持续同步
  → 主循环每帧检测、编码后检测
  → encoder.cancel(): videoEncoder.close() + 释放未关闭的 VideoFrame
  → 不调用 muxer.finalize，不下载
```

### 5.4 资源 cleanup 责任

- 正常完成：`finalize` → Blob → 下载 → encoder 自然释放
- 取消：`encoder.cancel()` + 跳过下载
- 异常：try / catch 在 hook 层 → finally 统一 `encoder.cancel()`
- **组件卸载**：useEffect 返回 cleanup 函数 → `cancelExport()`（**新增**，现有代码缺失）

### 5.5 Backpressure

```ts
async encodeFrame(source, frameIndex) {
  while (this.encoder.encodeQueueSize > 8) {
    await new Promise(r => setTimeout(r, 0));
  }
  const frame = new VideoFrame(source, { timestamp: frameIndex * 1_000_000 / this.fps });
  this.encoder.encode(frame, { keyFrame: frameIndex % this.fps === 0 });
  frame.close();
}
```

### 5.6 状态机

`videoExportStatus: 'idle' | 'running' | 'done' | 'error'` 完全保持现有四态，store actions 签名不变。

## 6. 改动边界（外科手术式约束）

### 6.1 新增文件

```
biodraw/src/infrastructure/video-encoder/VideoExportEncoder.ts   ≈ 150 行
biodraw/src/infrastructure/video-encoder/encoderConfig.ts        ≈  50 行
biodraw/src/infrastructure/video-encoder/index.ts                ≈   5 行
biodraw/src/features/canvas-panel/useVideoExport.ts              ≈ 130 行
```

### 6.2 修改文件

- `biodraw/src/features/canvas-panel/CanvasPanel.tsx`
  - 删除：以 `if (videoExportRequestId <= 0) return;` 开头的整段视频导出 useEffect（约 190 行）
  - 删除该 useEffect 中读取且仅它使用的 store hook（如 `videoExportRequestId`、`videoExportOptions`、`setVideoExportStatus` 等若 hook 内自取则同时删除）
  - 新增约 10 行：`useVideoExport(...)` 调用
  - 净变化：≈ -180 行
- `biodraw/package.json`
  - 新增依赖 `mp4-muxer` ^5、`webm-muxer` ^5

### 6.3 不动文件

所有其他文件：state / types / engine / 其它 panel / 所有样式文件 / 所有现有 helper。

### 6.4 不动代码（即使在 CanvasPanel.tsx 中）

- `waitForNextPaint`（仍被序列帧 / 单帧 / 素材等待使用）
- `captureCanvasContent`（公用）
- `drawCanvasContentToExportCanvas`（序列帧使用）
- 序列帧导出 useEffect（478 ~ 595）
- 单帧 PNG 导出（597 ~ 626）

## 7. 验证矩阵

项目无测试运行器，按下表手动验证：

| # | fps | 时长 | 范围 | 场景 | 关注点 |
|---|---|---|---|---|---|
| 1 | 24 | 10s | 0~10s | 简单（2 元素） | 文件时长 = 10.0±0.05s，帧率 = 24 |
| 2 | 30 | 4s | 4~8s | 简单 | 时长 = 4.0s，起止画面与预览一致 |
| 3 | 60 | 10s | 0~10s | 简单 | **核心回归**：文件时长 = 10.0s |
| 4 | 24 | 10s | 0~10s | 复杂（≥20 元素 + 路径 + fade） | 时长准确、画面无错位 |
| 5 | 12 | 1s | 0~1s | 简单 | 低 fps 边界 |
| 6 | 60 | 30s | 0~30s | 中等 | 长视频内存稳定 |
| 7 | 24 | 10s | 0~10s | 简单 | **取消**：50% 时关闭，状态 idle，无下载 |
| 8 | 24 | 10s | 0~10s | 简单 | **WebM 格式**，文件能播 |
| 9 | 24 | 10s | 0~10s | 含素材图 | 素材图正常显示 |

**验证工具**：PotPlayer 查时长 / 帧率；`ffprobe -v error -show_entries stream=duration,r_frame_rate file.mp4` 精确数据。

## 8. 实施顺序

1. 装依赖：`npm install mp4-muxer webm-muxer`
2. 新建 `infrastructure/video-encoder/encoderConfig.ts`
3. 新建 `infrastructure/video-encoder/VideoExportEncoder.ts`
4. 新建 `features/canvas-panel/useVideoExport.ts`
5. 改 `CanvasPanel.tsx`：删旧 useEffect、调 hook
6. `npx tsc -b --noEmit`、`npm run lint` 通过
7. 按验证矩阵手动测试
8. 测试通过后提交

## 9. 风险与回退

- **风险 1：WebCodecs 在某些 Chrome 版本上行为差异** → 通过 `isConfigSupported` 兜底，无候选可用时返回 `error`
- **风险 2：长视频内存压力** → backpressure 等待队列 < 8；每 8 帧让一次 rAF
- **风险 3：flushSync 在大场景下变慢** → 渲染慢只影响导出耗时，不影响视频质量；可作为后续优化项

**回退**：保留旧实现的 git 历史，必要时通过 `git revert` 回退。
