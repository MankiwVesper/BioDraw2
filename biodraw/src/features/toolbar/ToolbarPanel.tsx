import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../state/editorStore';
import './ToolbarPanel.css';

export function ToolbarPanel() {
  const playbackStatus  = useEditorStore((s) => s.playbackStatus);
  const currentTimeMs   = useEditorStore((s) => s.currentTimeMs);
  const globalDurationMs = useEditorStore((s) => s.globalDurationMs);
  const playbackRate    = useEditorStore((s) => s.playbackRate);
  const playbackLoopEnabled = useEditorStore((s) => s.playbackLoopEnabled);
  const playbackRegionLoopEnabled = useEditorStore((s) => s.playbackRegionLoopEnabled);
  const playbackLoopInMs  = useEditorStore((s) => s.playbackLoopInMs);
  const playbackLoopOutMs = useEditorStore((s) => s.playbackLoopOutMs);
  const sequenceExportStatus  = useEditorStore((s) => s.sequenceExportStatus);
  const sequenceExportMessage = useEditorStore((s) => s.sequenceExportMessage);
  const videoExportStatus     = useEditorStore((s) => s.videoExportStatus);
  const videoExportMessage    = useEditorStore((s) => s.videoExportMessage);
  const past   = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);

  const play      = useEditorStore((s) => s.play);
  const pause     = useEditorStore((s) => s.pause);
  const stop      = useEditorStore((s) => s.stop);
  const advancePlayback = useEditorStore((s) => s.advancePlayback);
  const setPlaybackRate = useEditorStore((s) => s.setPlaybackRate);
  const setPlaybackLoopEnabled = useEditorStore((s) => s.setPlaybackLoopEnabled);
  const setPlaybackRegionLoopEnabled = useEditorStore((s) => s.setPlaybackRegionLoopEnabled);
  const setPlaybackLoopInMs  = useEditorStore((s) => s.setPlaybackLoopInMs);
  const setPlaybackLoopOutMs = useEditorStore((s) => s.setPlaybackLoopOutMs);
  const clearPlaybackLoopRegion = useEditorStore((s) => s.clearPlaybackLoopRegion);
  const stepPlaybackFrame  = useEditorStore((s) => s.stepPlaybackFrame);
  const requestSequenceExport = useEditorStore((s) => s.requestSequenceExport);
  const requestVideoExport    = useEditorStore((s) => s.requestVideoExport);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  // 导出面板状态
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportWidth,  setExportWidth]  = useState(1280);
  const [exportHeight, setExportHeight] = useState(720);
  const [exportFps,    setExportFps]    = useState(24);
  const [videoFormat,  setVideoFormat]  = useState<'mp4' | 'webm'>('mp4');
  const exportPanelRef = useRef<HTMLDivElement>(null);

  // RAF 驱动播放
  useEffect(() => {
    if (playbackStatus !== 'playing') return;
    let rafId = 0, last = performance.now();
    const tick = (now: number) => {
      advancePlayback(now - last);
      last = now;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playbackStatus, advancePlayback]);

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

  const isRegionLoopValid = useMemo(() => {
    if (playbackLoopInMs === null || playbackLoopOutMs === null) return false;
    return playbackLoopOutMs > playbackLoopInMs;
  }, [playbackLoopInMs, playbackLoopOutMs]);

  const exportRange = useMemo(() => {
    const useRegion = playbackRegionLoopEnabled && isRegionLoopValid;
    return {
      startMs: useRegion ? (playbackLoopInMs ?? 0) : 0,
      endMs:   useRegion ? (playbackLoopOutMs ?? globalDurationMs) : globalDurationMs,
    };
  }, [globalDurationMs, isRegionLoopValid, playbackLoopInMs, playbackLoopOutMs, playbackRegionLoopEnabled]);

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

  const timeLabel = `${(currentTimeMs / 1000).toFixed(2)}s / ${(globalDurationMs / 1000).toFixed(2)}s`;
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

  return (
    <header className="tb-panel">

      {/* ── 左区：Logo + 文件操作 + 撤销重做 */}
      <div className="tb-left">
        <span className="tb-logo">BioDraw</span>
        <div className="tb-divider" />
        <button className="tb-btn">新建</button>
        <button className="tb-btn">保存</button>
        <div className="tb-divider" />
        <button className="tb-btn tb-undo-btn" onClick={undo} disabled={past.length === 0} title="撤销 (Ctrl+Z)">
          ↩ 撤销
        </button>
        <button className="tb-btn tb-undo-btn" onClick={redo} disabled={future.length === 0} title="重做 (Ctrl+Shift+Z)">
          ↪ 重做
        </button>
      </div>

      {/* ── 中区：播放控制 */}
      <div className="tb-center">
        {/* 逐帧 / 播放 / 停止 */}
        <div className="tb-playback">
          <button className="tb-icon-btn" onClick={() => stepPlaybackFrame(-1)} title="上一帧">
            ⏮
          </button>
          <button
            className={`tb-play-btn${isPlaying ? ' is-playing' : ''}`}
            onClick={isPlaying ? pause : play}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="tb-icon-btn" onClick={stop} title="停止">
            ⏹
          </button>
          <button className="tb-icon-btn" onClick={() => stepPlaybackFrame(1)} title="下一帧">
            ⏭
          </button>
        </div>

        {/* 时间显示 */}
        <span className="tb-time">{timeLabel}</span>

        <div className="tb-divider" />

        {/* 速率 */}
        <label className="tb-field">
          <span className="tb-field-label">速率</span>
          <select
            className="tb-select"
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
          >
            {playbackRateOptions.map((r) => (
              <option key={r} value={r}>{r}x</option>
            ))}
          </select>
        </label>

        <div className="tb-divider" />

        {/* 循环控制 */}
        <button
          className={`tb-btn${playbackLoopEnabled ? ' is-active' : ''}`}
          onClick={() => setPlaybackLoopEnabled(!playbackLoopEnabled)}
          title="全局循环"
        >
          循环
        </button>
        <button
          className={`tb-btn${playbackRegionLoopEnabled ? ' is-active' : ''}`}
          onClick={() => setPlaybackRegionLoopEnabled(!playbackRegionLoopEnabled)}
          title="区域循环"
        >
          区域
        </button>
        <button className="tb-btn tb-btn-sm" onClick={() => setPlaybackLoopInMs(currentTimeMs)} title="设置 In 点">
          设In
        </button>
        <button className="tb-btn tb-btn-sm" onClick={() => setPlaybackLoopOutMs(currentTimeMs)} title="设置 Out 点">
          设Out
        </button>
        {(playbackLoopInMs !== null || playbackLoopOutMs !== null) && (
          <button className="tb-btn tb-btn-sm" onClick={clearPlaybackLoopRegion} title="清除区域">
            清除
          </button>
        )}
      </div>

      {/* ── 右区：导出 + 状态 */}
      <div className="tb-right">
        {exportStatusText && (
          <span className={`tb-status${isExportError ? ' is-error' : ''}`}>
            {exportStatusText}
          </span>
        )}

        {/* 导出按钮 + 下拉面板 */}
        <div className="tb-export-wrap" ref={exportPanelRef}>
          <button
            className={`tb-export-btn${showExportPanel ? ' is-open' : ''}`}
            onClick={() => setShowExportPanel((p) => !p)}
            disabled={isExporting}
          >
            {isExporting ? '导出中…' : '导出 ▾'}
          </button>

          {showExportPanel && (
            <div className="tb-export-panel">
              <div className="tb-export-title">导出设置</div>

              <div className="tb-export-fields">
                <label className="tb-export-label">
                  宽度
                  <input type="number" min={16} value={exportWidth} onChange={(e) => setExportWidth(parseInt(e.target.value || '1280', 10))} />
                </label>
                <label className="tb-export-label">
                  高度
                  <input type="number" min={16} value={exportHeight} onChange={(e) => setExportHeight(parseInt(e.target.value || '720', 10))} />
                </label>
                <label className="tb-export-label">
                  FPS
                  <select value={exportFps} onChange={(e) => setExportFps(parseInt(e.target.value, 10))}>
                    {exportFpsOptions.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <label className="tb-export-label">
                  视频格式
                  <select value={videoFormat} onChange={(e) => setVideoFormat(e.target.value as 'mp4' | 'webm')}>
                    <option value="mp4">MP4</option>
                    <option value="webm">WebM</option>
                  </select>
                </label>
              </div>

              <div className="tb-export-range">
                导出范围：{(exportRange.startMs / 1000).toFixed(2)}s — {(exportRange.endMs / 1000).toFixed(2)}s
                {playbackRegionLoopEnabled && isRegionLoopValid && <span className="tb-export-range-badge">区域</span>}
              </div>

              <div className="tb-export-actions">
                <button className="tb-export-action-btn" onClick={triggerSequenceExport}>
                  导出 PNG 序列帧
                </button>
                <button className="tb-export-action-btn tb-export-action-primary" onClick={triggerVideoExport}>
                  导出视频
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
