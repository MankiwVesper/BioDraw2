import React, { useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { useEditorStore } from '../../state/editorStore';
import { buildAnimatedPreviewObjects } from '../../animation/engine';
import { Rect } from 'react-konva';
import { SceneObjectRenderer } from '../../render/objects/SceneObjectRenderer';
import { AnimationPathOverlay } from '../../render/animation/AnimationPathOverlay';
import type { SceneObject } from '../../types';
import type Konva from 'konva';
import './CanvasPanel.css';

const TEXT_LINE_HEIGHT = 1.2;

const getVerticalEditorSize = (value: string, fontSizePx: number) => {
  const lines = (value || ' ').split('\n');
  const columnCount = Math.max(lines.length, 1);
  const maxCharsInColumn = Math.max(
    ...lines.map((line) => Math.max([...line].length, 1)),
    1,
  );
  const unit = Math.max(fontSizePx * TEXT_LINE_HEIGHT, fontSizePx);
  return {
    width: Math.ceil(columnCount * unit),
    height: Math.ceil(maxCharsInColumn * unit),
  };
};

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

const waitForMs = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const formatExportProgress = (current: number, total: number) => {
  if (total <= 0) return '100%';
  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  return `${current}/${total} (${percent}%)`;
};

const blobFromCanvas = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create image blob from canvas.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });

const blobToUint8Array = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
};

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const drawStageToExportCanvas = (
  stage: Konva.Stage,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => {
  const frameCanvas = stage.toCanvas({ pixelRatio: 1 });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(frameCanvas, 0, 0, width, height);
  return frameCanvas;
};

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const calcCrc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    const idx = (crc ^ bytes[i]) & 0xff;
    crc = (crc >>> 8) ^ crc32Table[idx];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const buildZipBlob = (entries: Array<{ name: string; data: Uint8Array }>) => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((Math.floor(now.getSeconds() / 2)) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = calcCrc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const blobParts: BlobPart[] = [
    ...localParts.map(asArrayBuffer),
    ...centralParts.map(asArrayBuffer),
    asArrayBuffer(end),
  ];
  return new Blob(blobParts, { type: 'application/zip' });
};

export function CanvasPanel() {
  type EditingTarget = 'text' | 'name';

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false); // 缁岀儤鐗搁柨顔藉瘻娑撳妞傛潻娑樺弳楠炲磭些濡€崇础
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>('text');
  const [editingRect, setEditingRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const objects = useEditorStore(state => state.objects);
  const selectedIds = useEditorStore(state => state.selectedIds);
  const addSceneObject = useEditorStore(state => state.addSceneObject);
  const canvasWidth    = useEditorStore((state) => state.canvasWidth);
  const canvasHeight   = useEditorStore((state) => state.canvasHeight);
  const canvasBgColor  = useEditorStore((state) => state.canvasBgColor);
  const selectObject = useEditorStore(state => state.selectObject);
  const removeSceneObject = useEditorStore(state => state.removeSceneObject);
  const updateSceneObject = useEditorStore(state => state.updateSceneObject);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);
  const past = useEditorStore(state => state.past);
  const future = useEditorStore(state => state.future);
  const animations = useEditorStore(state => state.animations);
  const playbackStatus = useEditorStore(state => state.playbackStatus);
  const currentTimeMs = useEditorStore(state => state.currentTimeMs);
  const globalDurationMs = useEditorStore(state => state.globalDurationMs);
  const sequenceExportStatus = useEditorStore(state => state.sequenceExportStatus);
  const videoExportStatus = useEditorStore(state => state.videoExportStatus);
  const setCurrentTimeMs = useEditorStore(state => state.setCurrentTimeMs);
  const playPlayback = useEditorStore(state => state.play);
  const pausePlayback = useEditorStore(state => state.pause);
  const sequenceExportRequestId = useEditorStore(state => state.sequenceExportRequestId);
  const sequenceExportOptions = useEditorStore(state => state.sequenceExportOptions);
  const setSequenceExportStatus = useEditorStore(state => state.setSequenceExportStatus);
  const videoExportRequestId = useEditorStore(state => state.videoExportRequestId);
  const videoExportOptions = useEditorStore(state => state.videoExportOptions);
  const setVideoExportStatus = useEditorStore(state => state.setVideoExportStatus);
  const lastHandledExportRequestRef = useRef(0);
  const lastHandledVideoExportRequestRef = useRef(0);

  const previewObjects = useMemo(() => {
    if (currentTimeMs <= 0) return objects;
    return buildAnimatedPreviewObjects(objects, animations, currentTimeMs);
  }, [objects, animations, currentTimeMs]);

  const isSequenceExportRunning = sequenceExportStatus === 'running';
  const isVideoExportRunning = videoExportStatus === 'running';
  const isAnyExportRunning = isSequenceExportRunning || isVideoExportRunning;
  const interactionLocked = playbackStatus === 'playing' || isAnyExportRunning;

  // Keep textarea focused while editing text/name.
  useLayoutEffect(() => {
    if (editingTextId && textareaRef.current) {
      const targetObj = objects.find((o) => o.id === editingTextId);
      const isVerticalText =
        editingTarget === 'text'
        && targetObj?.type === 'text'
        && (targetObj.style?.textDirection || 'horizontal') === 'vertical';

      if (!isVerticalText) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }

      textareaRef.current.focus();
      textareaRef.current.select();
      textareaRef.current.scrollLeft = 0;
      textareaRef.current.scrollTop = 0;
    }
  }, [editingTextId, editingTarget, objects]);

  // 閸濆秴绨插?Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return;
      }

      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }

      if (selectedIds.length === 0) return;
      const selectedId = selectedIds[0];
      const selectedObj = objects.find(o => o.id === selectedId);
      if (!selectedObj) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeSceneObject(selectedId);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateSceneObject(selectedId, { y: selectedObj.y - 1 });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSceneObject(selectedId, { y: selectedObj.y + 1 });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateSceneObject(selectedId, { x: selectedObj.x - 1 });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateSceneObject(selectedId, { x: selectedObj.x + 1 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, objects, removeSceneObject, updateSceneObject, undo, redo]);
  // Space key toggles temporary pan mode.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        setIsPanMode(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsPanMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // 濠婃俺鐤嗛敍娆硉rl+濠婃俺鐤?= 缂傗晜鏂侀敍灞炬珮闁碍绮存潪?= 楠炲磭些
  useEffect(() => {
    if (sequenceExportRequestId <= 0) return;
    if (lastHandledExportRequestRef.current === sequenceExportRequestId) return;
    lastHandledExportRequestRef.current = sequenceExportRequestId;

    let cancelled = false;

    const runSequenceExport = async () => {
      const stage = stageRef.current;
      if (!stage) {
        setSequenceExportStatus('error', '画布未就绪');
        return;
      }

      const originalScale = stageScale;
      const originalPos = { ...stagePos };
      const originalTimeMs = currentTimeMs;
      const wasPlaying = playbackStatus === 'playing';

      try {
        if (editingTextId) {
          commitTextChange();
          await waitForNextPaint();
        }

        const width = Math.max(16, Math.round(sequenceExportOptions.width));
        const height = Math.max(16, Math.round(sequenceExportOptions.height));
        const fps = Math.max(1, Math.min(60, Math.round(sequenceExportOptions.fps)));
        const startMs = Math.max(0, Math.min(sequenceExportOptions.startMs, globalDurationMs));
        const endMs = Math.max(startMs, Math.min(sequenceExportOptions.endMs, globalDurationMs));
        const stepMs = 1000 / fps;
        const totalFrames = Math.max(1, Math.floor((endMs - startMs) / stepMs) + 1);
        const prefix = (sequenceExportOptions.prefix || 'biodraw-frame').trim() || 'biodraw-frame';

        if (wasPlaying) {
          pausePlayback();
        }
        setSequenceExportStatus('running', formatExportProgress(0, totalFrames));
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
        await waitForNextPaint();

        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = width;
        targetCanvas.height = height;
        const ctx = targetCanvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to create export canvas context.');
        }

        const entries: Array<{ name: string; data: Uint8Array }> = [];
        for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
          if (cancelled) return;

          const timeMs = Math.min(endMs, Math.round(startMs + frameIndex * stepMs));
          setCurrentTimeMs(timeMs);
          await waitForNextPaint();

          drawStageToExportCanvas(stage, ctx, width, height);

          const frameBlob = await blobFromCanvas(targetCanvas);
          const frameBytes = await blobToUint8Array(frameBlob);
          entries.push({
            name: `${prefix}_${String(frameIndex + 1).padStart(4, '0')}.png`,
            data: frameBytes,
          });

          setSequenceExportStatus('running', formatExportProgress(frameIndex + 1, totalFrames));
        }

        if (cancelled) return;

        const zipBlob = buildZipBlob(entries);
        const url = URL.createObjectURL(zipBlob);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${prefix}_${stamp}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setSequenceExportStatus('done', `${totalFrames} 帧`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '序列帧导出失败';
        setSequenceExportStatus('error', message);
      } finally {
        setCurrentTimeMs(originalTimeMs);
        setStageScale(originalScale);
        setStagePos(originalPos);
        if (wasPlaying) {
          playPlayback();
        }
      }
    };

    runSequenceExport();

    return () => {
      cancelled = true;
    };
  }, [
    globalDurationMs,
    pausePlayback,
    playPlayback,
    sequenceExportOptions,
    sequenceExportRequestId,
    setCurrentTimeMs,
    setSequenceExportStatus,
  ]);

  useEffect(() => {
    if (videoExportRequestId <= 0) return;
    if (lastHandledVideoExportRequestRef.current === videoExportRequestId) return;
    lastHandledVideoExportRequestRef.current = videoExportRequestId;

    let cancelled = false;

    const runVideoExport = async () => {
      const stage = stageRef.current;
      if (!stage) {
        setVideoExportStatus('error', '画布未就绪');
        return;
      }
      if (typeof MediaRecorder === 'undefined') {
        setVideoExportStatus('error', '当前浏览器不支持视频导出');
        return;
      }

      const originalScale = stageScale;
      const originalPos = { ...stagePos };
      const originalTimeMs = currentTimeMs;
      const wasPlaying = playbackStatus === 'playing';

      try {
        if (editingTextId) {
          commitTextChange();
          await waitForNextPaint();
        }

        const width = Math.max(16, Math.round(videoExportOptions.width));
        const height = Math.max(16, Math.round(videoExportOptions.height));
        const fps = Math.max(1, Math.min(60, Math.round(videoExportOptions.fps)));
        const startMs = Math.max(0, Math.min(videoExportOptions.startMs, globalDurationMs));
        const endMs = Math.max(startMs, Math.min(videoExportOptions.endMs, globalDurationMs));
        const stepMs = 1000 / fps;
        const totalFrames = Math.max(1, Math.floor((endMs - startMs) / stepMs) + 1);
        const prefix = (videoExportOptions.prefix || 'biodraw-video').trim() || 'biodraw-video';

        const preferredMimeTypes = videoExportOptions.format === 'mp4'
          ? [
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm',
          ]
          : [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
          ];
        const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
        if (!mimeType) {
          throw new Error('未找到可用的视频编码格式');
        }
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';

        if (wasPlaying) {
          pausePlayback();
        }
        setVideoExportStatus('running', formatExportProgress(0, totalFrames));
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
        await waitForNextPaint();

        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = width;
        targetCanvas.height = height;
        const ctx = targetCanvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to create export canvas context.');
        }

        const stream = targetCanvas.captureStream(fps);
        const chunks: BlobPart[] = [];
        let recorderError: Error | null = null;

        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 8_000_000,
        });
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onerror = (event) => {
          const mediaError = (event as Event & { error?: Error }).error;
          recorderError = mediaError || new Error('视频录制失败');
        };
        const stopPromise = new Promise<Blob>((resolve) => {
          recorder.onstop = () => {
            resolve(new Blob(chunks, { type: mimeType }));
          };
        });

        recorder.start(Math.max(100, Math.round(stepMs)));

        for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
          if (cancelled) {
            if (recorder.state !== 'inactive') recorder.stop();
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          const timeMs = Math.min(endMs, Math.round(startMs + frameIndex * stepMs));
          setCurrentTimeMs(timeMs);
          await waitForNextPaint();

          drawStageToExportCanvas(stage, ctx, width, height);
          setVideoExportStatus('running', formatExportProgress(frameIndex + 1, totalFrames));
          await waitForMs(stepMs);
        }

        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        const videoBlob = await stopPromise;
        stream.getTracks().forEach((track) => track.stop());

        if (recorderError) {
          throw recorderError;
        }
        if (cancelled) return;

        const url = URL.createObjectURL(videoBlob);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${prefix}_${stamp}.${extension}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        if (videoExportOptions.format === 'mp4' && extension === 'webm') {
          setVideoExportStatus('done', '已导出 WebM（浏览器不支持 MP4）');
        } else {
          setVideoExportStatus('done', `${totalFrames} 帧`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '视频导出失败';
        setVideoExportStatus('error', message);
      } finally {
        setCurrentTimeMs(originalTimeMs);
        setStageScale(originalScale);
        setStagePos(originalPos);
        if (wasPlaying) {
          playPlayback();
        }
      }
    };

    runVideoExport();

    return () => {
      cancelled = true;
    };
  }, [
    globalDurationMs,
    pausePlayback,
    playPlayback,
    setCurrentTimeMs,
    setVideoExportStatus,
    videoExportOptions,
    videoExportRequestId,
  ]);
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Zoom around the pointer position.
      const scaleBy = 1.08;
      const oldScale = stageScale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };

      const direction = e.evt.deltaY < 0 ? 1 : -1;
      const newScale = Math.min(10, Math.max(0.05, direction > 0 ? oldScale * scaleBy : oldScale / scaleBy));

      setStageScale(newScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    } else if (e.evt.shiftKey) {
      // Shift + wheel = horizontal pan.
      setStagePos(prev => ({
        x: prev.x - e.evt.deltaY,
        y: prev.y,
      }));
    } else {
      setStagePos(prev => ({
        x: prev.x - e.evt.deltaX,
        y: prev.y - e.evt.deltaY,
      }));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // 韫囧懘銆忕拫鍐暏閿涘苯鍘戠拋绋垮帗缁辩姾顫﹂弨鍙ョ瑓
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dataString = e.dataTransfer.getData('application/biodraw-material');
    if (!dataString) return;
    
    try {
      const data = JSON.parse(dataString);
      const stage = stageRef.current;
      if (!stage) return;
      
      const containerRect = containerRef.current!.getBoundingClientRect();
      // 闁棗鎮滈弰鐘茬殸閿涙艾鐨㈡Η鐘崇垼鐏炲繐绠烽崸鎰垼鏉烆剚宕叉稉铏规暰鐢啰鈹栭梻鏉戞綏閺嶅浄绱欓懓鍐楠炲磭些閸滃瞼缂夐弨鎾呯礆
      const rawX = e.clientX - containerRect.left;
      const rawY = e.clientY - containerRect.top;
      const x = (rawX - stagePos.x) / stageScale;
      const y = (rawY - stagePos.y) / stageScale;

      const newObj: SceneObject = {
        id: crypto.randomUUID(),
        type: data.type || 'material',
        name: data.name,
        materialId: data.materialId,
        x: x,
        y: y,
        width: data.width || 80, 
        height: data.height || 80,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        zIndex: objects.length,
        animationIds: [],
        data: data.data || { url: data.url },
        style: data.style || {},
      };

      addSceneObject(newObj);
    } catch (err) {
      console.error("Failed to parse drop data", err);
    }
  };

  const checkDeselect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // When editing, clicking elsewhere should commit the edit first.
    if (editingTextId) {
      commitTextChange();
      return;
    }
    // Click on empty stage to clear selection.
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      selectObject(null);
    }
  };

  const handleEditStart = (
    id: string,
    rect: { x: number, y: number, width: number, height: number },
    target: EditingTarget = 'text',
  ) => {
    const obj = objects.find(o => o.id === id);
    if (!obj) return;

    setEditingTextId(id);
    setEditingTarget(target);
    // rect 已经是屏幕坐标（来自 Konva getAbsolutePosition()），无需再乘 stageScale
    setEditingRect(rect);
    setEditingValue(target === 'name' ? obj.name : ((obj.data?.text as string) || '点击输入内容'));
  };

  const commitTextChange = () => {
    if (editingTextId && textareaRef.current) {
      if (editingTarget === 'name') {
        updateSceneObject(editingTextId, {
          name: editingValue.replace(/\r?\n/g, ' ').trim(),
        });
        setEditingTextId(null);
        setEditingTarget('text');
        setEditingRect(null);
        return;
      }

      const currentObject = objects.find(o => o.id === editingTextId);
      const isVerticalText = currentObject?.type === 'text' && currentObject.style?.textDirection === 'vertical';
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = scrollHeight / stageScale;
      const textFontSize = (currentObject?.style?.fontSize || 18) * stageScale;
      const verticalSize = getVerticalEditorSize(editingValue, textFontSize);

      updateSceneObject(editingTextId, {
        ...(isVerticalText
          ? {
            width: verticalSize.width / stageScale,
            height: verticalSize.height / stageScale,
          }
          : { height: newHeight }),
        data: {
          ...(currentObject?.data || {}),
          text: editingValue,
        }
      });
      setEditingTextId(null);
      setEditingTarget('text');
      setEditingRect(null);
    }
  };

  const editingObject = editingTextId ? objects.find(o => o.id === editingTextId) : null;
  const isVerticalTextEditing =
    editingTarget === 'text'
    && editingObject?.type === 'text'
    && (editingObject.style?.textDirection || 'horizontal') === 'vertical';
  const editorNameColor =
    editingObject?.style?.textColor
    || editingObject?.style?.fill
    || '#334155';
  const editorFontSizePx = ((editingObject?.style?.fontSize || (editingTarget === 'name' ? 14 : 18)) * stageScale);
  const verticalEditorSize = isVerticalTextEditing
    ? getVerticalEditorSize(editingValue, editorFontSizePx)
    : null;
  const horizontalTextEditOffset =
    editingTarget === 'text' && !isVerticalTextEditing ? 1 : 0;

  return (
    <main className="canvas-panel">
      <div 
        className="canvas-wrapper" 
        ref={containerRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {dimensions.width > 0 && dimensions.height > 0 ? (
        <Stage 
            width={dimensions.width} 
            height={dimensions.height}
            ref={stageRef}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            draggable={isPanMode}
            onDragEnd={() => {
              const stage = stageRef.current;
              if (stage) setStagePos({ x: stage.x(), y: stage.y() });
            }}
            onWheel={handleWheel}
            onMouseDown={checkDeselect}
            onTouchStart={checkDeselect}
            listening={!interactionLocked}
            style={{ cursor: isPanMode ? 'grab' : 'default' }}
          >
            <Layer>
              {/* 画布背景与边界 */}
              <Rect
                x={0} y={0}
                width={canvasWidth} height={canvasHeight}
                fill={canvasBgColor}
                shadowColor="rgba(0,0,0,0.18)"
                shadowBlur={24 / stageScale}
                shadowOffsetX={0}
                shadowOffsetY={4 / stageScale}
                listening={false}
              />
              {previewObjects.map((obj) => (
                <SceneObjectRenderer
                  key={obj.id}
                  sceneObject={obj}
                  isSelected={!isAnyExportRunning && selectedIds.includes(obj.id)}
                  onSelect={() => selectObject(obj.id)}
                  onEditStart={handleEditStart}
                  isEditing={editingTextId === obj.id}
                />
              ))}
            </Layer>
            {/* 动画路径叠加层：仅在非导出状态下显示 */}
            {!isAnyExportRunning && (
              <Layer listening={!interactionLocked}>
                <AnimationPathOverlay stageScale={stageScale} />
              </Layer>
            )}
          </Stage>
        ) : (
          <div className="canvas-placeholder">鐢诲竷鍒濆鍖栦腑...</div>
        )}

        {/* 閺傚洤鐡х紓鏍帆闁喚鍍电仦?*/}
        {editingTextId && editingRect && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {/* 鐎圭懓娅掔仦鍌︾窗鐠愮喕鐭楃€规矮缍呴崪灞界€惄鏉戠湷娑?*/}
            <div
              style={{
                position: 'absolute',
                top: `${editingRect.y + horizontalTextEditOffset}px`,
                left: `${editingRect.x + horizontalTextEditOffset}px`,
                width: `${editingRect.width}px`,
                height: `${editingRect.height}px`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center', // 閸ㄥ倻娲跨仦鍛厬
                justifyContent: 'center', // 濮樻潙閽╃仦鍛厬
                pointerEvents: 'none',
              }}
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={editingValue}
                onChange={(e) => {
                  setEditingValue(e.target.value);
                  if (!isVerticalTextEditing) {
                    // 濡亝甯撻崝銊︹偓浣界殶閺佹挳鐝惔锔夸簰闁倿鍘ら崘鍛啇
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }
                }}
                onBlur={commitTextChange}
                onFocus={(e) => {
                  if (!isVerticalTextEditing) {
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    commitTextChange();
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitTextChange();
                  } else if (e.key === 'Escape') {
                    setEditingTextId(null);
                    setEditingTarget('text');
                    setEditingRect(null);
                  }
                }}
                style={{
                  width: isVerticalTextEditing ? `${verticalEditorSize?.width || editingRect.width}px` : '100%',
                  height: isVerticalTextEditing ? `${verticalEditorSize?.height || editingRect.height}px` : 'auto',
                  fontSize: `${editorFontSizePx}px`,
                  fontFamily: editingObject?.style?.fontFamily || 'sans-serif',
                  color: editingTarget === 'name'
                    ? editorNameColor
                    : (editingObject?.style?.fill || '#1e293b'),
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  textAlign: editingObject?.style?.textAlign || 'center',
                  padding: 0,
                  margin: 0,
                  overflow: 'hidden',
                  pointerEvents: 'auto',
                  lineHeight: TEXT_LINE_HEIGHT,
                  writingMode: isVerticalTextEditing ? 'vertical-rl' : 'horizontal-tb',
                  textOrientation: isVerticalTextEditing ? 'upright' : 'mixed',
                  whiteSpace: 'pre-wrap',
                  caretColor: editingTarget === 'name'
                    ? editorNameColor
                    : (editingObject?.style?.fill || '#4f46e5'),
                }}
              />
            </div>
          </div>
        )}

        {/* 閸欏厖绗傜憴鎺撳亾濞搭喗鎸欓柨鈧?闁插秴浠涢幒褍鍩楅弶?*/}
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          display: 'flex', alignItems: 'center', gap: '2px',
          backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)',
          borderRadius: '8px', padding: '4px 6px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 100, userSelect: 'none',
        }}>
          <button
            onClick={undo}
            disabled={past.length === 0}
            title="鎾ら攢 (Ctrl+Z)"
            style={{
              background: 'none', border: 'none', cursor: past.length === 0 ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)', fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
              opacity: past.length === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (past.length > 0) { e.currentTarget.style.backgroundColor = 'var(--bg-color)'; e.currentTarget.style.color = 'var(--text-main)'; } }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>↶</span>
            <span>撤销</span>
          </button>
          <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)' }} />
          <button
            onClick={redo}
            disabled={future.length === 0}
            title="閲嶅仛 (Ctrl+Y)"
            style={{
              background: 'none', border: 'none', cursor: future.length === 0 ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)', fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
              opacity: future.length === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (future.length > 0) { e.currentTarget.style.backgroundColor = 'var(--bg-color)'; e.currentTarget.style.color = 'var(--text-main)'; } }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>↷</span>
            <span>重做</span>
          </button>
        </div>

        {/* 閸欏厖绗呯憴鎺撳亾濞搭喚缂夐弨鐐付閸掕埖娼?*/}
        <div style={{
          position: 'absolute', bottom: '12px', right: '12px',
          display: 'flex', alignItems: 'center', gap: '4px',
          backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)',
          borderRadius: '8px', padding: '4px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 100, userSelect: 'none',
        }}>
          <button
            onClick={() => {
              const newScale = Math.max(0.05, stageScale / 1.2);
              const cx = dimensions.width / 2;
              const cy = dimensions.height / 2;
              const pointTo = { x: (cx - stagePos.x) / stageScale, y: (cy - stagePos.y) / stageScale };
              setStageScale(newScale);
              setStagePos({ x: cx - pointTo.x * newScale, y: cy - pointTo.y * newScale });
            }}
            title="缂╁皬"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
          >-</button>
          <button
            onClick={() => { setStageScale(1); setStagePos({ x: 0, y: 0 }); }}
            title="閲嶇疆鍒?100%"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', minWidth: '44px', textAlign: 'center', padding: '0 4px' }}
          >
            {Math.round(stageScale * 100)}%
          </button>
          <button
            onClick={() => {
              const newScale = Math.min(10, stageScale * 1.2);
              const cx = dimensions.width / 2;
              const cy = dimensions.height / 2;
              const pointTo = { x: (cx - stagePos.x) / stageScale, y: (cy - stagePos.y) / stageScale };
              setStageScale(newScale);
              setStagePos({ x: cx - pointTo.x * newScale, y: cy - pointTo.y * newScale });
            }}
            title="鏀惧ぇ"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
          >+</button>
        </div>
      </div>
    </main>
  );
}





