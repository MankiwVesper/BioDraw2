import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Lock, Unlock } from 'lucide-react';
import { CanvasPanel } from '../../features/canvas-panel/CanvasPanel';
import { useEditorStore } from '../../state/editorStore';
import { getProject } from '../../infrastructure/projectService';
import '../../features/toolbar/ToolbarPanel.css';
import './ProjectExportModal.css';

function ExportDropdown({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="tb-dropdown-wrap" ref={ref}>
      <button
        type="button"
        className={`tb-dropdown-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((p) => !p)}
      >
        <span className="tb-dropdown-btn-label">{selected?.label ?? value}</span>
        <ChevronDown size={10} strokeWidth={2.5} className={`tb-dropdown-chevron${open ? ' is-open' : ''}`} />
      </button>
      {open && (
        <div className="tb-dropdown-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`tb-dropdown-option${opt.value === value ? ' is-active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ResetSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
  </svg>
);

interface Props {
  projectId: string;
  title: string;
  onClose: () => void;
}

export function ProjectExportModal({ projectId, title, onClose }: Props) {
  const loadSnapshot             = useEditorStore((s) => s.loadSnapshot);
  const canvasWidth              = useEditorStore((s) => s.canvasWidth);
  const canvasHeight             = useEditorStore((s) => s.canvasHeight);
  const globalDurationMs         = useEditorStore((s) => s.globalDurationMs);
  const videoExportStatus        = useEditorStore((s) => s.videoExportStatus);
  const videoExportMessage       = useEditorStore((s) => s.videoExportMessage);
  const sequenceExportStatus     = useEditorStore((s) => s.sequenceExportStatus);
  const sequenceExportMessage    = useEditorStore((s) => s.sequenceExportMessage);
  const requestVideoExport       = useEditorStore((s) => s.requestVideoExport);
  const requestSequenceExport    = useEditorStore((s) => s.requestSequenceExport);
  const cancelExport             = useEditorStore((s) => s.cancelExport);

  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState('');
  const [projectTitle,  setProjectTitle]  = useState(title);

  const [exportWidth,    setExportWidth]    = useState(1280);
  const [exportHeight,   setExportHeight]   = useState(720);
  const [exportFps,      setExportFps]      = useState(24);
  const [videoFormat,    setVideoFormat]    = useState<'mp4' | 'webm'>('mp4');
  const [exportStartSec, setExportStartSec] = useState('0.00');
  const [exportEndSec,   setExportEndSec]   = useState('10.00');
  const [ratioLocked,    setRatioLocked]    = useState(false);

  const isExporting   = videoExportStatus === 'running' || sequenceExportStatus === 'running';
  const isExportDone  = videoExportStatus === 'done'    || sequenceExportStatus === 'done';
  const progressMsg   = videoExportStatus === 'running' ? videoExportMessage : sequenceExportMessage;
  const progressPct   = isExportDone ? 100 : (() => { const m = progressMsg.match(/(\d+)%/); return m ? parseInt(m[1], 10) : 0; })();

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

  const handleExportVideo    = () => requestVideoExport({ ...exportSize, startMs: exportStartMs, endMs: exportEndMs, prefix: projectTitle, format: videoFormat });
  const handleExportSequence = () => requestSequenceExport({ ...exportSize, startMs: exportStartMs, endMs: exportEndMs, prefix: `${projectTitle}-frame` });

return (
    <>
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
              <div className="tb-canvas-content">

                <span className="tb-canvas-size-label">分辨率</span>
                <div className="tb-canvas-controls">
                  <input
                    className="tb-canvas-size-input" type="number" min={16} value={exportWidth}
                    onChange={(e) => {
                      const w = parseInt(e.target.value || '1280', 10);
                      setExportWidth(w);
                      if (ratioLocked) setExportHeight(Math.round(w * canvasHeight / canvasWidth));
                    }}
                  />
                  <input
                    className="tb-canvas-size-input" type="number" min={16} value={exportHeight}
                    onChange={(e) => {
                      const h = parseInt(e.target.value || '720', 10);
                      setExportHeight(h);
                      if (ratioLocked) setExportWidth(Math.round(h * canvasWidth / canvasHeight));
                    }}
                  />
                  <button
                    className={`tb-canvas-lock-btn${ratioLocked ? ' is-locked' : ''}`}
                    onClick={() => setRatioLocked((p) => !p)}
                    title={ratioLocked ? '解锁宽高比' : '锁定宽高比'}
                  >
                    {ratioLocked ? <Lock size={12} strokeWidth={2} /> : <Unlock size={12} strokeWidth={2} />}
                  </button>
                </div>

                <span className="tb-canvas-size-label">FPS/格式</span>
                <div className="tb-canvas-controls">
                  <ExportDropdown
                    options={[24, 30, 60].map((f) => ({ value: String(f), label: String(f) }))}
                    value={String(exportFps)}
                    onChange={(v) => setExportFps(parseInt(v, 10))}
                  />
                  <ExportDropdown
                    options={[{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }]}
                    value={videoFormat}
                    onChange={(v) => setVideoFormat(v as 'mp4' | 'webm')}
                  />
                  <button
                    className="tb-canvas-lock-btn"
                    onClick={() => { setExportFps(24); setVideoFormat('mp4'); }}
                    title="恢复默认值"
                  >
                    <ResetSvg />
                  </button>
                </div>

                <span className="tb-canvas-size-label">导出范围</span>
                <div className="tb-canvas-controls">
                  <input
                    className="tb-canvas-size-input" type="number" min={0} step={0.01}
                    value={exportStartSec}
                    onChange={(e) => setExportStartSec(e.target.value)}
                    onBlur={() => setExportStartSec(Math.max(0, parseFloat(exportStartSec) || 0).toFixed(2))}
                  />
                  <input
                    className="tb-canvas-size-input" type="number" min={0} step={0.01}
                    value={exportEndSec}
                    onChange={(e) => setExportEndSec(e.target.value)}
                    onBlur={() => {
                      const v = parseFloat(exportEndSec);
                      const max = globalDurationMs / 1000;
                      setExportEndSec((isNaN(v) ? max : Math.min(max, Math.max(0, v))).toFixed(2));
                    }}
                  />
                  <button
                    className="tb-canvas-lock-btn"
                    onClick={() => { setExportStartSec('0.00'); setExportEndSec((globalDurationMs / 1000).toFixed(2)); }}
                    title="恢复默认范围"
                  >
                    <ResetSvg />
                  </button>
                </div>

                {(isExporting || isExportDone) ? (
                  <div className="tb-canvas-content-full pem-progress">
                    <div className="pem-progress-bar-wrap">
                      <div className="pem-progress-bar-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="pem-progress-text">{progressPct}%</span>
                    {isExportDone
                      ? <button className="pem-done" onClick={onClose}>完成</button>
                      : <button className="pem-cancel" onClick={cancelExport}>取消</button>
                    }
                  </div>
                ) : (
                  <div className="tb-canvas-content-full tb-export-action-row">
                    <button className="tb-export-action-btn" onClick={handleExportSequence}>导出序列帧</button>
                    <button className="tb-export-action-btn tb-export-action-primary" onClick={handleExportVideo}>导出视频</button>
                  </div>
                )}


              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
