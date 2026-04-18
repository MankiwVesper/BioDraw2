import { useEffect, useMemo, useRef, useState } from 'react';
import { SkipBack, SkipForward, Play, Pause, Square, ChevronDown, Lock, Unlock } from 'lucide-react';
import { useEditorStore } from '../../state/editorStore';
import { downloadDocument, parseDocumentFile, clearAutoSave } from '../../infrastructure/documentSerializer';
import './ToolbarPanel.css';

export function ToolbarPanel() {
  const playbackStatus  = useEditorStore((s) => s.playbackStatus);
  const currentTimeMs   = useEditorStore((s) => s.currentTimeMs);
  const globalDurationMs = useEditorStore((s) => s.globalDurationMs);
  const playbackRate    = useEditorStore((s) => s.playbackRate);
  const playbackLoopEnabled = useEditorStore((s) => s.playbackLoopEnabled);
  const sequenceExportStatus  = useEditorStore((s) => s.sequenceExportStatus);
  const sequenceExportMessage = useEditorStore((s) => s.sequenceExportMessage);
  const videoExportStatus     = useEditorStore((s) => s.videoExportStatus);
  const setVideoExportStatus  = useEditorStore((s) => s.setVideoExportStatus);
  const videoExportMessage    = useEditorStore((s) => s.videoExportMessage);
  const past   = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const canvasWidth    = useEditorStore((s) => s.canvasWidth);
  const canvasHeight   = useEditorStore((s) => s.canvasHeight);
  const canvasBgColor  = useEditorStore((s) => s.canvasBgColor);
  const setCanvasSize  = useEditorStore((s) => s.setCanvasSize);
  const setCanvasBgColor = useEditorStore((s) => s.setCanvasBgColor);

  const play      = useEditorStore((s) => s.play);
  const pause     = useEditorStore((s) => s.pause);
  const stop      = useEditorStore((s) => s.stop);
  const setPlaybackRate = useEditorStore((s) => s.setPlaybackRate);
  const setPlaybackLoopEnabled = useEditorStore((s) => s.setPlaybackLoopEnabled);
  const stepPlaybackFrame  = useEditorStore((s) => s.stepPlaybackFrame);
  const requestSequenceExport = useEditorStore((s) => s.requestSequenceExport);
  const requestVideoExport    = useEditorStore((s) => s.requestVideoExport);
  const cancelExport          = useEditorStore((s) => s.cancelExport);
  const requestSingleFrameExport = useEditorStore((s) => s.requestSingleFrameExport);
  const setSequenceExportStatus  = useEditorStore((s) => s.setSequenceExportStatus);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const hasUnsavedChanges = useEditorStore((s) => s.hasUnsavedChanges);
  const currentFileName   = useEditorStore((s) => s.currentFileName) as string;
  const markSaved         = useEditorStore((s) => s.markSaved);
  const resetScene        = useEditorStore((s) => s.resetScene);
  const loadSnapshot      = useEditorStore((s) => s.loadSnapshot);
  const setCurrentFileName = useEditorStore((s) => s.setCurrentFileName);
  const isPreviewMode    = useEditorStore((s) => s.isPreviewMode);
  const setPreviewMode   = useEditorStore((s) => s.setPreviewMode);
  const isRatioLocked    = useEditorStore((s) => s.isRatioLocked);
  const setIsRatioLocked = useEditorStore((s) => s.setIsRatioLocked);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 文件名内联编辑状态
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const startEditingName = () => {
    setEditNameValue(currentFileName.replace(/\.biodraw$/, ''));
    setIsEditingName(true);
  };

  const confirmNameEdit = () => {
    const trimmed = editNameValue.trim();
    if (trimmed) {
      setCurrentFileName(trimmed + '.biodraw');
    }
    setIsEditingName(false);
  };

  const handleNew = () => {
    if (window.confirm('将清空当前场景，确认新建？')) {
      resetScene();
      clearAutoSave();
    }
  };

  const handleSave = () => {
    const state = useEditorStore.getState();
    downloadDocument({
      objects: state.objects,
      animations: state.animations,
      globalDurationMs: state.globalDurationMs,
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      canvasBgColor: state.canvasBgColor,
    }, currentFileName);
    markSaved();
  };

  const handleOpenClick = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as typeof window & {
          showOpenFilePicker: (opts: object) => Promise<FileSystemFileHandle[]>;
        }).showOpenFilePicker({
          types: [{ description: '动画文件', accept: { 'application/x-biodraw': ['.biodraw'] } }],
          excludeAcceptAllOption: true,
          multiple: false,
        });
        const file = await handle.getFile();
        const snapshot = await parseDocumentFile(file);
        loadSnapshot(snapshot);
        markSaved(file.name);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          alert(err instanceof Error ? err.message : '打开文件失败');
        }
      }
    } else {
      // 降级：旧浏览器回退到隐藏 input
      fileInputRef.current?.click();
    }
  };

  // 仅在旧浏览器降级路径中触发
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const snapshot = await parseDocumentFile(file);
      loadSnapshot(snapshot);
      markSaved(file.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : '打开文件失败');
    } finally {
      e.target.value = '';
    }
  };

  // 画布设置面板状态
  const [showCanvasPanel, setShowCanvasPanel] = useState(false);
  const [localCanvasW, setLocalCanvasW] = useState(canvasWidth);
  const [localCanvasH, setLocalCanvasH] = useState(canvasHeight);
  const [localHexColor, setLocalHexColor] = useState(canvasBgColor);
  useEffect(() => { setLocalHexColor(canvasBgColor); }, [canvasBgColor]);
  const canvasPanelRef = useRef<HTMLDivElement>(null);
  const loopBtnRef     = useRef<HTMLButtonElement>(null);
  const [canvasDropdownStyle, setCanvasDropdownStyle] = useState<{ width: number; right: number }>({ width: 220, right: 0 });

  useEffect(() => {
    if (!showCanvasPanel) return;
    const loop    = loopBtnRef.current;
    const exportW = exportPanelRef.current;
    const wrapper = canvasPanelRef.current;
    if (!loop || !exportW || !wrapper) return;
    const loopLeft     = loop.getBoundingClientRect().left;
    const exportRight  = exportW.getBoundingClientRect().right;
    const wrapperRight = wrapper.getBoundingClientRect().right;
    setCanvasDropdownStyle({ width: exportRight - loopLeft, right: wrapperRight - exportRight });
  }, [showCanvasPanel]);

  // 预览按钮右边界偏移（对齐 konvajs-content 右边界，动态测量）
  // ToolbarPanel 在预览模式下被卸载，退出时重新挂载。
  // 用 setTimeout(0) 推迟测量，确保 MaterialsPanel/InspectorPanel
  // 全部完成布局后再读取坐标，避免拿到过渡期间的错误值。
  const [previewRight, setPreviewRight] = useState(304);
  useEffect(() => {
    const update = () => {
      const el = document.querySelector('.konvajs-content') as HTMLElement | null;
      if (el) {
        setPreviewRight(window.innerWidth - el.getBoundingClientRect().right);
      }
    };
    const timer = setTimeout(update, 0);
    window.addEventListener('resize', update);
    const wrapper = document.querySelector('.canvas-wrapper');
    const ro = new ResizeObserver(update);
    if (wrapper) ro.observe(wrapper);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, []);

  // 速率下拉状态
  const [showRateMenu, setShowRateMenu] = useState(false);
  const rateMenuRef = useRef<HTMLDivElement>(null);

  // 导出面板状态
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportWidth,  setExportWidth]  = useState(1280);
  const [exportHeight, setExportHeight] = useState(720);
  const [exportFps,    setExportFps]    = useState(24);
  const [videoFormat,  setVideoFormat]  = useState<'mp4' | 'webm'>('mp4');
  const exportPanelRef = useRef<HTMLDivElement>(null);
  const [exportDropdownWidth,   setExportDropdownWidth]   = useState(280);
  const [exportIsRatioLocked,  setExportIsRatioLocked]  = useState(false);

  useEffect(() => {
    if (!showExportPanel) return;
    const loop    = loopBtnRef.current;
    const exportW = exportPanelRef.current;
    if (!loop || !exportW) return;
    setExportDropdownWidth(exportW.getBoundingClientRect().right - loop.getBoundingClientRect().left);
  }, [showExportPanel]);


  // 点击外部关闭画布设置面板
  useEffect(() => {
    if (!showCanvasPanel) return;
    const handler = (e: MouseEvent) => {
      if (canvasPanelRef.current && !canvasPanelRef.current.contains(e.target as Node)) {
        setShowCanvasPanel(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showCanvasPanel]);

  // 点击外部关闭速率菜单
  useEffect(() => {
    if (!showRateMenu) return;
    const handler = (e: MouseEvent) => {
      if (rateMenuRef.current && !rateMenuRef.current.contains(e.target as Node)) {
        setShowRateMenu(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showRateMenu]);

  // 点击外部关闭导出面板
  useEffect(() => {
    if (!showExportPanel) return;
    const handler = (e: MouseEvent) => {
      if (exportPanelRef.current && !exportPanelRef.current.contains(e.target as Node)) {
        setShowExportPanel(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showExportPanel]);

  const [exportStartSec, setExportStartSec] = useState('0');
  const [exportEndSec,   setExportEndSec]   = useState(() => (globalDurationMs / 1000).toFixed(2));
  // globalDurationMs 变化时，若终点超出新时长则自动收缩
  useEffect(() => {
    const maxS = globalDurationMs / 1000;
    setExportEndSec((prev) => {
      const v = parseFloat(prev);
      return isNaN(v) || v > maxS ? maxS.toFixed(2) : prev;
    });
  }, [globalDurationMs]);
  const exportStartMs = Math.max(0, Math.round((parseFloat(exportStartSec) || 0) * 1000));
  const exportEndMs   = Math.min(globalDurationMs, Math.round((parseFloat(exportEndSec) || globalDurationMs / 1000) * 1000));
  const exportRange   = { startMs: exportStartMs, endMs: exportEndMs };

  const exportSize = useMemo(() => ({
    width:  Math.max(16, Math.round(exportWidth)),
    height: Math.max(16, Math.round(exportHeight)),
    fps:    Math.max(1, Math.min(60, Math.round(exportFps))),
  }), [exportWidth, exportHeight, exportFps]);

  const isExporting = sequenceExportStatus === 'running' || videoExportStatus === 'running';
  const isPlaying   = playbackStatus === 'playing';

  const triggerSequenceExport = () => {
    requestSequenceExport({ ...exportSize, ...exportRange, prefix: 'biodraw-frame' });
    setShowExportPanel(false);
  };
  const triggerVideoExport = () => {
    requestVideoExport({ ...exportSize, ...exportRange, prefix: 'biodraw-video', format: videoFormat });
    setShowExportPanel(false);
  };

  const playbackRateOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  const exportFpsOptions    = [12, 24, 30, 60];

  const exportStatusText = useMemo(() => {
    if (videoExportStatus === 'running')     return `视频导出中${videoExportMessage ? ` · ${videoExportMessage}` : ''}`;
    if (sequenceExportStatus === 'running')  return `序列帧导出中${sequenceExportMessage ? ` · ${sequenceExportMessage}` : ''}`;
    if (videoExportStatus === 'error')       return `视频导出失败${videoExportMessage ? `: ${videoExportMessage}` : ''}`;
    if (sequenceExportStatus === 'error')    return `序列帧导出失败${sequenceExportMessage ? `: ${sequenceExportMessage}` : ''}`;
    if (videoExportStatus === 'done')        return '视频导出完成';
    if (sequenceExportStatus === 'done')     return '序列帧导出完成';
    return null;
  }, [sequenceExportMessage, sequenceExportStatus, videoExportMessage, videoExportStatus]);

  const isExportError = videoExportStatus === 'error' || sequenceExportStatus === 'error';

  // 导出完成或出错后 3 秒自动重置状态
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

  // 解析序列帧导出进度
  let exportProgress = 0;
  const progressMatch = sequenceExportMessage?.match(/^(\d+)\/(\d+)/);
  if (progressMatch) {
    exportProgress = parseInt(progressMatch[1]) / parseInt(progressMatch[2]);
  }

  return (
    <header className="tb-panel">

      {/* ── 左区：Logo + 文件操作 + 撤销重做 */}
      <div className="tb-left">
        {/* 品牌 + 文件名：固定宽度，对齐 konvajs-content 左边缘 */}
        <div className="tb-brand">
          <span className="tb-logo">BioDraw</span>
          <div className="tb-divider" />
          {isEditingName ? (
            <div className="tb-filename-wrap">
              <input
                className="tb-filename-input"
                value={editNameValue}
                maxLength={24}
                autoFocus
                onChange={(e) => setEditNameValue(e.target.value)}
                onBlur={confirmNameEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.currentTarget.blur(); }
                  if (e.key === 'Escape') { setIsEditingName(false); }
                }}
              />
            </div>
          ) : (
            <span
              className="tb-filename"
              title="点击重命名"
              onClick={startEditingName}
            >
              {currentFileName.replace(/\.biodraw$/, '')}{hasUnsavedChanges ? ' *' : ''}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".biodraw"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button className="tb-btn" onClick={handleNew}>新建</button>
        <button className="tb-btn" onClick={handleOpenClick}>打开</button>
        <button className="tb-btn" onClick={handleSave} title={hasUnsavedChanges ? '有未保存的修改' : '保存文档 (Ctrl+S)'}>
          保存
        </button>
        <div className="tb-divider" />
        <button className="tb-btn tb-undo-btn" onClick={undo} disabled={past.length === 0} title="撤销 (Ctrl+Z)">
          ↩ 撤销
        </button>
        <button className="tb-btn tb-undo-btn" onClick={redo} disabled={future.length === 0} title="重做 (Ctrl+Y)">
          ↪ 重做
        </button>
      </div>

      {/* ── 绝对居中：播放四键，与 konvajs-content 中心对齐 */}
      <div className="tb-playback">
        <button className="tb-pb-btn" onClick={() => stepPlaybackFrame(-1)} title="上一帧">
          <SkipBack size={15} strokeWidth={2} />
        </button>
        <button
          className={`tb-pb-btn tb-pb-play${isPlaying ? ' tb-pb-playing' : ''}`}
          onClick={isPlaying ? pause : play}
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying
            ? <Pause size={14} strokeWidth={2.5} fill="currentColor" />
            : <Play  size={14} strokeWidth={2.5} fill="currentColor" />}
        </button>
        <button className="tb-pb-btn" onClick={stop} title="停止">
          <Square size={12} strokeWidth={0} fill="currentColor" />
        </button>
        <button className="tb-pb-btn" onClick={() => stepPlaybackFrame(1)} title="下一帧">
          <SkipForward size={15} strokeWidth={2} />
        </button>
      </div>

      {/* ── 右侧控制组：[1x][循环] | [画布][预览][导出]，整组右边界对齐 konvajs-content */}
      <div className="tb-right-group" style={{ right: previewRight }}>
        {/* 速率 */}
        <div className="tb-rate-wrap" ref={rateMenuRef}>
          <button
            className={`tb-btn tb-rate-btn${showRateMenu ? ' is-active' : ''}`}
            onClick={() => setShowRateMenu((p) => !p)}
            title="播放速率"
          >
            {playbackRate}x
            <ChevronDown size={11} strokeWidth={2.5} className={`tb-rate-chevron${showRateMenu ? ' is-open' : ''}`} />
          </button>
          {showRateMenu && (
            <div className="tb-rate-menu">
              {playbackRateOptions.map((r) => (
                <button
                  key={r}
                  className={`tb-rate-option${r === playbackRate ? ' is-active' : ''}`}
                  onClick={() => { setPlaybackRate(r); setShowRateMenu(false); }}
                >
                  {r}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 循环 */}
        <button
          ref={loopBtnRef}
          className={`tb-btn${playbackLoopEnabled ? ' is-active' : ''}`}
          onClick={() => setPlaybackLoopEnabled(!playbackLoopEnabled)}
        >
          循环
        </button>

        <div className="tb-divider" />

        {/* 画布设置 */}
        <div className="tb-export-wrap" ref={canvasPanelRef}>
          <button
            className={`tb-btn tb-export-btn${showCanvasPanel ? ' is-open' : ''}`}
            onClick={() => {
              setLocalCanvasW(canvasWidth);
              setLocalCanvasH(canvasHeight);
              setShowCanvasPanel((p) => !p);
            }}
          >
            画布 ▾
          </button>
          {showCanvasPanel && (
            <div className="tb-export-panel" style={{ width: canvasDropdownStyle.width, right: canvasDropdownStyle.right }}>
              <div className="tb-canvas-content">
                <div className="tb-export-title tb-canvas-content-full">画布设置</div>
                <span className="tb-canvas-size-label">宽/高 (px)</span>
                <div className="tb-canvas-controls">
                  <input
                    className="tb-canvas-size-input"
                    type="number" min={100}
                    value={localCanvasW}
                    onChange={(e) => {
                      const w = parseInt(e.target.value || '1280', 10);
                      setLocalCanvasW(w);
                      if (isRatioLocked) setLocalCanvasH(Math.round(w * canvasHeight / canvasWidth));
                    }}
                    onBlur={() => setCanvasSize(localCanvasW, localCanvasH)}
                    onKeyDown={(e) => e.key === 'Enter' && setCanvasSize(localCanvasW, localCanvasH)}
                  />
                  <input
                    className="tb-canvas-size-input"
                    type="number" min={100}
                    value={localCanvasH}
                    onChange={(e) => {
                      const h = parseInt(e.target.value || '720', 10);
                      setLocalCanvasH(h);
                      if (isRatioLocked) setLocalCanvasW(Math.round(h * canvasWidth / canvasHeight));
                    }}
                    onBlur={() => setCanvasSize(localCanvasW, localCanvasH)}
                    onKeyDown={(e) => e.key === 'Enter' && setCanvasSize(localCanvasW, localCanvasH)}
                  />
                  <button
                    className={`tb-canvas-lock-btn${isRatioLocked ? ' is-locked' : ''}`}
                    onClick={() => setIsRatioLocked(!isRatioLocked)}
                    title={isRatioLocked ? '解锁宽高比' : '锁定宽高比'}
                  >
                    {isRatioLocked ? <Lock size={12} strokeWidth={2} /> : <Unlock size={12} strokeWidth={2} />}
                  </button>
                </div>
                <span className="tb-canvas-size-label">背景颜色</span>
                <div className="tb-canvas-controls">
                  <input
                    type="color"
                    value={canvasBgColor}
                    onChange={(e) => setCanvasBgColor(e.target.value)}
                    className="tb-canvas-color-picker"
                    title="选取颜色"
                  />
                  <input
                    type="text"
                    className="tb-canvas-size-input"
                    value={localHexColor}
                    onChange={(e) => {
                      setLocalHexColor(e.target.value);
                      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setCanvasBgColor(e.target.value);
                    }}
                    onBlur={() => setLocalHexColor(canvasBgColor)}
                    maxLength={7}
                    spellCheck={false}
                  />
                  <button
                    className="tb-canvas-lock-btn"
                    onClick={() => {
                      setLocalCanvasW(1280);
                      setLocalCanvasH(720);
                      setCanvasSize(1280, 720);
                      setCanvasBgColor('#ffffff');
                    }}
                    title="恢复默认设置"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                  </button>
                </div>
                <div className="tb-canvas-swatches tb-canvas-content-full">
                  {['#ffffff', '#f8fafc', '#e2e8f0', '#f0fdf4', '#1e3a5f', '#0f172a'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCanvasBgColor(c)}
                      title={c}
                      style={{
                        width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
                        background: c, border: canvasBgColor === c ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 预览 */}
        <button
          className={`tb-btn${isPreviewMode ? ' is-active' : ''}`}
          onClick={() => setPreviewMode(!isPreviewMode)}
          title="全屏预览 (F)"
        >
          {isPreviewMode ? '退出预览' : '预览 ⛶'}
        </button>

        {/* 导出（最右，右边界对齐 konvajs-content） */}
        <div className="tb-export-wrap" ref={exportPanelRef}>
          <button
            className={`tb-btn tb-export-btn${showExportPanel ? ' is-open' : ''}`}
            onClick={() => setShowExportPanel((p) => !p)}
            disabled={isExporting}
          >
            {isExporting ? '导出中…' : '导出 ▾'}
          </button>
          {showExportPanel && (
            <div className="tb-export-panel" style={{ width: exportDropdownWidth }}>
              <div className="tb-canvas-content">
                <div className="tb-export-title tb-canvas-content-full">导出设置</div>
                <span className="tb-canvas-size-label">分辨率</span>
                <div className="tb-canvas-controls">
                  <input
                    className="tb-canvas-size-input" type="number" min={16}
                    value={exportWidth}
                    onChange={(e) => {
                      const w = parseInt(e.target.value || '1280', 10);
                      setExportWidth(w);
                      if (exportIsRatioLocked) setExportHeight(Math.round(w * canvasHeight / canvasWidth));
                    }}
                  />
                  <input
                    className="tb-canvas-size-input" type="number" min={16}
                    value={exportHeight}
                    onChange={(e) => {
                      const h = parseInt(e.target.value || '720', 10);
                      setExportHeight(h);
                      if (exportIsRatioLocked) setExportWidth(Math.round(h * canvasWidth / canvasHeight));
                    }}
                  />
                  <button
                    className={`tb-canvas-lock-btn${exportIsRatioLocked ? ' is-locked' : ''}`}
                    onClick={() => setExportIsRatioLocked((p) => !p)}
                    title={exportIsRatioLocked ? '解锁宽高比' : '锁定宽高比'}
                  >
                    {exportIsRatioLocked ? <Lock size={12} strokeWidth={2} /> : <Unlock size={12} strokeWidth={2} />}
                  </button>
                </div>
                <span className="tb-canvas-size-label">FPS/格式</span>
                <div className="tb-canvas-controls">
                  <select className="tb-canvas-size-input" value={exportFps} onChange={(e) => setExportFps(parseInt(e.target.value, 10))}>
                    {exportFpsOptions.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select className="tb-canvas-size-input" value={videoFormat} onChange={(e) => setVideoFormat(e.target.value as 'mp4' | 'webm')}>
                    <option value="mp4">MP4</option>
                    <option value="webm">WebM</option>
                  </select>
                  <button
                    className="tb-canvas-lock-btn"
                    onClick={() => { setExportFps(24); setVideoFormat('mp4'); }}
                    title="恢复默认值"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                    </svg>
                  </button>
                </div>
                <span className="tb-canvas-size-label">导出范围</span>
                <div className="tb-canvas-controls">
                  <input
                    className="tb-canvas-size-input"
                    type="number" min={0} step={0.01}
                    value={exportStartSec}
                    onChange={(e) => setExportStartSec(e.target.value)}
                    onBlur={() => {
                      const v = parseFloat(exportStartSec);
                      setExportStartSec(isNaN(v) ? '0.00' : Math.max(0, v).toFixed(2));
                    }}
                  />
                  <input
                    className="tb-canvas-size-input"
                    type="number" min={0} step={0.01}
                    value={exportEndSec}
                    onChange={(e) => setExportEndSec(e.target.value)}
                    onBlur={() => {
                      const v = parseFloat(exportEndSec);
                      const maxS = globalDurationMs / 1000;
                      setExportEndSec(isNaN(v) ? maxS.toFixed(2) : Math.min(maxS, Math.max(0, v)).toFixed(2));
                    }}
                  />
                  <button
                    className="tb-canvas-lock-btn"
                    onClick={() => { setExportStartSec('0.00'); setExportEndSec((globalDurationMs / 1000).toFixed(2)); }}
                    title="恢复默认范围"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                    </svg>
                  </button>
                </div>
                <div className="tb-export-actions tb-canvas-content-full">
                  <div className="tb-export-action-row">
                    <button
                      className="tb-export-action-btn"
                      onClick={() => { requestSingleFrameExport(); setShowExportPanel(false); }}
                      disabled={isExporting}
                      title={`导出当前帧（${(currentTimeMs / 1000).toFixed(2)}s）为 PNG`}
                    >
                      导出当前帧
                    </button>
                    <button className="tb-export-action-btn" onClick={triggerSequenceExport} disabled={isExporting}>
                      导出序列帧
                    </button>
                  </div>
                  <button className="tb-export-action-btn tb-export-action-primary" onClick={triggerVideoExport} disabled={isExporting}>
                    导出视频
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 导出状态与进度（浮于中区，不影响布局） */}
      {(exportStatusText || isExporting) && (
        <div className="tb-export-status">
          {exportStatusText && (
            <span className={`tb-status${isExportError ? ' is-error' : ''}`}>
              {exportStatusText}
            </span>
          )}
          {isExporting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {sequenceExportStatus === 'running' && (
                <div style={{ width: 80, height: 4, background: 'var(--border-color)', borderRadius: 2 }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round(exportProgress * 100)}%`,
                    background: 'var(--primary-color, #3b82f6)',
                    borderRadius: 2,
                    transition: 'width 0.1s linear',
                  }} />
                </div>
              )}
              <button
                className="tb-btn"
                style={{ fontSize: 11, padding: '1px 6px', color: 'var(--error-color, #ef4444)' }}
                onClick={cancelExport}
                title="取消导出"
              >
                取消
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
