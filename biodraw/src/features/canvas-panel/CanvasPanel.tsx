import React, { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import { SkipBack, SkipForward, Play, Pause, Square } from 'lucide-react';
import { useEditorStore } from '../../state/editorStore';
import { useShallow } from 'zustand/react/shallow';
import { buildAnimatedPreviewObjects } from '../../animation/engine';
import { Rect, Text as KonvaText } from 'react-konva';
import { SceneObjectRenderer } from '../../render/objects/SceneObjectRenderer';
import { AnimationPathOverlay } from '../../render/animation/AnimationPathOverlay';
import type { SceneObject } from '../../types';
import type Konva from 'konva';
import './CanvasPanel.css';
import { useVideoExport } from './useVideoExport';
import { thumbnailCapture } from '../../infrastructure/thumbnailCapture';
import { buildZipBlob } from '../../infrastructure/zipExport';

type SnapLine = { axis: 'x' | 'y'; value: number; source: 'canvas' | 'object' };

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

const captureCanvasContent = (
  stage: Konva.Stage,
  contentWidth: number,
  contentHeight: number,
  outputWidth: number,
) => {
  const original = {
    x: stage.x(),
    y: stage.y(),
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
    width: stage.width(),
    height: stage.height(),
  };

  try {
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });
    stage.size({ width: contentWidth, height: contentHeight });
    stage.batchDraw();

    return stage.toCanvas({
      x: 0,
      y: 0,
      width: contentWidth,
      height: contentHeight,
      pixelRatio: outputWidth / contentWidth,
    });
  } finally {
    stage.position({ x: original.x, y: original.y });
    stage.scale({ x: original.scaleX, y: original.scaleY });
    stage.size({ width: original.width, height: original.height });
    stage.batchDraw();
  }
};

const drawCanvasContentToExportCanvas = (
  stage: Konva.Stage,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  contentWidth: number,
  contentHeight: number,
) => {
  const frameCanvas = captureCanvasContent(stage, contentWidth, contentHeight, width);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(frameCanvas, 0, 0, width, height);
  return frameCanvas;
};

const waitForImageAsset = (url: string, timeoutMs = 10000) =>
  new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const timer = window.setTimeout(
      () => finish(new Error(`素材图片加载超时: ${url}`)),
      timeoutMs,
    );
    image.onload = () => finish();
    image.onerror = () => finish(new Error(`素材图片加载失败: ${url}`));
    image.src = url;
    if (image.complete && image.naturalWidth > 0) {
      finish();
    }
  });

const waitForMaterialImages = async (objects: SceneObject[]) => {
  const urls = Array.from(new Set(
    objects
      .filter((obj) => obj.type === 'material')
      .map((obj) => obj.data?.url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0),
  ));
  if (urls.length === 0) return;
  await Promise.all(urls.map((url) => waitForImageAsset(url)));
  await waitForNextPaint();
};

const makeUniqueName = (desired: string, existingNames: string[], sep: string): string => {
  const taken = new Set(existingNames);
  if (!taken.has(desired)) return desired;
  let n = 2;
  while (taken.has(`${desired}${sep}${n}`)) n += 1;
  return `${desired}${sep}${n}`;
};

const formatPlaybackTime = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
};

export function CanvasPanel() {
  type EditingTarget = 'text' | 'name';

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>('text');
  const [editingRect, setEditingRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pendingNameEditId, setPendingNameEditId] = useState<string | null>(null);

  const {
    objects,
    selectedIds,
    applyAnimationFlashObjectIds,
    applyAnimationFlashKey,
    addSceneObject,
    canvasWidth,
    canvasHeight,
    canvasBgColor,
    selectObject,
    groupEditingId,
    enterGroupEditing,
    selectSceneObjects,
    updateSceneObject,
    moveMultipleSceneObjects,
    animations,
    previewClipId,
    playbackStatus,
    currentTimeMs,
    globalDurationMs,
    sequenceExportStatus,
    sequenceExportMessage,
    videoExportStatus,
    videoExportMessage,
    setCurrentTimeMs,
    playPlayback,
    pausePlayback,
    sequenceExportRequestId,
    sequenceExportOptions,
    setSequenceExportStatus,
    setVideoExportStatus,
    exportCancelCount,
    cancelExport,
    currentFileName,
    singleFrameExportId,
    singleFrameExportWidth,
    fitVersion,
    isPreviewMode,
    focusMode,
    canvasDrawingMode,
    setPreviewMode,
    stopPlayback,
    stepPlaybackFrame,
  } = useEditorStore(useShallow(s => ({
    objects: s.objects,
    selectedIds: s.selectedIds,
    applyAnimationFlashObjectIds: s.applyAnimationFlashObjectIds,
    applyAnimationFlashKey: s.applyAnimationFlashKey,
    addSceneObject: s.addSceneObject,
    canvasWidth: s.canvasWidth,
    canvasHeight: s.canvasHeight,
    canvasBgColor: s.canvasBgColor,
    selectObject: s.selectObject,
    groupEditingId: s.groupEditingId,
    enterGroupEditing: s.enterGroupEditing,
    selectSceneObjects: s.selectSceneObjects,
    updateSceneObject: s.updateSceneObject,
    moveMultipleSceneObjects: s.moveMultipleSceneObjects,
    animations: s.animations,
    previewClipId: s.previewClipId,
    playbackStatus: s.playbackStatus,
    currentTimeMs: s.currentTimeMs,
    globalDurationMs: s.globalDurationMs,
    sequenceExportStatus: s.sequenceExportStatus,
    sequenceExportMessage: s.sequenceExportMessage,
    videoExportStatus: s.videoExportStatus,
    videoExportMessage: s.videoExportMessage,
    setCurrentTimeMs: s.setCurrentTimeMs,
    playPlayback: s.play,
    pausePlayback: s.pause,
    sequenceExportRequestId: s.sequenceExportRequestId,
    sequenceExportOptions: s.sequenceExportOptions,
    setSequenceExportStatus: s.setSequenceExportStatus,
    setVideoExportStatus: s.setVideoExportStatus,
    exportCancelCount: s.exportCancelCount,
    cancelExport: s.cancelExport,
    currentFileName: s.currentFileName as string,
    singleFrameExportId: s.singleFrameExportId,
    singleFrameExportWidth: s.singleFrameExportWidth,
    fitVersion: s.fitVersion,
    isPreviewMode: s.isPreviewMode,
    focusMode: s.focusMode,
    canvasDrawingMode: s.canvasDrawingMode,
    setPreviewMode: s.setPreviewMode,
    stopPlayback: s.stop,
    stepPlaybackFrame: s.stepPlaybackFrame,
  })));
  const lastHandledExportRequestRef = useRef(0);
  const exportCancelCountRef = useRef(exportCancelCount);
  const lastSingleFrameExportIdRef = useRef(0);
  const commitTextChangeRef = useRef<() => void>(() => {});
  const [singleFrameExporting, setSingleFrameExporting] = useState(false);
  // ── Group drag state
  const groupDragIdRef = useRef<string | null>(null);
  const groupDragStartsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const groupDragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const [groupDragOffset, setGroupDragOffset] = useState<{ dx: number; dy: number } | null>(null);

  // ── Rubber-band selection state
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectionRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectionStartCanvasRef = useRef<{ x: number; y: number } | null>(null);
  const isSelectingRef = useRef(false);
  const stagePosRef = useRef(stagePos);
  // ── Snap lines
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const stageScaleRef = useRef(stageScale);
  const objectsSnapRef = useRef(objects);
  const selectedIdsSnapRef = useRef(selectedIds);
  const canvasWidthRef = useRef(canvasWidth);
  const canvasHeightRef = useRef(canvasHeight);
  const fitCanvasRef = useRef<() => void>(() => {});

  // Keep refs in sync for snap / group-drag callbacks
  useEffect(() => { exportCancelCountRef.current = exportCancelCount; }, [exportCancelCount]);
  useEffect(() => { stageScaleRef.current = stageScale; }, [stageScale]);
  useEffect(() => { objectsSnapRef.current = objects; }, [objects]);
  useEffect(() => { selectedIdsSnapRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { canvasWidthRef.current = canvasWidth; }, [canvasWidth]);
  useEffect(() => { canvasHeightRef.current = canvasHeight; }, [canvasHeight]);
  useEffect(() => { stagePosRef.current = stagePos; }, [stagePos]);

  useEffect(() => {
    thumbnailCapture.current = () => {
      const stage = stageRef.current;
      if (!stage) return null;
      const { canvasWidth: w, canvasHeight: h } = useEditorStore.getState();
      try {
        const canvas = captureCanvasContent(stage, w, h, 480);
        return canvas.toDataURL('image/jpeg', 0.7);
      } catch {
        return null;
      }
    };
    return () => { thumbnailCapture.current = null; };
  }, []);

  // 若选中切换到其他对象，取消待触发的名称编辑（防止拖拽后立即选中别的对象仍弹出编辑）
  useEffect(() => {
    if (!pendingNameEditId) return;
    if (!selectedIds.includes(pendingNameEditId)) setPendingNameEditId(null);
  }, [selectedIds, pendingNameEditId]);

  const isExportingFrame = sequenceExportStatus === 'running' || videoExportStatus === 'running' || singleFrameExporting;

  const previewObjects = useMemo(() => {
    if (currentTimeMs <= 0 && !previewClipId && !isExportingFrame) return objects;
    const activeAnimations = previewClipId
      ? animations.filter((c) => c.id === previewClipId)
      : animations;
    return buildAnimatedPreviewObjects(objects, activeAnimations, currentTimeMs, {
      evaluateAtZero: isExportingFrame,
    });
  }, [objects, animations, currentTimeMs, previewClipId, isExportingFrame]);

  // 全览模式：计算当前时刻不可见的元素，以 35% 不透明度渲染为"幽灵"
  const ghostObjects = useMemo(() => {
    if (focusMode || currentTimeMs <= 0) return [];
    const activeIds = new Set(previewObjects.map((o) => o.id));
    return objects
      .filter((o) => !activeIds.has(o.id))
      .map((o) => ({ ...o, opacity: (o.opacity ?? 1) * 0.35 }));
  }, [focusMode, currentTimeMs, previewObjects, objects]);

  // 组合整体包围框：所有选中对象共享同一 groupId 时计算旋转感知的 AABB
  // sceneObject.x/y 是中心点坐标，形状在 Group 内以 (-w/2, -h/2) 为起点
  const groupSelectionBox = useMemo(() => {
    if (groupEditingId) return null;   // 组内编辑时不显示大包围框
    if (selectedIds.length < 2) return null;
    const sel = objects.filter((o) => selectedIds.includes(o.id));
    const gid = sel[0]?.groupId;
    if (!gid || !sel.every((o) => o.groupId === gid)) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of sel) {
      const hw = (o.width * (o.scaleX ?? 1)) / 2;
      const hh = (o.height * (o.scaleY ?? 1)) / 2;
      const rad = ((o.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const) {
        const cx = o.x + lx * cos - ly * sin;
        const cy = o.y + lx * sin + ly * cos;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
      }
    }
    const dx = groupDragOffset?.dx ?? 0;
    const dy = groupDragOffset?.dy ?? 0;
    return { x: minX - 4 + dx, y: minY - 4 + dy, width: maxX - minX + 8, height: maxY - minY + 8 };
  }, [selectedIds, objects, groupDragOffset, groupEditingId]);

  const isAnyExportRunning = isExportingFrame;
  const interactionLocked = playbackStatus === 'playing' || isAnyExportRunning;
  const renderedGhostObjects = isAnyExportRunning ? [] : ghostObjects;
  const renderedPreviewObjects = isAnyExportRunning
    ? previewObjects.filter((obj) => obj.visible)
    : previewObjects;

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

  // 监听容器尺寸变化 Resize Observer
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

  // H 键切换持久平移模式；Escape 也可退出（与 Space 播放/暂停互不干扰）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsPanMode((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        setIsPanMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // sequenceExportRequestId 变化时触发序列帧导出
  useEffect(() => {
    if (sequenceExportRequestId <= 0) return;
    if (lastHandledExportRequestRef.current === sequenceExportRequestId) return;
    lastHandledExportRequestRef.current = sequenceExportRequestId;

    const runSequenceExport = async () => {
      const cancelSnapshot = exportCancelCountRef.current;

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
        await waitForMaterialImages(objectsSnapRef.current);

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
          if (exportCancelCountRef.current !== cancelSnapshot) {
            setSequenceExportStatus('idle');
            return;
          }

          const timeMs = Math.min(endMs, Math.round(startMs + frameIndex * stepMs));
          setCurrentTimeMs(timeMs);
          await waitForNextPaint();

          drawCanvasContentToExportCanvas(stage, ctx, width, height, canvasWidthRef.current, canvasHeightRef.current);

          const frameBlob = await blobFromCanvas(targetCanvas);
          const frameBytes = await blobToUint8Array(frameBlob);
          entries.push({
            name: `${prefix}_${String(frameIndex + 1).padStart(4, '0')}.png`,
            data: frameBytes,
          });

          setSequenceExportStatus('running', formatExportProgress(frameIndex + 1, totalFrames));
        }

        if (exportCancelCountRef.current !== cancelSnapshot) {
          setSequenceExportStatus('idle');
          return;
        }

        const zipBlob = buildZipBlob(entries);
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${prefix}.zip`;
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
      cancelExport();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stageScale/stagePos/currentTimeMs/playbackStatus/editingTextId/commitTextChange are snapshotted at export start; adding them would restart the export mid-run
  }, [
    cancelExport,
    globalDurationMs,
    pausePlayback,
    playPlayback,
    sequenceExportOptions,
    sequenceExportRequestId,
    setCurrentTimeMs,
    setSequenceExportStatus,
  ]);

  const exportCurrentFrameAsPng = useCallback(async () => {
    setSingleFrameExporting(true);
    try {
      commitTextChangeRef.current();
      await waitForNextPaint();
      await waitForNextPaint();

      const stage = stageRef.current;
      if (!stage) return;
      await waitForMaterialImages(objectsSnapRef.current);
      await waitForNextPaint();
      const cvW = canvasWidthRef.current;
      const cvH = canvasHeightRef.current;
      const frameCanvas = captureCanvasContent(stage, cvW, cvH, singleFrameExportWidth);
      const dataUrl = frameCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      const baseName = currentFileName.replace(/\.biodraw$/, '') || 'biodraw';
      a.download = `${baseName}-frame_${currentTimeMs}ms.png`;
      a.click();
    } finally {
      setSingleFrameExporting(false);
    }
  }, [currentTimeMs, singleFrameExportWidth]);

  useEffect(() => {
    if (singleFrameExportId === 0) return;
    if (singleFrameExportId === lastSingleFrameExportIdRef.current) return;
    lastSingleFrameExportIdRef.current = singleFrameExportId;
    void exportCurrentFrameAsPng();
  }, [singleFrameExportId, exportCurrentFrameAsPng]);

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
    e.preventDefault(); // 阻止默认事件以允许 drop
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
      // 将鼠标位置从屏幕坐标转换为画布坐标
      const rawX = e.clientX - containerRect.left;
      const rawY = e.clientY - containerRect.top;
      const x = (rawX - stagePos.x) / stageScale;
      const y = (rawY - stagePos.y) / stageScale;

      const newObj: SceneObject = {
        id: crypto.randomUUID(),
        type: data.type || 'material',
        name: makeUniqueName(data.name, objects.map((o) => o.name), ''),
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
      if (newObj.type !== 'text') {
        setPendingNameEditId(newObj.id);
      }
    } catch (err) {
      console.error("Failed to parse drop data", err);
    }
  };


  // ── Fit canvas to viewport ─────────────────────────────────
  const fitCanvas = useCallback(() => {
    if (dimensions.width <= 0 || dimensions.height <= 0) return;
    const padding = 40;
    const scaleX = (dimensions.width - padding * 2) / canvasWidth;
    const scaleY = (dimensions.height - padding * 2) / canvasHeight;
    const newScale = Math.min(scaleX, scaleY, 10);
    setStageScale(newScale);
    setStagePos({
      x: (dimensions.width - canvasWidth * newScale) / 2,
      y: (dimensions.height - canvasHeight * newScale) / 2,
    });
  }, [dimensions, canvasWidth, canvasHeight]);
  fitCanvasRef.current = fitCanvas;

  // store 发出 requestFit 信号时（进入预览等场景）自动适配画布
  useEffect(() => {
    if (fitVersion > 0) fitCanvas();
  }, [fitVersion, fitCanvas]);

  // Ctrl+0 → 100%；Ctrl+Shift+0 → fit canvas（独立 effect 以正确依赖 fitCanvas）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;
      const ctrl = e.ctrlKey || e.metaKey;
      // Ctrl+0 / Ctrl+Numpad0 → 100%（e.code 不受 Shift 影响）
      if (ctrl && !e.shiftKey && (e.code === 'Digit0' || e.code === 'Numpad0')) {
        e.preventDefault();
        setStageScale(1);
        setStagePos({ x: 0, y: 0 });
        return;
      }
      // Ctrl+Shift+F → 适应画布（避开 Windows IME 对 Ctrl+Shift+数字 的拦截）
      if (ctrl && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault();
        fitCanvas();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fitCanvas]);

  // ── Group drag handlers ─────────────────────────────────────
  const handleObjectDragStart = useCallback((id: string) => {
    const ids = selectedIdsSnapRef.current;
    if (ids.length < 2 || !ids.includes(id)) return;
    groupDragIdRef.current = id;
    const starts = new Map<string, { x: number; y: number }>();
    for (const sid of ids) {
      const obj = objectsSnapRef.current.find((o) => o.id === sid);
      if (obj) starts.set(sid, { x: obj.x, y: obj.y });
    }
    groupDragStartsRef.current = starts;
    setGroupDragOffset({ dx: 0, dy: 0 });
  }, []);

  const handleObjectDragMove = useCallback((
    id: string, cx: number, cy: number, w: number, h: number, shiftKey: boolean,
  ): { x: number; y: number } | null => {
    const scale = stageScaleRef.current;
    const THRESHOLD = 8 / scale;
    if (shiftKey) { setSnapLines([]); return null; }
    const allObjs = objectsSnapRef.current;
    const selIds = selectedIdsSnapRef.current;
    const cvW = canvasWidthRef.current;
    const cvH = canvasHeightRef.current;

    // Guide positions (canvas coords) — canvas guides and object guides tracked separately
    const canvasGuideXs: number[] = [0, cvW / 2, cvW];
    const canvasGuideYs: number[] = [0, cvH / 2, cvH];
    const objectGuideXs: number[] = [];
    const objectGuideYs: number[] = [];
    for (const obj of allObjs) {
      if (selIds.includes(obj.id)) continue;
      const ox = obj.x, ow = obj.width * (obj.scaleX ?? 1);
      const oy = obj.y, oh = obj.height * (obj.scaleY ?? 1);
      objectGuideXs.push(ox, ox + ow / 2, ox + ow);
      objectGuideYs.push(oy, oy + oh / 2, oy + oh);
    }

    // Snap points on the dragged object
    const checkXs = [cx, cx + w / 2, cx + w];
    const checkYs = [cy, cy + h / 2, cy + h];

    let bestXDiff = THRESHOLD + 1, bestXGuide = 0, bestXSnap = cx, bestXSource: 'canvas' | 'object' = 'canvas';
    for (let i = 0; i < checkXs.length; i++) {
      for (const gx of canvasGuideXs) {
        const d = Math.abs(checkXs[i] - gx);
        if (d < bestXDiff) { bestXDiff = d; bestXGuide = gx; bestXSnap = cx + (gx - checkXs[i]); bestXSource = 'canvas'; }
      }
      for (const gx of objectGuideXs) {
        const d = Math.abs(checkXs[i] - gx);
        if (d < bestXDiff) { bestXDiff = d; bestXGuide = gx; bestXSnap = cx + (gx - checkXs[i]); bestXSource = 'object'; }
      }
    }

    let bestYDiff = THRESHOLD + 1, bestYGuide = 0, bestYSnap = cy, bestYSource: 'canvas' | 'object' = 'canvas';
    for (let i = 0; i < checkYs.length; i++) {
      for (const gy of canvasGuideYs) {
        const d = Math.abs(checkYs[i] - gy);
        if (d < bestYDiff) { bestYDiff = d; bestYGuide = gy; bestYSnap = cy + (gy - checkYs[i]); bestYSource = 'canvas'; }
      }
      for (const gy of objectGuideYs) {
        const d = Math.abs(checkYs[i] - gy);
        if (d < bestYDiff) { bestYDiff = d; bestYGuide = gy; bestYSnap = cy + (gy - checkYs[i]); bestYSource = 'object'; }
      }
    }

    const newSnapLines: SnapLine[] = [];
    const snappedX = bestXDiff <= THRESHOLD ? bestXSnap : cx;
    const snappedY = bestYDiff <= THRESHOLD ? bestYSnap : cy;
    if (bestXDiff <= THRESHOLD) newSnapLines.push({ axis: 'x', value: bestXGuide, source: bestXSource });
    if (bestYDiff <= THRESHOLD) newSnapLines.push({ axis: 'y', value: bestYGuide, source: bestYSource });
    setSnapLines(newSnapLines);

    // Update group follower offsets
    const draggingId = groupDragIdRef.current;
    if (draggingId === id && groupDragStartsRef.current.size > 1) {
      const start = groupDragStartsRef.current.get(id);
      if (start) {
        const dx = snappedX - start.x;
        const dy = snappedY - start.y;
        groupDragOffsetRef.current = { dx, dy };
        setGroupDragOffset({ dx, dy });
      }
    }

    return (bestXDiff <= THRESHOLD || bestYDiff <= THRESHOLD)
      ? { x: snappedX, y: snappedY }
      : null;
  }, []);

  const handleObjectDragStop = useCallback(() => {
    setSnapLines([]);
    const draggingId = groupDragIdRef.current;
    if (!draggingId || groupDragStartsRef.current.size < 2) {
      groupDragIdRef.current = null;
      setGroupDragOffset(null);
      return;
    }
    const offset = groupDragOffsetRef.current;
    groupDragIdRef.current = null;
    groupDragOffsetRef.current = null;
    setGroupDragOffset(null);
    if (!offset || (offset.dx === 0 && offset.dy === 0)) {
      groupDragStartsRef.current = new Map();
      return;
    }
    const moves = Array.from(groupDragStartsRef.current.entries())
      .filter(([sid]) => sid !== draggingId)
      .map(([sid, start]) => ({ id: sid, x: start.x + offset.dx, y: start.y + offset.dy }));
    groupDragStartsRef.current = new Map();
    if (moves.length > 0) moveMultipleSceneObjects(moves);
  }, [moveMultipleSceneObjects]);

  const handleStageDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // 若名称/文字编辑刚被内层触发，跳过组内编辑
    if (nameEditJustStartedRef.current) { nameEditJustStartedRef.current = false; return; }
    if (e.target === e.target.getStage()) return;
    // 向上遍历找到带 name 属性的节点（SceneObjectRenderer 给主 Group 设了 name=id）
    let node: Konva.Node | null = e.target as Konva.Node;
    while (node && !node.name()) node = node.parent as Konva.Node | null;
    const objectId = node?.name();
    if (!objectId) return;
    const obj = objects.find(o => o.id === objectId);
    if (obj?.groupId && !editingTextId) {
      enterGroupEditing(objectId);
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

  // ── Rubber-band selection handlers ──────────────────────────────────────
  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (editingTextId) { commitTextChange(); return; }
    const clickedOnEmpty = e.target === e.target.getStage();
    if (!clickedOnEmpty) return;
    // Right-click or pan mode: just deselect, don't start rubber-band
    if (e.evt.button !== 0 || isPanMode) { selectObject(null); return; }

    const stage = stageRef.current;
    if (!stage) { selectObject(null); return; }
    const pointer = stage.getPointerPosition();
    if (!pointer) { selectObject(null); return; }

    const scale = stageScaleRef.current;
    const pos = stagePosRef.current;
    const canvasX = (pointer.x - pos.x) / scale;
    const canvasY = (pointer.y - pos.y) / scale;

    selectionStartCanvasRef.current = { x: canvasX, y: canvasY };
    isSelectingRef.current = true;
    const rect = { x: canvasX, y: canvasY, w: 0, h: 0 };
    selectionRectRef.current = rect;
    setSelectionRect(rect);
    selectObject(null);
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isSelectingRef.current || !selectionStartCanvasRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scale = stageScaleRef.current;
    const pos = stagePosRef.current;
    const canvasX = (pointer.x - pos.x) / scale;
    const canvasY = (pointer.y - pos.y) / scale;
    const start = selectionStartCanvasRef.current;

    const rect = {
      x: Math.min(start.x, canvasX),
      y: Math.min(start.y, canvasY),
      w: Math.abs(canvasX - start.x),
      h: Math.abs(canvasY - start.y),
    };
    selectionRectRef.current = rect;
    setSelectionRect(rect);
    e.evt.preventDefault();
  };

  const handleStageMouseUp = () => {
    if (!isSelectingRef.current) return;
    isSelectingRef.current = false;
    selectionStartCanvasRef.current = null;
    const rect = selectionRectRef.current;
    selectionRectRef.current = null;
    setSelectionRect(null);

    // Too small → treat as a click (already deselected on mousedown)
    if (!rect || rect.w < 5 || rect.h < 5) return;

    const allObjs = objectsSnapRef.current;
    const ids = allObjs
      .filter((obj) => {
        if (obj.locked || !obj.visible) return false;
        const w = obj.width * (obj.scaleX || 1);
        const h = obj.height * (obj.scaleY || 1);
        const objLeft  = obj.x - w / 2;
        const objRight = obj.x + w / 2;
        const objTop    = obj.y - h / 2;
        const objBottom = obj.y + h / 2;
        return objLeft < rect.x + rect.w && objRight > rect.x &&
               objTop  < rect.y + rect.h && objBottom > rect.y;
      })
      .map((obj) => obj.id);

    if (ids.length > 0) selectSceneObjects(ids);
  };

  const nameEditJustStartedRef = useRef(false);

  const handleEditStart = (
    id: string,
    rect: { x: number, y: number, width: number, height: number },
    target: EditingTarget = 'text',
  ) => {
    const obj = objects.find(o => o.id === id);
    if (!obj || obj.locked) return;
    // 组合成员：第一次双击应进入组内编辑模式，而非直接开始编辑文字/名称。
    // 只有已经在编辑该成员（groupEditingId === id）时，才允许继续触发文字/名称编辑。
    if (obj.groupId && groupEditingId !== id) return;
    nameEditJustStartedRef.current = true;

    setEditingTextId(id);
    setEditingTarget(target);
    // rect 已经是屏幕坐标（来自 Konva getAbsolutePosition()），无需再乘 stageScale
    setEditingRect(rect);
    setEditingValue(target === 'name' ? obj.name : ((obj.data?.text as string) || '点击输入内容'));
    setPendingNameEditId((prev) => (prev === id ? null : prev));
  };

  const commitTextChange = () => {
    if (editingTextId && textareaRef.current) {
      if (editingTarget === 'name') {
        const trimmedName = editingValue.replace(/\r?\n/g, ' ').trim();
        const otherNames = objects.filter((o) => o.id !== editingTextId).map((o) => o.name);
        updateSceneObject(editingTextId, {
          name: makeUniqueName(trimmedName, otherNames, '_'),
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
  commitTextChangeRef.current = commitTextChange;

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



  // ── 导出状态显示（移至画布区浮层）────────────────────────
  const [singleFrameExported, setSingleFrameExported] = useState(false);
  useEffect(() => {
    if (singleFrameExportId === 0) return;
    setSingleFrameExported(true);
    const timer = setTimeout(() => setSingleFrameExported(false), 3000);
    return () => clearTimeout(timer);
  }, [singleFrameExportId]);

  const isExporting = sequenceExportStatus === 'running' || videoExportStatus === 'running';
  const isExportError = videoExportStatus === 'error' || sequenceExportStatus === 'error';

  const exportStatusText = (() => {
    if (videoExportStatus === 'running')    return `视频导出中${videoExportMessage ? ` · ${videoExportMessage}` : ''}`;
    if (sequenceExportStatus === 'running') return `序列帧导出中${sequenceExportMessage ? ` · ${sequenceExportMessage}` : ''}`;
    if (videoExportStatus === 'error')      return `视频导出失败${videoExportMessage ? `: ${videoExportMessage}` : ''}`;
    if (sequenceExportStatus === 'error')   return `序列帧导出失败${sequenceExportMessage ? `: ${sequenceExportMessage}` : ''}`;
    if (videoExportStatus === 'done')       return '视频导出完成';
    if (sequenceExportStatus === 'done')    return '序列帧导出完成';
    return null;
  })();

  useEffect(() => {
    if (sequenceExportStatus === 'done' || sequenceExportStatus === 'error') {
      const timer = setTimeout(() => setSequenceExportStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [sequenceExportStatus, setSequenceExportStatus]);

  useEffect(() => {
    if (videoExportStatus === 'done' || videoExportStatus === 'error') {
      const timer = setTimeout(() => setVideoExportStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [videoExportStatus, setVideoExportStatus]);

  let exportProgress = 0;
  const progressMatch = sequenceExportMessage?.match(/^(\d+)\/(\d+)/);
  if (progressMatch) exportProgress = parseInt(progressMatch[1]) / parseInt(progressMatch[2]);
  let videoExportProgress = 0;
  const videoProgressMatch = videoExportMessage?.match(/^(\d+)\/(\d+)/);
  if (videoProgressMatch) videoExportProgress = parseInt(videoProgressMatch[1]) / parseInt(videoProgressMatch[2]);

  const showExportStatus = exportStatusText !== null || singleFrameExported || isExporting;

  return (
    <main className={`canvas-panel${isPreviewMode ? ' canvas-panel--preview' : ''}`}>
      {!isPreviewMode && showExportStatus && (
        <div className="export-status-bar">
          {exportStatusText && (
            <span className={`export-status-text${isExportError ? ' is-error' : ''}`}>
              {exportStatusText}
            </span>
          )}
          {singleFrameExported && !exportStatusText && (
            <span className="export-status-text">当前帧已导出</span>
          )}
          {isExporting && (
            <>
              <div className="export-progress-track">
                <div
                  className="export-progress-fill"
                  style={{ width: `${Math.round((sequenceExportStatus === 'running' ? exportProgress : videoExportProgress) * 100)}%` }}
                />
              </div>
              <button className="export-cancel-btn" onClick={cancelExport}>取消</button>
            </>
          )}
        </div>
      )}
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
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onDblClick={handleStageDblClick}
            onTouchStart={checkDeselect}
            listening={!interactionLocked}
            style={{ cursor: isPanMode ? 'grab' : canvasDrawingMode ? 'crosshair' : 'default' }}
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
              {renderedGhostObjects.map((obj) => (
                <SceneObjectRenderer
                  key={obj.id}
                  sceneObject={obj}
                  isSelected={!isAnyExportRunning && selectedIds.includes(obj.id)}
                  isGroupSelected={!!groupSelectionBox && selectedIds.includes(obj.id)}
                  isGroupMember={!!groupEditingId && obj.id !== groupEditingId && obj.groupId === objects.find(o => o.id === groupEditingId)?.groupId}
                  onGroupEditEnter={enterGroupEditing}
                  onEditStart={handleEditStart}
                  isEditing={editingTextId === obj.id}
                  isEditingText={editingTextId === obj.id && editingTarget === 'text'}
                  onDragStart={handleObjectDragStart}
                  onDragMove={handleObjectDragMove}
                  onDragStop={handleObjectDragStop}
                  isApplyFlash={!isAnyExportRunning && applyAnimationFlashObjectIds.includes(obj.id)}
                  applyFlashKey={applyAnimationFlashKey}
                />
              ))}
              {renderedPreviewObjects.map((obj) => {
                const isSelected = !isAnyExportRunning && selectedIds.includes(obj.id);
                const isFollower = groupDragOffset !== null &&
                  groupDragIdRef.current !== null &&
                  groupDragIdRef.current !== obj.id &&
                  selectedIds.includes(obj.id);
                return (
                  <SceneObjectRenderer
                    key={obj.id}
                    sceneObject={obj}
                    isSelected={isSelected}
                    isGroupSelected={!!groupSelectionBox && isSelected}
                    isGroupMember={!!groupEditingId && obj.id !== groupEditingId && obj.groupId === objects.find(o => o.id === groupEditingId)?.groupId}
                    onGroupEditEnter={enterGroupEditing}
                    onEditStart={handleEditStart}
                    isEditing={editingTextId === obj.id}
                    isEditingText={editingTextId === obj.id && editingTarget === 'text'}
                    xOverride={isFollower ? obj.x + (groupDragOffset?.dx ?? 0) : undefined}
                    yOverride={isFollower ? obj.y + (groupDragOffset?.dy ?? 0) : undefined}
                    onDragStart={handleObjectDragStart}
                    onDragMove={handleObjectDragMove}
                    onDragStop={handleObjectDragStop}
                    autoFocusName={!interactionLocked && pendingNameEditId === obj.id}
                    isApplyFlash={!isAnyExportRunning && applyAnimationFlashObjectIds.includes(obj.id)}
                    applyFlashKey={applyAnimationFlashKey}
                  />
                );
              })}
              {groupSelectionBox && !isAnyExportRunning && (
                <Rect
                  x={groupSelectionBox.x}
                  y={groupSelectionBox.y}
                  width={groupSelectionBox.width}
                  height={groupSelectionBox.height}
                  stroke="#3b82f6"
                  strokeWidth={1.5 / stageScale}
                  dash={[6 / stageScale, 3 / stageScale]}
                  fill="transparent"
                  listening={false}
                />
              )}
            </Layer>
            {/* 参考线层 */}
            {snapLines.length > 0 && (
              <Layer listening={false}>
                {snapLines.map((line, i) => {
                  const stroke = line.source === 'canvas' ? '#3b82f6' : '#ef4444';
                  const label = String(Math.round(line.value));
                  const lw = 44 / stageScale;
                  const lh = 15 / stageScale;
                  const lpad = 5 / stageScale;
                  const lfont = 10 / stageScale;
                  const lr = 2 / stageScale;
                  if (line.axis === 'x') {
                    const bx = Math.min(canvasWidth - lw - lpad, Math.max(lpad, line.value - lw / 2));
                    return (
                      <React.Fragment key={i}>
                        <Line points={[line.value, 0, line.value, canvasHeight]} stroke={stroke} strokeWidth={1 / stageScale} dash={[4 / stageScale, 4 / stageScale]} listening={false} />
                        <Rect x={bx} y={lpad} width={lw} height={lh} fill={stroke} cornerRadius={lr} listening={false} />
                        <KonvaText x={bx} y={lpad} width={lw} height={lh} text={label} fontSize={lfont} fill="#fff" align="center" verticalAlign="middle" listening={false} />
                      </React.Fragment>
                    );
                  }
                  const by = Math.min(canvasHeight - lh - lpad, Math.max(lpad, line.value - lh / 2));
                  return (
                    <React.Fragment key={i}>
                      <Line points={[0, line.value, canvasWidth, line.value]} stroke={stroke} strokeWidth={1 / stageScale} dash={[4 / stageScale, 4 / stageScale]} listening={false} />
                      <Rect x={lpad} y={by} width={lw} height={lh} fill={stroke} cornerRadius={lr} listening={false} />
                      <KonvaText x={lpad} y={by} width={lw} height={lh} text={label} fontSize={lfont} fill="#fff" align="center" verticalAlign="middle" listening={false} />
                    </React.Fragment>
                  );
                })}
              </Layer>
            )}
            {/* 动画路径叠加层：仅在非导出状态下显示 */}
            {!isAnyExportRunning && (
              <Layer listening={!interactionLocked}>
                <AnimationPathOverlay stageScale={stageScale} />
              </Layer>
            )}
            {/* 框选矩形层 */}
            {selectionRect && !isAnyExportRunning && (
              <Layer listening={false}>
                <Rect
                  x={selectionRect.x}
                  y={selectionRect.y}
                  width={selectionRect.w}
                  height={selectionRect.h}
                  fill="rgba(59,130,246,0.07)"
                  stroke="#3b82f6"
                  strokeWidth={1 / stageScale}
                  dash={[4 / stageScale, 4 / stageScale]}
                  listening={false}
                />
              </Layer>
            )}
          </Stage>
        ) : (
          <div className="canvas-placeholder">画布初始化中...</div>
        )}

        {/* 文字编辑浮层 */}
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
            {/* 居中定位的文字编辑容器 */}
            <div
              style={{
                position: 'absolute',
                top: `${editingRect.y + horizontalTextEditOffset}px`,
                left: `${editingRect.x + horizontalTextEditOffset}px`,
                width: `${editingRect.width}px`,
                height: `${editingRect.height}px`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center', // 垂直居中
                justifyContent: 'center', // 水平居中
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
                    // 横排文本自动撑高文本框
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
      </div>

      {/* 平移模式提示条（非预览模式：位于顶部工具栏与白色画布之间的灰色区域） */}
      {isPanMode && !isPreviewMode && (
        <div style={{
          position: 'absolute', top: '2px', left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(59,130,246,0.80)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.25)',
          color: '#fff', borderRadius: '4px', padding: '2px 12px',
          fontSize: '12px', lineHeight: '16px', pointerEvents: 'none',
          zIndex: 200, whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span>✋ 平移模式</span>
          <span style={{ opacity: 0.75 }}>再按 H 或 Esc 退出</span>
        </div>
      )}

      {/* 预览模式浮动控制栏（居中，位于画布上方灰色区域） */}
      {isPreviewMode && (
        <div className="pv-controls">
          <button className="pv-btn" onClick={() => stepPlaybackFrame(-1)} data-tooltip="上一帧">
            <SkipBack size={14} strokeWidth={2} />
          </button>
          <button
            className={`pv-btn pv-play${playbackStatus === 'playing' ? ' pv-playing' : ''}`}
            onClick={playbackStatus === 'playing' ? pausePlayback : playPlayback}
            data-tooltip={playbackStatus === 'playing' ? '暂停' : '播放'}
          >
            {playbackStatus === 'playing'
              ? <Pause size={13} strokeWidth={2.5} fill="currentColor" />
              : <Play  size={13} strokeWidth={2.5} fill="currentColor" />}
          </button>
          <button className="pv-btn" onClick={stopPlayback} data-tooltip="停止">
            <Square size={11} strokeWidth={0} fill="currentColor" />
          </button>
          <button className="pv-btn" onClick={() => stepPlaybackFrame(1)} data-tooltip="下一帧">
            <SkipForward size={14} strokeWidth={2} />
          </button>
          <div className="pv-divider" />
          <div
            className="pv-progress-wrap"
            data-tooltip="点击跳转"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setCurrentTimeMs(ratio * globalDurationMs);
            }}
          >
            <div className="pv-progress-track">
              <div
                className="pv-progress-fill"
                style={{ width: `${globalDurationMs > 0 ? (currentTimeMs / globalDurationMs) * 100 : 0}%` }}
              />
            </div>
            <span className="pv-time-label">
              {formatPlaybackTime(currentTimeMs)} / {formatPlaybackTime(globalDurationMs)}
            </span>
          </div>
          <div className="pv-divider" />
          <button className="pv-exit" onClick={() => setPreviewMode(false)} data-tooltip="退出预览 (Esc)">
            ✕ 退出
          </button>
        </div>
      )}

      {/* 缩放控件：预览模式居中+较大，非预览模式恢复原始位置和尺寸 */}
      <div style={{
        position: 'absolute',
        ...(isPreviewMode
          ? { bottom: '5px', left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', gap: undefined }
          : { bottom: '36px', right: '36px', padding: '4px 8px' }),
        display: 'flex', alignItems: 'center', gap: isPreviewMode ? '6px' : '4px',
        backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)',
        borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        zIndex: 100, userSelect: 'none' as const,
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
          data-tooltip="缩小"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: isPreviewMode ? '20px' : '16px', lineHeight: 1, padding: '0 2px' }}
        >-</button>
        <button
          onClick={() => { setStageScale(1); setStagePos({ x: 0, y: 0 }); }}
          data-tooltip="重置到 100% (Ctrl+0)"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: isPreviewMode ? '14px' : '12px', minWidth: isPreviewMode ? '50px' : '44px', textAlign: 'center', padding: '0 4px' }}
        >
          {Math.round(stageScale * 100)}%
        </button>
        <button
          onClick={fitCanvas}
          data-tooltip="适应画布 (Ctrl+Shift+F)"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: isPreviewMode ? '13px' : '11px', padding: '0 4px' }}
        >
          适配
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
          data-tooltip="放大"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: isPreviewMode ? '20px' : '16px', lineHeight: 1, padding: '0 2px' }}
        >+</button>
      </div>
    </main>
  );
}





