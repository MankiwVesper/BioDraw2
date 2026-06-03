import './EditorPage.css';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ToolbarPanel } from '../../features/toolbar/ToolbarPanel';
import { MaterialsPanel } from '../../features/materials-panel/MaterialsPanel';
import { CanvasPanel } from '../../features/canvas-panel/CanvasPanel';
import { InspectorPanel } from '../../features/inspector-panel/InspectorPanel';
import { TimelinePanel } from '../../features/timeline-panel/TimelinePanel';
import { useEditorKeyboard } from '../../hooks/useEditorKeyboard';
import { useBeforeUnload } from '../../hooks/useBeforeUnload';
import { useCloudSave } from '../../hooks/useCloudSave';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore } from '../../state/projectStore';
import { getProject } from '../../infrastructure/projectService';

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showMaterials, setShowMaterials] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showTimeline,  setShowTimeline]  = useState(true);

  const loadSnapshot        = useEditorStore((s) => s.loadSnapshot);
  const setCurrentFileName  = useEditorStore((s) => s.setCurrentFileName);
  const hasUnsavedChanges   = useEditorStore((s) => s.hasUnsavedChanges);
  const isPreviewMode       = useEditorStore((s) => s.isPreviewMode);
  const requestFit          = useEditorStore((s) => s.requestFit);
  const playbackStatus      = useEditorStore((s) => s.playbackStatus);
  const advancePlayback     = useEditorStore((s) => s.advancePlayback);

  const setCurrentProjectId = useProjectStore((s) => s.setCurrentProjectId);
  const setSaveStatus       = useProjectStore((s) => s.setSaveStatus);

  useEditorKeyboard();
  useBeforeUnload(hasUnsavedChanges);
  useCloudSave(projectId ?? '');

  // 加载项目数据
  useEffect(() => {
    if (!projectId) {
      navigate('/projects', { replace: true });
      return;
    }
    setCurrentProjectId(projectId);
    setSaveStatus('idle');
    setLoading(true);
    setLoadError(null);

    getProject(projectId)
      .then(({ title, data }) => {
        loadSnapshot(data);
        setCurrentFileName(title + '.biodraw');
        setLoading(false);
      })
      .catch(() => {
        setLoadError('项目加载失败，请返回项目列表重试');
        setLoading(false);
      });

    return () => setCurrentProjectId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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

  useEffect(() => {
    if (isPreviewMode) requestFit();
  }, [isPreviewMode, requestFit]);

  useEffect(() => {
    requestFit();
  }, [showMaterials, showInspector, showTimeline, requestFit]);

  if (loading) return <div className="auth-loading">加载项目...</div>;

  if (loadError) return (
    <div className="auth-loading">
      <div style={{ textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>{loadError}</p>
        <button
          onClick={() => navigate('/projects')}
          style={{ padding: '6px 16px', cursor: 'pointer' }}
        >
          返回项目列表
        </button>
      </div>
    </div>
  );

  return (
    <div className="editor-layout">
      {!isPreviewMode && (
        <ToolbarPanel
          showMaterials={showMaterials} onToggleMaterials={() => setShowMaterials((p) => !p)}
          showInspector={showInspector} onToggleInspector={() => setShowInspector((p) => !p)}
          showTimeline={showTimeline}   onToggleTimeline={() => setShowTimeline((p) => !p)}
          onRestoreDefault={() => { setShowMaterials(true); setShowInspector(true); setShowTimeline(true); }}
          onFullscreen={() => { setShowMaterials(false); setShowInspector(false); setShowTimeline(false); }}
        />
      )}
      <div className="editor-main">
        {!isPreviewMode && showMaterials && <MaterialsPanel />}
        <div className="editor-center">
          <CanvasPanel />
          {!isPreviewMode && showTimeline && <TimelinePanel />}
        </div>
        {!isPreviewMode && showInspector && <InspectorPanel />}
      </div>
    </div>
  );
}
