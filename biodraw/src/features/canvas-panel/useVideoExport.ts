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
  captureCanvasContent: (
    stage: Konva.Stage,
    contentWidth: number,
    contentHeight: number,
    outputWidth: number,
  ) => HTMLCanvasElement;
  waitForMaterialImages: (objects: SceneObject[]) => Promise<void>;
  stageScaleRef: React.MutableRefObject<number>;
  stagePosRef: React.MutableRefObject<{ x: number; y: number }>;
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


  const lastHandledRef = useRef(videoExportRequestId);
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
      const totalFrames = Math.max(1, Math.round((endMs - startMs) * fps / 1000) + 1);
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
        const link = document.createElement('a');
        link.href = url;
        link.download = `${prefix}-video.${resolution.extension}`;
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
        useEditorStore.getState().setCurrentTimeMs(originalTimeMs);
        restoreStage(originalScale, originalPos);
        if (wasPlaying) playPlayback();
      }
    };

    void run();

    return () => {
      if (encoder) encoder.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    videoExportRequestId,
    videoExportOptions,
    globalDurationMs,
    pausePlayback,
    playPlayback,
    setCurrentTimeMs,
    setVideoExportStatus,
  ]);
};
