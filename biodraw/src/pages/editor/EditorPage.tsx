import './EditorPage.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const wasAutoPreview = searchParams.get('autoPreview') === '1';
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showMaterials, setShowMaterials] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showTimeline,  setShowTimeline]  = useState(true);

  const loadSnapshot        = useEditorStore((s) => s.loadSnapshot);
  const setCurrentFileName  = useEditorStore((s) => s.setCurrentFileName);
  const hasUnsavedChanges   = useEditorStore((s) => s.hasUnsavedChanges);
  const isPreviewMode       = useEditorStore((s) => s.isPreviewMode);
  const setPreviewMode      = useEditorStore((s) => s.setPreviewMode);
  const requestFit          = useEditorStore((s) => s.requestFit);
  const playbackStatus      = useEditorStore((s) => s.playbackStatus);
  const advancePlayback     = useEditorStore((s) => s.advancePlayback);

  const setCurrentProjectId = useProjectStore((s) => s.setCurrentProjectId);
  const setProjectVersion   = useProjectStore((s) => s.setProjectVersion);
  const setSaveStatus       = useProjectStore((s) => s.setSaveStatus);

  useEditorKeyboard();
  useBeforeUnload(hasUnsavedChanges);
  const { saveNow } = useCloudSave(projectId ?? '');

  // 加载项目数据
  useEffect(() => {
    if (!projectId) {
      navigate('/projects', { replace: true });
      return;
    }
    let cancelled = false;
    setCurrentProjectId(projectId);
    setSaveStatus('idle');
    setLoading(true);
    setLoadError(null);

    getProject(projectId)
      .then(({ title, data, version }) => {
        if (cancelled) return;
        loadSnapshot(data);
        setProjectVersion(version);
        setCurrentFileName(title + '.biodraw');
        if (searchParams.get('autoPreview') === '1') setPreviewMode(true);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('项目加载失败，请返回项目列表重试');
        setLoading(false);
      });

    return () => { cancelled = true; setCurrentProjectId(null); setPreviewMode(false); };
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

  // 从项目列表以 autoPreview=1 进入预览，退出时回到项目列表
  // prevPreviewRef 在 effect 里更新，渲染阶段读到的是上一次的值，
  // 因此可以在渲染时检测"刚从 true 变成 false"并立即返回空，避免编辑器 UI 闪一帧
  const prevPreviewRef = useRef(isPreviewMode);
  const exitingAutoPreview = wasAutoPreview && prevPreviewRef.current && !isPreviewMode;
  useLayoutEffect(() => {
    const wasInPreview = prevPreviewRef.current;
    prevPreviewRef.current = isPreviewMode;
    if (wasAutoPreview && wasInPreview && !isPreviewMode) {
      navigate('/projects');
    }
  }, [isPreviewMode, wasAutoPreview, navigate]);

  useEffect(() => {
    requestFit();
  }, [showMaterials, showInspector, showTimeline, requestFit]);

  if (exitingAutoPreview) return null;

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
          onSave={saveNow}
        />
      )}
      <div className="editor-main">
        {!isPreviewMode && (
          <div className={`editor-side-slot${showMaterials ? '' : ' is-collapsed'}`}>
            <MaterialsPanel />
          </div>
        )}
        <div className="editor-center">
          <CanvasPanel />
          {!isPreviewMode && (
            <div className={`editor-bottom-slot${showTimeline ? '' : ' is-collapsed'}`}>
              <TimelinePanel />
            </div>
          )}
        </div>
        {!isPreviewMode && (
          <div className={`editor-side-slot${showInspector ? '' : ' is-collapsed'}`}>
            <InspectorPanel />
          </div>
        )}
      </div>
    </div>
  );
}
