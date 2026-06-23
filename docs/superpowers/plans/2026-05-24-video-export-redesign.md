# 视频导出重设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 WebCodecs + mp4-muxer/webm-muxer 替换 MediaRecorder + captureStream，让视频时长/帧率精确匹配用户设置。

**Architecture:** 新增 `infrastructure/video-encoder/`（纯 TS，无 React/Konva 依赖）+ `features/canvas-panel/useVideoExport.ts`（React/Konva 桥）；删除 `CanvasPanel.tsx` 中的旧视频导出 useEffect（约 200 行）。其他导出路径（单帧 PNG / 序列帧 ZIP）和所有共享 helper 完全不动。

**Tech Stack:** TypeScript 5.9, React 19, react-konva 19, Konva 10, Zustand+Immer, WebCodecs API, mp4-muxer ^5, webm-muxer ^5

**Project Conventions:**
- 工作目录: `D:\Project\BioDraw2`，前端子项目: `D:\Project\BioDraw2\app`
- 无测试运行器（CLAUDE.md 明确）。本计划以 `npx tsc -b --noEmit` + `npm run lint` + 手动验证矩阵代替 TDD
- Windows / PowerShell 环境；Bash 仅用于 `git` 等命令（路径分隔符无冲突）
- 每个 Task 结束 → 一个新 commit

**Spec 参考:** `docs/superpowers/specs/2026-05-24-video-export-redesign-design.md`

**API 兼容说明:** mp4-muxer 与 webm-muxer 均为 vanilagy 出品（MIT）。本 plan 基于 v5.x ESM-only API。若实施时 npm 上版本 API 有微调，以 `node_modules/mp4-muxer/README.md` 为准。

---

## Task 1：安装依赖

**Files:**
- Modify: `D:\Project\BioDraw2\app\package.json`
- Modify: `D:\Project\BioDraw2\app\package-lock.json`

- [ ] **Step 1.1：确认当前依赖状态**

Run (PowerShell):
```powershell
Get-Content D:\Project\BioDraw2\app\package.json | Select-String "mp4-muxer|webm-muxer"
```
Expected: 无输出（两个包都未安装）

- [ ] **Step 1.2：安装两个 muxer**

Run (PowerShell，必须在 `D:\Project\BioDraw2\app` 目录下执行):
```powershell
Set-Location D:\Project\BioDraw2\app
npm install mp4-muxer webm-muxer
```
Expected: 退出码 0，`package.json` 的 dependencies 多出两条 `mp4-muxer` 与 `webm-muxer`，`package-lock.json` 也相应更新。

- [ ] **Step 1.3：验证依赖能解析、build 通过**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
npm run build
```
Expected: 退出码 0（说明 tsc + vite build 都过）

- [ ] **Step 1.4：commit**

Run (Bash):
```bash
git -C D:/Project/BioDraw2 add app/package.json app/package-lock.json
git -C D:/Project/BioDraw2 commit -m "$(cat <<'EOF'
新增依赖 mp4-muxer / webm-muxer

为视频导出重设计准备：用 WebCodecs + Muxer 替换 MediaRecorder。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：编码配置模块 `encoderConfig.ts`

**Files:**
- Create: `D:\Project\BioDraw2\app\src\infrastructure\video-encoder\encoderConfig.ts`

- [ ] **Step 2.1：创建目录并写入完整文件**

Write to `D:\Project\BioDraw2\app\src\infrastructure\video-encoder\encoderConfig.ts`:

```ts
// 视频编码参数决策模块：bitrate 估算 + codec 候选优先级。
// 不依赖 React/Konva/DOM 之外的浏览器 API。

export type VideoFormat = 'mp4' | 'webm';

export interface CodecCandidate {
  format: VideoFormat;
  /** WebCodecs codec string，如 'avc1.42E01E' / 'vp09.00.10.08' / 'vp8' */
  codec: string;
  /** mp4-muxer / webm-muxer 内部使用的 codec 标识 */
  muxerCodec: 'avc' | 'vp9' | 'vp8';
  extension: 'mp4' | 'webm';
}

/**
 * 按分辨率 × fps 线性估算 bitrate。
 * 参考 YouTube 推荐：1080p30 ≈ 8 Mbps，720p30 ≈ 5 Mbps，480p30 ≈ 2.5 Mbps。
 * 取每像素每秒 0.1 bit 为基线。
 */
export const getDefaultBitrate = (width: number, height: number, fps: number): number => {
  const pixelsPerSecond = width * height * fps;
  const bitsPerPixel = 0.1;
  const raw = Math.round(pixelsPerSecond * bitsPerPixel);
  return Math.max(1_000_000, Math.min(20_000_000, raw));
};

/**
 * 返回按优先级排列的 codec 候选表。
 * 首选用户指定 format，其次降级到另一格式以最大化兼容性。
 */
export const getCodecCandidates = (preferred: VideoFormat): CodecCandidate[] => {
  const mp4Candidates: CodecCandidate[] = [
    { format: 'mp4', codec: 'avc1.42E01E', muxerCodec: 'avc', extension: 'mp4' },
  ];
  const webmCandidates: CodecCandidate[] = [
    { format: 'webm', codec: 'vp09.00.10.08', muxerCodec: 'vp9', extension: 'webm' },
    { format: 'webm', codec: 'vp8', muxerCodec: 'vp8', extension: 'webm' },
  ];
  return preferred === 'mp4'
    ? [...mp4Candidates, ...webmCandidates]
    : [...webmCandidates, ...mp4Candidates];
};
```

- [ ] **Step 2.2：类型检查**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
npx tsc -b --noEmit
```
Expected: 退出码 0，无错误输出。

- [ ] **Step 2.3：commit**

```bash
git -C D:/Project/BioDraw2 add app/src/infrastructure/video-encoder/encoderConfig.ts
git -C D:/Project/BioDraw2 commit -m "$(cat <<'EOF'
新增视频编码配置模块

提供 bitrate 估算与 codec 候选优先级（mp4→webm 降级链）。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3：核心编码器 `VideoExportEncoder.ts`

**Files:**
- Create: `D:\Project\BioDraw2\app\src\infrastructure\video-encoder\VideoExportEncoder.ts`

- [ ] **Step 3.1：写入完整文件**

Write to `D:\Project\BioDraw2\app\src\infrastructure\video-encoder\VideoExportEncoder.ts`:

```ts
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { getCodecCandidates, getDefaultBitrate } from './encoderConfig';
import type { CodecCandidate, VideoFormat } from './encoderConfig';

export interface EncoderOptions {
  width: number;
  height: number;
  fps: number;
  format: VideoFormat;
  bitrate?: number;
}

export interface EncoderResolution {
  format: VideoFormat;
  codec: string;
  extension: 'mp4' | 'webm';
  /** 用户请求与实际是否一致；不一致时调用方应展示降级提示 */
  isDowngraded: boolean;
}

const BACKPRESSURE_LIMIT = 8;

type AnyMuxer =
  | { kind: 'mp4'; muxer: Mp4Muxer<Mp4Target>; target: Mp4Target }
  | { kind: 'webm'; muxer: WebmMuxer<WebmTarget>; target: WebmTarget };

/**
 * 用 WebCodecs VideoEncoder + (mp4|webm)-muxer 离线编码动画帧。
 * - 每帧的 PTS 由 frameIndex 决定，与物理时间无关
 * - 调用者负责按顺序喂帧，并在结束后 await finalize
 * - 任何错误路径下都应调用 cancel() 释放资源
 */
export class VideoExportEncoder {
  private encoder: VideoEncoder;
  private muxer: AnyMuxer;
  private readonly fps: number;
  private readonly keyFrameInterval: number;
  private error: Error | null = null;
  private closed = false;

  static async resolveSupported(opts: EncoderOptions): Promise<EncoderResolution | null> {
    if (typeof VideoEncoder === 'undefined') return null;
    const bitrate = opts.bitrate ?? getDefaultBitrate(opts.width, opts.height, opts.fps);
    const candidates = getCodecCandidates(opts.format);
    for (const c of candidates) {
      try {
        const check = await VideoEncoder.isConfigSupported({
          codec: c.codec,
          width: opts.width,
          height: opts.height,
          bitrate,
          framerate: opts.fps,
        });
        if (check.supported) {
          return {
            format: c.format,
            codec: c.codec,
            extension: c.extension,
            isDowngraded: c.format !== opts.format,
          };
        }
      } catch {
        // 某些浏览器对非法 codec 抛错而不是返回 supported:false，忽略并尝试下一个
      }
    }
    return null;
  }

  constructor(opts: EncoderOptions, resolution: EncoderResolution) {
    this.fps = opts.fps;
    this.keyFrameInterval = Math.max(1, opts.fps); // 每秒一个 IDR
    const bitrate = opts.bitrate ?? getDefaultBitrate(opts.width, opts.height, opts.fps);

    const candidate = getCodecCandidates(resolution.format).find(
      (c) => c.codec === resolution.codec,
    ) as CodecCandidate;

    this.muxer = this.createMuxer(candidate, opts.width, opts.height);

    this.encoder = new VideoEncoder({
      output: (chunk, meta) => this.handleChunk(chunk, meta),
      error: (e) => {
        this.error = e instanceof Error ? e : new Error(String(e));
      },
    });

    this.encoder.configure({
      codec: resolution.codec,
      width: opts.width,
      height: opts.height,
      bitrate,
      framerate: opts.fps,
    });
  }

  private createMuxer(c: CodecCandidate, width: number, height: number): AnyMuxer {
    if (c.format === 'mp4') {
      const target = new Mp4Target();
      const muxer = new Mp4Muxer({
        target,
        video: { codec: c.muxerCodec as 'avc', width, height },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });
      return { kind: 'mp4', muxer, target };
    }
    const target = new WebmTarget();
    const muxer = new WebmMuxer({
      target,
      video: { codec: c.muxerCodec === 'vp9' ? 'V_VP9' : 'V_VP8', width, height },
      firstTimestampBehavior: 'offset',
    });
    return { kind: 'webm', muxer, target };
  }

  private handleChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) {
    if (this.muxer.kind === 'mp4') {
      this.muxer.muxer.addVideoChunk(chunk, meta);
    } else {
      this.muxer.muxer.addVideoChunk(chunk, meta);
    }
  }

  async encodeFrame(source: CanvasImageSource, frameIndex: number): Promise<void> {
    if (this.closed) throw new Error('Encoder already closed');
    if (this.error) throw this.error;

    while (this.encoder.encodeQueueSize > BACKPRESSURE_LIMIT) {
      await new Promise((r) => setTimeout(r, 0));
      if (this.error) throw this.error;
    }

    const timestampUs = Math.round((frameIndex * 1_000_000) / this.fps);
    const frame = new VideoFrame(source, { timestamp: timestampUs });
    try {
      this.encoder.encode(frame, { keyFrame: frameIndex % this.keyFrameInterval === 0 });
    } finally {
      frame.close();
    }
  }

  async finalize(): Promise<Blob> {
    if (this.closed) throw new Error('Encoder already closed');
    await this.encoder.flush();
    if (this.error) throw this.error;
    this.muxer.muxer.finalize();
    const buffer = this.muxer.target.buffer;
    const mime = this.muxer.kind === 'mp4' ? 'video/mp4' : 'video/webm';
    this.closed = true;
    this.encoder.close();
    return new Blob([buffer], { type: mime });
  }

  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.encoder.state !== 'closed') this.encoder.close();
    } catch {
      // 已关闭即可，忽略
    }
  }
}
```

- [ ] **Step 3.2：类型检查**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
npx tsc -b --noEmit
```
Expected: 退出码 0。
**若报错**：常见原因是 mp4-muxer/webm-muxer 实际导出名与上述 import 略有差异（例如 v5 改成默认导出）。修复指引：打开 `app\node_modules\mp4-muxer\README.md`，照其示例调整 import 与构造参数；webm-muxer 同理。其余代码逻辑保持。

- [ ] **Step 3.3：commit**

```bash
git -C D:/Project/BioDraw2 add app/src/infrastructure/video-encoder/VideoExportEncoder.ts
git -C D:/Project/BioDraw2 commit -m "$(cat <<'EOF'
新增 VideoExportEncoder（WebCodecs + Muxer 离线编码）

封装 VideoEncoder + mp4-muxer/webm-muxer，逐帧手动指定 PTS，
使输出视频时长与帧率严格等于设置值。处理 backpressure 与降级。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：infrastructure barrel `index.ts`

**Files:**
- Create: `D:\Project\BioDraw2\app\src\infrastructure\video-encoder\index.ts`

- [ ] **Step 4.1：写入文件**

Write to `D:\Project\BioDraw2\app\src\infrastructure\video-encoder\index.ts`:

```ts
export { VideoExportEncoder } from './VideoExportEncoder';
export type { EncoderOptions, EncoderResolution } from './VideoExportEncoder';
export type { VideoFormat } from './encoderConfig';
```

- [ ] **Step 4.2：类型检查**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
npx tsc -b --noEmit
```
Expected: 退出码 0。

- [ ] **Step 4.3：commit**

```bash
git -C D:/Project/BioDraw2 add app/src/infrastructure/video-encoder/index.ts
git -C D:/Project/BioDraw2 commit -m "$(cat <<'EOF'
导出 video-encoder 模块的对外 API

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5：React 桥层 `useVideoExport.ts`

**Files:**
- Create: `D:\Project\BioDraw2\app\src\features\canvas-panel\useVideoExport.ts`

- [ ] **Step 5.1：写入完整文件**

Write to `D:\Project\BioDraw2\app\src\features\canvas-panel\useVideoExport.ts`:

```ts
import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type Konva from 'konva';
import { useEditorStore } from '../../state/editorStore';
import { VideoExportEncoder } from '../../infrastructure/video-encoder';
import type { SceneObject } from '../../types';

interface UseVideoExportParams {
  stageRef: React.RefObject<Konva.Stage | null>;
  fitCanvasRef: React.MutableRefObject<() => void>;
  canvasWidthRef: React.MutableRefObject<number>;
  canvasHeightRef: React.MutableRefObject<number>;
  objectsSnapRef: React.MutableRefObject<SceneObject[]>;
  commitTextChangeRef: React.MutableRefObject<() => void>;
  /** 调用方提供的 stage canvas 采样方法，复用现有 helper 避免重复实现 */
  captureCanvasContent: (
    stage: Konva.Stage,
    contentWidth: number,
    contentHeight: number,
    outputWidth: number,
  ) => HTMLCanvasElement;
  waitForMaterialImages: (objects: SceneObject[]) => Promise<void>;
  /** 当前 stage 视图状态（缩放与平移）— CanvasPanel 内 useState 而非 store，需通过参数传 */
  stageScaleRef: React.MutableRefObject<number>;
  stagePosRef: React.MutableRefObject<{ x: number; y: number }>;
  /** 导出结束后用于恢复 stage 视图 */
  restoreStage: (scale: number, pos: { x: number; y: number }) => void;
}

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const formatExportProgress = (current: number, total: number) => {
  if (total <= 0) return '100%';
  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  return `${current}/${total} (${percent}%)`;
};

/**
 * 监听 store 中的 videoExportRequestId 触发视频导出。
 * 取代原 CanvasPanel.tsx 中长约 200 行的 useEffect。
 *
 * 关键点：用 flushSync + stage.draw() 同步推进每一帧，
 * 用 VideoExportEncoder 离线编码，与物理时间完全解耦。
 */
export const useVideoExport = ({
  stageRef,
  fitCanvasRef,
  canvasWidthRef,
  canvasHeightRef,
  objectsSnapRef,
  commitTextChangeRef,
  captureCanvasContent,
  waitForMaterialImages,
  stageScaleRef,
  stagePosRef,
  restoreStage,
}: UseVideoExportParams) => {
  const videoExportRequestId = useEditorStore((s) => s.videoExportRequestId);
  const videoExportOptions = useEditorStore((s) => s.videoExportOptions);
  const setVideoExportStatus = useEditorStore((s) => s.setVideoExportStatus);
  const globalDurationMs = useEditorStore((s) => s.globalDurationMs);
  const setCurrentTimeMs = useEditorStore((s) => s.setCurrentTimeMs);
  const pausePlayback = useEditorStore((s) => s.pause);
  const playPlayback = useEditorStore((s) => s.play);
  const cancelExport = useEditorStore((s) => s.cancelExport);

  const lastHandledRef = useRef(0);
  const exportCancelCountRef = useRef(0);
  const exportCancelCount = useEditorStore((s) => s.exportCancelCount);
  useEffect(() => {
    exportCancelCountRef.current = exportCancelCount;
  }, [exportCancelCount]);

  useEffect(() => {
    if (videoExportRequestId <= 0) return;
    if (lastHandledRef.current === videoExportRequestId) return;
    lastHandledRef.current = videoExportRequestId;

    const cancelSnapshot = exportCancelCountRef.current;
    let encoder: VideoExportEncoder | null = null;
    let cancelled = false;

    const run = async () => {
      const stage = stageRef.current;
      if (!stage) {
        setVideoExportStatus('error', '画布未就绪');
        return;
      }
      if (typeof VideoEncoder === 'undefined') {
        setVideoExportStatus('error', '当前浏览器不支持 WebCodecs 视频编码');
        return;
      }

      const store = useEditorStore.getState();
      const originalScale = stageScaleRef.current;
      const originalPos = { ...stagePosRef.current };
      const originalTimeMs = store.currentTimeMs;
      const wasPlaying = store.playbackStatus === 'playing';

      const opts = videoExportOptions;
      const width = Math.max(16, Math.round(opts.width));
      const height = Math.max(16, Math.round(opts.height));
      const fps = Math.max(1, Math.min(60, Math.round(opts.fps)));
      const startMs = Math.max(0, Math.min(opts.startMs, globalDurationMs));
      const endMs = Math.max(startMs, Math.min(opts.endMs, globalDurationMs));
      const stepMs = 1000 / fps;
      const totalFrames = Math.max(1, Math.floor((endMs - startMs) / stepMs) + 1);
      const prefix = (opts.prefix || 'biodraw-video').trim() || 'biodraw-video';

      try {
        commitTextChangeRef.current();
        await waitForNextPaint();
        await waitForMaterialImages(objectsSnapRef.current);

        if (wasPlaying) pausePlayback();
        setVideoExportStatus('running', formatExportProgress(0, totalFrames));
        fitCanvasRef.current();
        await waitForNextPaint();

        const resolution = await VideoExportEncoder.resolveSupported({
          width, height, fps, format: opts.format,
        });
        if (!resolution) {
          setVideoExportStatus('error', '未找到可用的视频编码格式');
          return;
        }

        encoder = new VideoExportEncoder(
          { width, height, fps, format: opts.format },
          resolution,
        );

        for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
          if (exportCancelCountRef.current !== cancelSnapshot) {
            cancelled = true;
            break;
          }
          const timeMs = Math.min(endMs, Math.round(startMs + frameIndex * stepMs));

          flushSync(() => {
            setCurrentTimeMs(timeMs);
          });
          stage.draw();

          const frameCanvas = captureCanvasContent(
            stage,
            canvasWidthRef.current,
            canvasHeightRef.current,
            width,
          );
          await encoder.encodeFrame(frameCanvas, frameIndex);
          setVideoExportStatus(
            'running',
            formatExportProgress(frameIndex + 1, totalFrames),
          );

          if ((frameIndex + 1) % 8 === 0) {
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
          }
        }

        if (cancelled) {
          encoder.cancel();
          setVideoExportStatus('idle');
          return;
        }

        const videoBlob = await encoder.finalize();

        if (exportCancelCountRef.current !== cancelSnapshot) {
          setVideoExportStatus('idle');
          return;
        }

        const url = URL.createObjectURL(videoBlob);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${prefix}_${stamp}.${resolution.extension}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        if (resolution.isDowngraded) {
          setVideoExportStatus(
            'done',
            `已导出 ${resolution.extension.toUpperCase()}（浏览器不支持 ${opts.format.toUpperCase()}）`,
          );
        } else {
          setVideoExportStatus('done', `${totalFrames} 帧`);
        }
      } catch (error) {
        if (encoder) encoder.cancel();
        const message = error instanceof Error ? error.message : '视频导出失败';
        setVideoExportStatus('error', message);
      } finally {
        // stageScale / stagePos 是 CanvasPanel 的 useState，不在 store 中 — 通过回调恢复
        useEditorStore.getState().setCurrentTimeMs(originalTimeMs);
        restoreStage(originalScale, originalPos);
        if (wasPlaying) playPlayback();
      }
    };

    void run();

    // 组件卸载时取消进行中的导出（现有代码缺失，新增）
    return () => {
      if (encoder) encoder.cancel();
      cancelExport();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 同现有 useEffect：stage* / playbackStatus / currentTimeMs 在导出开始时快照，加入依赖会让导出中途重启
  }, [
    videoExportRequestId,
    videoExportOptions,
    globalDurationMs,
    pausePlayback,
    playPlayback,
    setCurrentTimeMs,
    setVideoExportStatus,
    cancelExport,
  ]);
};
```

- [ ] **Step 5.2：（说明性步骤，无操作）确认 stage 视图状态来源**

已经验证：`stageScale` / `stagePos` 是 `CanvasPanel.tsx` 内部的 `useState`（约 line 272-273），不在 store 中。所以本 hook 通过 `stageScaleRef` / `stagePosRef` ref 读取当前值、通过 `restoreStage` 回调写回。CanvasPanel 在 Task 6 中需要建立这两个 ref（如果还没有的话）并提供 restoreStage 实现。

- [ ] **Step 5.3：类型检查**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
npx tsc -b --noEmit
```
Expected: 退出码 0。

- [ ] **Step 5.4：commit**

```bash
git -C D:/Project/BioDraw2 add app/src/features/canvas-panel/useVideoExport.ts
git -C D:/Project/BioDraw2 commit -m "$(cat <<'EOF'
新增 useVideoExport hook

把 React/Konva 采样与 VideoExportEncoder 衔接：
flushSync + stage.draw 同步推进每一帧，避免 waitForNextPaint 拖慢节奏；
新增组件卸载时取消进行中导出的 cleanup。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6：替换 `CanvasPanel.tsx` 中的视频导出代码

**Files:**
- Modify: `D:\Project\BioDraw2\app\src\features\canvas-panel\CanvasPanel.tsx`

- [ ] **Step 6.1：先重读当前文件中的视频导出 useEffect 与依赖区，记录起止行号**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
Select-String -Path src\features\canvas-panel\CanvasPanel.tsx -Pattern "if \(videoExportRequestId <= 0\) return|runVideoExport\(\);" | Format-Table LineNumber, Line -AutoSize
```
Expected: 看到两行：第一行是 useEffect 起点（约 line 629），第二行是 `runVideoExport();` 调用（约 line 818）。useEffect 的结束花括号紧随依赖数组，可手动定位。

记录精确的"删除起始行"与"删除结束行"，后续 Step 用。

- [ ] **Step 6.2：删除整段视频导出 useEffect**

打开 `D:\Project\BioDraw2\app\src\features\canvas-panel\CanvasPanel.tsx`，删除从 Step 6.1 找到的"起始行（包含 `useEffect(() => {` 这一行）"到"结束行（包含依赖数组的 `]);`）"之间所有内容。

参考标识：
```ts
  useEffect(() => {
    if (videoExportRequestId <= 0) return;
    // ... 整段 runVideoExport 异步函数 ...
    runVideoExport();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ...
  }, [
    globalDurationMs,
    pausePlayback,
    playPlayback,
    setCurrentTimeMs,
    setVideoExportStatus,
    videoExportOptions,
    videoExportRequestId,
  ]);
```

**这一段全部删除。** 删除后保留单帧 PNG 导出的 useEffect（`if (singleFrameExportId === 0) return;` 那段）和它之上的所有内容不动。

- [ ] **Step 6.3：删除仅被旧 useEffect 使用的 ref / 局部辅助**

在 CanvasPanel.tsx 中搜索是否有仅被刚才删除的 useEffect 使用的局部 ref 或常量。最有可能的候选：

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
Select-String -Path src\features\canvas-panel\CanvasPanel.tsx -Pattern "lastHandledVideoExportRequestRef" -AllMatches | Format-Table LineNumber, Line -AutoSize
```
Expected: 应当只剩一处声明（已删除使用方），把这条声明也一并删除。

类似地排查 `videoExportRequestId` / `videoExportOptions` / `setVideoExportStatus` —— 但**这些不要删**，下一步 `useVideoExport(...)` 内部不通过 props 重复读，是直接从 store 取。所以 CanvasPanel 的这些读取 hook 若**当前没有其它地方使用**也可以删；用 Select-String 验证：

```powershell
Set-Location D:\Project\BioDraw2\app
Select-String -Path src\features\canvas-panel\CanvasPanel.tsx -Pattern "videoExportRequestId|videoExportOptions" -AllMatches | Format-Table LineNumber, Line -AutoSize
```
若每个名字只剩 1 处声明（如 `const videoExportRequestId = useEditorStore(...)`），则把那行删除。`setVideoExportStatus` 同理。

- [ ] **Step 6.4：在原 useEffect 位置改为调用 useVideoExport hook**

CanvasPanel.tsx 已有 `stageScaleRef` (line 345)、`stagePosRef` (line 342)，以及 setter `setStageScale` (line 272)、`setStagePos` (line 273)。这些都不动，直接传入 hook。

在原 useEffect 删除位置（紧跟单帧 PNG useEffect 之后）新增：

```tsx
  useVideoExport({
    stageRef,
    fitCanvasRef,
    canvasWidthRef,
    canvasHeightRef,
    objectsSnapRef,
    commitTextChangeRef,
    captureCanvasContent,
    waitForMaterialImages,
    stageScaleRef,
    stagePosRef,
    restoreStage: (scale, pos) => {
      setStageScale(scale);
      setStagePos(pos);
    },
  });
```

并在文件顶部 imports 区追加一行：

```ts
import { useVideoExport } from './useVideoExport';
```

- [ ] **Step 6.5：类型检查**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
npx tsc -b --noEmit
```
Expected: 退出码 0。

- [ ] **Step 6.6：Lint**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
npm run lint
```
Expected: 退出码 0。常见可能告警：`@typescript-eslint/no-unused-vars` 对刚才漏删的 ref/import → 补删。

- [ ] **Step 6.7：commit**

```bash
git -C D:/Project/BioDraw2 add app/src/features/canvas-panel/CanvasPanel.tsx
git -C D:/Project/BioDraw2 commit -m "$(cat <<'EOF'
CanvasPanel 切换到 useVideoExport hook

删除旧 MediaRecorder + captureStream 的视频导出 useEffect（约 200 行），
改为调用 useVideoExport。单帧 PNG / 序列帧 ZIP / 共享 helper 完全不动。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7：手动验证矩阵

**Files:** 仅运行/观察，不修改文件（除非发现 bug）

- [ ] **Step 7.1：启动 dev server**

Run:
```powershell
Set-Location D:\Project\BioDraw2\app
npm run dev
```
Expected: Vite 启动，console 输出 `Local: http://localhost:5173/`（端口以实际为准）。

- [ ] **Step 7.2：浏览器打开 dev server**

用 Chrome 或 Edge 打开 dev server URL。

- [ ] **Step 7.3：按 spec §7 表逐项验证**

参照 `docs/superpowers/specs/2026-05-24-video-export-redesign-design.md` 第 7 节的验证矩阵（9 项）。**核心 4 项必须过**：

| # | 设置 | 通过标准 |
|---|---|---|
| 1 | 24 fps × 10s，0~10s | mp4 文件时长 = 10.0±0.05s，帧率 = 24 |
| 2 | 30 fps × 4s，4~8s | 时长 = 4.0s |
| 3 | **60 fps × 10s，0~10s** | 时长 = 10.0s（**核心回归点**）|
| 7 | 24 fps × 10s，导出到 50% 时点关闭按钮 | 状态恢复 idle，无文件下载 |

验证工具二选一：
- PotPlayer 打开导出文件，查看属性 → 时长 / 帧率
- 若装了 ffmpeg：`ffprobe -v error -show_entries stream=duration,r_frame_rate -of default=noprint_wrappers=1 <file>`

- [ ] **Step 7.4：记录验证结果**

把每项结果（通过/失败 + 实测时长帧率）记在本 Step 下作为 commit message 内容。

- [ ] **Step 7.5：（如有失败）问题修复 → 重跑 → 再 commit**

若任一项失败：
- 先在 Chrome DevTools console 查看是否有 WebCodecs/Muxer 报错
- 按错误信息对应到 spec §5.1 错误矩阵决定修复方向
- 修完回到 Step 7.1 重跑
- 修复 commit 单独提交

- [ ] **Step 7.6：（如全部通过）记录测试通过的 commit**

```bash
git -C D:/Project/BioDraw2 commit --allow-empty -m "$(cat <<'EOF'
视频导出重设计：手动验证矩阵全部通过

- 24fps×10s → 10.0s ✓
- 30fps×4s  → 4.0s ✓
- 60fps×10s → 10.0s ✓（核心回归点）
- 取消流程 ✓
（其余测试项详见 spec §7）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7.7：清理根目录测试截图**

`git status` 中根目录散落大量 `test-*.png` / `export-test-*.png`（来自之前的 playwright 调试）。本次任务**不清理**这些（属于"无关代码"约束）。仅在用户主动要求时再做。

---

## Done

至此实现完成。整体 diff 应当是：
- 新增：4 个文件（encoderConfig.ts / VideoExportEncoder.ts / index.ts / useVideoExport.ts）≈ 350 行
- 修改：CanvasPanel.tsx 净减约 180 行；package.json/lock 新增依赖
- 不动：state / types / engine / 其它 panel / 所有样式 / 单帧 PNG 与序列帧 ZIP 流程
