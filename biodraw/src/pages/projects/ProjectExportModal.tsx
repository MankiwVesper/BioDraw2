import { useEffect, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { CanvasPanel } from '../../features/canvas-panel/CanvasPanel';
import { useEditorStore } from '../../state/editorStore';
import { getProject } from '../../infrastructure/projectService';
import './ProjectExportModal.css';

interface Props {
  projectId: string;
  title: string;
  onClose: () => void;
}

export function ProjectExportModal({ projectId, title, onClose }: Props) {
  const loadSnapshot         = useEditorStore((s) => s.loadSnapshot);
  const canvasWidth          = useEditorStore((s) => s.canvasWidth);
  const canvasHeight         = useEditorStore((s) => s.canvasHeight);
  const globalDurationMs     = useEditorStore((s) => s.globalDurationMs);
  const videoExportStatus    = useEditorStore((s) => s.videoExportStatus);
  const videoExportMessage   = useEditorStore((s) => s.videoExportMessage);
  const sequenceExportStatus = useEditorStore((s) => s.sequenceExportStatus);
  const sequenceExportMessage = useEditorStore((s) => s.sequenceExportMessage);
  const requestVideoExport       = useEditorStore((s) => s.requestVideoExport);
  const requestSequenceExport    = useEditorStore((s) => s.requestSequenceExport);
  const requestSingleFrameExport = useEditorStore((s) => s.requestSingleFrameExport);
  const cancelExport         = useEditorStore((s) => s.cancelExport);
  const currentTimeMs        = useEditorStore((s) => s.currentTimeMs);

  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [projectTitle, setProjectTitle] = useState(title);

  const [exportWidth,  setExportWidth]  = useState(1280);
  const [exportHeight, setExportHeight] = useState(720);
  const [exportFps,    setExportFps]    = useState(24);
  const [videoFormat,  setVideoFormat]  = useState<'mp4' | 'webm'>('mp4');
  const [exportStartSec, setExportStartSec] = useState('0.00');
  const [exportEndSec,   setExportEndSec]   = useState('10.00');
  const [ratioLocked, setRatioLocked] = useState(false);

  const isExporting = videoExportStatus === 'running' || sequenceExportStatus === 'running';

  useEffect(() => {
    let cancelled = false;
    getProject(projectId).then(({ title: t, data }) => {
      if (cancelled) return;
      loadSnapshot(data);
      setProjectTitle(t);
      setExportWidth(data.canvasWidth);
      setExportHeight(data.canvasHeight);
      setExportEndSec((data.globalDurationMs / 1000).toFixed(2));
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoadError('加载项目失败，请重试');
    });
    return () => { cancelled = true; };
  }, [projectId, loadSnapshot]);

  const handleClose = () => {
    if (isExporting) cancelExport();
    onClose();
  };

  const exportStartMs = Math.max(0, Math.round((parseFloat(exportStartSec) || 0) * 1000));
  const exportEndMs   = Math.min(globalDurationMs, Math.round((parseFloat(exportEndSec) || 0) * 1000));
  const exportSize = {
    width:  Math.max(16, Math.round(exportWidth)),
    height: Math.max(16, Math.round(exportHeight)),
    fps:    Math.max(1, Math.min(60, Math.round(exportFps))),
  };

  const handleExportVideo = () => {
    requestVideoExport({ ...exportSize, startMs: exportStartMs, endMs: exportEndMs, prefix: projectTitle, format: videoFormat });
  };
  const handleExportSequence = () => {
    requestSequenceExport({ ...exportSize, startMs: exportStartMs, endMs: exportEndMs, prefix: `${projectTitle}-frame` });
  };
  const handleExportFrame = () => {
    requestSingleFrameExport(exportSize.width);
  };

  const videoIsDone  = videoExportStatus    === 'done'  || videoExportStatus    === 'error';
  const seqIsDone    = sequenceExportStatus === 'done'  || sequenceExportStatus === 'error';
  const statusMsg    = videoIsDone
    ? { ok: videoExportStatus === 'done', text: videoExportMessage }
    : seqIsDone
      ? { ok: sequenceExportStatus === 'done', text: sequenceExportMessage }
      : null;

  return (
    <>
      {/* 隐藏画布：用于驱动实际导出管线，定位到屏幕外不可见 */}
      {!loading && !loadError && (
        <div className="pem-hidden-canvas">
          <CanvasPanel />
        </div>
      )}

      <div className="pem-overlay" onClick={handleClose}>
        <div className="pem-modal" onClick={(e) => e.stopPropagation()}>
          <div className="pem-header">
            <span className="pem-title">导出 — {projectTitle}</span>
            <button className="pem-close" onClick={handleClose}>✕</button>
          </div>

          {loading && !loadError && <div className="pem-loading">加载中...</div>}
          {loadError && <div className="pem-error">{loadError}</div>}

          {!loading && !loadError && (
            <div className="pem-body">
              <span className="pem-label">分辨率</span>
              <div className="pem-controls">
                <input className="pem-input" type="number" min={16} value={exportWidth}
                  onChange={(e) => {
                    const w = parseInt(e.target.value || '1280', 10);
                    setExportWidth(w);
                    if (ratioLocked) setExportHeight(Math.round(w * canvasHeight / canvasWidth));
                  }} />
                <input className="pem-input" type="number" min={16} value={exportHeight}
                  onChange={(e) => {
                    const h = parseInt(e.target.value || '720', 10);
                    setExportHeight(h);
                    if (ratioLocked) setExportWidth(Math.round(h * canvasWidth / canvasHeight));
                  }} />
                <button className={`pem-lock${ratioLocked ? ' is-locked' : ''}`}
                  onClick={() => setRatioLocked((p) => !p)}>
                  {ratioLocked ? <Lock size={12} strokeWidth={2} /> : <Unlock size={12} strokeWidth={2} />}
                </button>
              </div>

              <span className="pem-label">FPS / 格式</span>
              <div className="pem-controls">
                <select className="pem-select" value={exportFps} onChange={(e) => setExportFps(parseInt(e.target.value, 10))}>
                  {[24, 30, 60].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select className="pem-select" value={videoFormat} onChange={(e) => setVideoFormat(e.target.value as 'mp4' | 'webm')}>
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                </select>
              </div>

              <span className="pem-label">导出范围（秒）</span>
              <div className="pem-controls">
                <input className="pem-input" type="number" min={0} step={0.01} value={exportStartSec}
                  onChange={(e) => setExportStartSec(e.target.value)}
                  onBlur={() => setExportStartSec(Math.max(0, parseFloat(exportStartSec) || 0).toFixed(2))} />
                <input className="pem-input" type="number" min={0} step={0.01} value={exportEndSec}
                  onChange={(e) => setExportEndSec(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(exportEndSec);
                    const max = globalDurationMs / 1000;
                    setExportEndSec((isNaN(v) ? max : Math.min(max, Math.max(0, v))).toFixed(2));
                  }} />
              </div>

              {isExporting ? (
                <div className="pem-progress">
                  <span>{videoExportStatus === 'running' ? videoExportMessage : sequenceExportMessage}</span>
                  <button className="pem-cancel" onClick={cancelExport}>取消</button>
                </div>
              ) : (
                <div className="pem-actions">
                  <div className="pem-action-row">
                    <button className="pem-btn" onClick={handleExportFrame}>
                      导出当前帧 ({(currentTimeMs / 1000).toFixed(2)}s)
                    </button>
                    <button className="pem-btn" onClick={handleExportSequence}>导出序列帧</button>
                  </div>
                  <button className="pem-btn pem-btn-primary" onClick={handleExportVideo}>导出视频</button>
                </div>
              )}

              {statusMsg && (
                <div className={`pem-status ${statusMsg.ok ? 'is-ok' : 'is-error'}`}>
                  {statusMsg.ok ? `✓ ${statusMsg.text}` : `✗ ${statusMsg.text}`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
