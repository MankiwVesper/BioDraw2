import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../../state/editorStore';
import './ToolbarPanel.css';

export function ToolbarPanel() {
  const playbackStatus = useEditorStore((state) => state.playbackStatus);
  const currentTimeMs = useEditorStore((state) => state.currentTimeMs);
  const globalDurationMs = useEditorStore((state) => state.globalDurationMs);
  const playbackRate = useEditorStore((state) => state.playbackRate);
  const playbackLoopEnabled = useEditorStore((state) => state.playbackLoopEnabled);
  const playbackRegionLoopEnabled = useEditorStore((state) => state.playbackRegionLoopEnabled);
  const playbackLoopInMs = useEditorStore((state) => state.playbackLoopInMs);
  const playbackLoopOutMs = useEditorStore((state) => state.playbackLoopOutMs);

  const sequenceExportStatus = useEditorStore((state) => state.sequenceExportStatus);
  const sequenceExportMessage = useEditorStore((state) => state.sequenceExportMessage);
  const videoExportStatus = useEditorStore((state) => state.videoExportStatus);
  const videoExportMessage = useEditorStore((state) => state.videoExportMessage);

  const play = useEditorStore((state) => state.play);
  const pause = useEditorStore((state) => state.pause);
  const stop = useEditorStore((state) => state.stop);
  const advancePlayback = useEditorStore((state) => state.advancePlayback);
  const setPlaybackRate = useEditorStore((state) => state.setPlaybackRate);
  const setPlaybackLoopEnabled = useEditorStore((state) => state.setPlaybackLoopEnabled);
  const setPlaybackRegionLoopEnabled = useEditorStore((state) => state.setPlaybackRegionLoopEnabled);
  const setPlaybackLoopInMs = useEditorStore((state) => state.setPlaybackLoopInMs);
  const setPlaybackLoopOutMs = useEditorStore((state) => state.setPlaybackLoopOutMs);
  const clearPlaybackLoopRegion = useEditorStore((state) => state.clearPlaybackLoopRegion);
  const stepPlaybackFrame = useEditorStore((state) => state.stepPlaybackFrame);
  const requestSequenceExport = useEditorStore((state) => state.requestSequenceExport);
  const requestVideoExport = useEditorStore((state) => state.requestVideoExport);

  const [exportWidth, setExportWidth] = useState(1280);
  const [exportHeight, setExportHeight] = useState(720);
  const [exportFps, setExportFps] = useState(24);
  const [videoFormat, setVideoFormat] = useState<'mp4' | 'webm'>('mp4');

  useEffect(() => {
    if (playbackStatus !== 'playing') return;
    let rafId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      advancePlayback(delta);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playbackStatus, advancePlayback]);

  const isRegionLoopValid = useMemo(() => {
    if (playbackLoopInMs === null || playbackLoopOutMs === null) return false;
    return playbackLoopOutMs > playbackLoopInMs;
  }, [playbackLoopInMs, playbackLoopOutMs]);

  const exportRange = useMemo(() => {
    const useLoopRegion = playbackRegionLoopEnabled && isRegionLoopValid;
    return {
      startMs: useLoopRegion ? (playbackLoopInMs || 0) : 0,
      endMs: useLoopRegion ? (playbackLoopOutMs || globalDurationMs) : globalDurationMs,
    };
  }, [
    globalDurationMs,
    isRegionLoopValid,
    playbackLoopInMs,
    playbackLoopOutMs,
    playbackRegionLoopEnabled,
  ]);

  const exportSize = useMemo(() => ({
    width: Math.max(16, Math.round(exportWidth)),
    height: Math.max(16, Math.round(exportHeight)),
    fps: Math.max(1, Math.min(60, Math.round(exportFps))),
  }), [exportWidth, exportHeight, exportFps]);

  const isExporting = sequenceExportStatus === 'running' || videoExportStatus === 'running';

  const triggerSequenceExport = () => {
    requestSequenceExport({
      ...exportSize,
      ...exportRange,
      prefix: 'biodraw-frame',
    });
  };

  const triggerVideoExport = () => {
    requestVideoExport({
      ...exportSize,
      ...exportRange,
      prefix: 'biodraw-video',
      format: videoFormat,
    });
  };

  const statusText =
    playbackStatus === 'playing'
      ? '播放中'
      : playbackStatus === 'paused'
        ? '已暂停'
        : '就绪';

  const timeLabel = `${(currentTimeMs / 1000).toFixed(2)}s / ${(globalDurationMs / 1000).toFixed(2)}s`;
  const loopRegionLabel = `${playbackLoopInMs ?? '-'} ~ ${playbackLoopOutMs ?? '-'}`;
  const playbackRateOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  const exportFpsOptions = [12, 24, 30, 60];

  const exportStatus = useMemo(() => {
    if (videoExportStatus === 'running') {
      return { level: 'normal' as const, text: `视频导出中${videoExportMessage ? ` (${videoExportMessage})` : ''}` };
    }
    if (sequenceExportStatus === 'running') {
      return { level: 'normal' as const, text: `序列帧导出中${sequenceExportMessage ? ` (${sequenceExportMessage})` : ''}` };
    }
    if (videoExportStatus === 'error') {
      return { level: 'warning' as const, text: `视频导出失败${videoExportMessage ? `: ${videoExportMessage}` : ''}` };
    }
    if (sequenceExportStatus === 'error') {
      return { level: 'warning' as const, text: `序列帧导出失败${sequenceExportMessage ? `: ${sequenceExportMessage}` : ''}` };
    }
    if (videoExportStatus === 'done') {
      return { level: 'normal' as const, text: `视频导出完成${videoExportMessage ? ` (${videoExportMessage})` : ''}` };
    }
    if (sequenceExportStatus === 'done') {
      return { level: 'normal' as const, text: `序列帧导出完成${sequenceExportMessage ? ` (${sequenceExportMessage})` : ''}` };
    }
    return null;
  }, [
    sequenceExportMessage,
    sequenceExportStatus,
    videoExportMessage,
    videoExportStatus,
  ]);

  return (
    <header className="toolbar-panel">
      <div className="toolbar-left">
        <div className="logo">BioDraw</div>
        <div className="menu-items">
          <button className="menu-btn">新建</button>
          <button className="menu-btn">保存</button>
          <button
            className="menu-btn"
            onClick={triggerSequenceExport}
            disabled={isExporting}
          >
            导出序列帧
          </button>
          <button
            className="menu-btn"
            onClick={triggerVideoExport}
            disabled={isExporting}
          >
            导出视频
          </button>
        </div>
      </div>

      <div className="toolbar-center">
        <div className="play-controls">
          <button className="control-btn play" onClick={play}>播放</button>
          <button className="control-btn pause" onClick={pause}>暂停</button>
          <button className="control-btn stop" onClick={stop}>停止</button>
          <button className="control-btn" onClick={() => stepPlaybackFrame(-1)}>逐帧-</button>
          <button className="control-btn" onClick={() => stepPlaybackFrame(1)}>逐帧+</button>
        </div>

        <div className="playback-advanced-controls">
          <label className="playback-rate-field">
            速率
            <select value={playbackRate} onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}>
              {playbackRateOptions.map((rate) => (
                <option key={rate} value={rate}>{rate}x</option>
              ))}
            </select>
          </label>

          <button
            className={`control-btn${playbackLoopEnabled ? ' is-active' : ''}`}
            onClick={() => setPlaybackLoopEnabled(!playbackLoopEnabled)}
            title="时间轴全局循环"
          >
            循环
          </button>

          <button
            className={`control-btn${playbackRegionLoopEnabled ? ' is-active' : ''}`}
            onClick={() => setPlaybackRegionLoopEnabled(!playbackRegionLoopEnabled)}
            title="启用 In/Out 区域循环"
          >
            区域循环
          </button>

          <button className="control-btn" onClick={() => setPlaybackLoopInMs(currentTimeMs)} title="将当前时间设为 In 点">
            设 In
          </button>

          <button className="control-btn" onClick={() => setPlaybackLoopOutMs(currentTimeMs)} title="将当前时间设为 Out 点">
            设 Out
          </button>

          <button className="control-btn" onClick={() => clearPlaybackLoopRegion()} title="清除 In/Out 区间">
            清 In/Out
          </button>

          <div className="export-controls">
            <label className="playback-rate-field">
              分辨率
              <input
                type="number"
                min={16}
                value={exportWidth}
                onChange={(e) => setExportWidth(parseInt(e.target.value || '1280', 10))}
              />
              <span>x</span>
              <input
                type="number"
                min={16}
                value={exportHeight}
                onChange={(e) => setExportHeight(parseInt(e.target.value || '720', 10))}
              />
            </label>

            <label className="playback-rate-field">
              FPS
              <select value={exportFps} onChange={(e) => setExportFps(parseInt(e.target.value, 10))}>
                {exportFpsOptions.map((fps) => (
                  <option key={fps} value={fps}>{fps}</option>
                ))}
              </select>
            </label>

            <label className="playback-rate-field">
              视频格式
              <select value={videoFormat} onChange={(e) => setVideoFormat(e.target.value as 'mp4' | 'webm')}>
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
              </select>
            </label>

            <button className="control-btn" onClick={triggerSequenceExport} disabled={isExporting} title="导出 PNG 序列帧">
              {sequenceExportStatus === 'running' ? '导出中...' : '导出序列帧'}
            </button>

            <button className="control-btn" onClick={triggerVideoExport} disabled={isExporting} title="导出视频">
              {videoExportStatus === 'running' ? '导出中...' : '导出视频'}
            </button>
          </div>
        </div>
      </div>

      <div className="toolbar-right">
        <span className="status-text">{statusText}</span>
        <span className="status-text">{timeLabel}</span>
        <span className={`status-text${playbackRegionLoopEnabled && !isRegionLoopValid ? ' status-warning' : ''}`}>
          区间 {loopRegionLabel}
        </span>
        {exportStatus && (
          <span className={`status-text${exportStatus.level === 'warning' ? ' status-warning' : ''}`}>
            {exportStatus.text}
          </span>
        )}
      </div>
    </header>
  );
}
