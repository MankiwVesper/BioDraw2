import './EditorPage.css';
import { useEffect, useState } from 'react';
import { ToolbarPanel } from '../../features/toolbar/ToolbarPanel';
import { MaterialsPanel } from '../../features/materials-panel/MaterialsPanel';
import { CanvasPanel } from '../../features/canvas-panel/CanvasPanel';
import { InspectorPanel } from '../../features/inspector-panel/InspectorPanel';
import { TimelinePanel } from '../../features/timeline-panel/TimelinePanel';
import { useEditorKeyboard } from '../../hooks/useEditorKeyboard';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useBeforeUnload } from '../../hooks/useBeforeUnload';
import { useEditorStore } from '../../state/editorStore';

export default function EditorPage() {
  const [showMaterials, setShowMaterials] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showTimeline,  setShowTimeline]  = useState(true);

  useEditorKeyboard();
  useAutoSave();
  const hasUnsavedChanges = useEditorStore((s) => s.hasUnsavedChanges);
  const isPreviewMode     = useEditorStore((s) => s.isPreviewMode);
  const requestFit        = useEditorStore((s) => s.requestFit);
  const playbackStatus    = useEditorStore((s) => s.playbackStatus);
  const advancePlayback   = useEditorStore((s) => s.advancePlayback);
  useBeforeUnload(hasUnsavedChanges);

  // RAF 驱动播放（始终挂载，预览/非预览模式均有效）
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

  // 进入预览模式：自动适配画布（播放状态已在 setPreviewMode 中设置）
  useEffect(() => {
    if (isPreviewMode) requestFit();
  }, [isPreviewMode, requestFit]);

  // 面板收起/展开后自动适配画布到新的可用空间
  useEffect(() => {
    requestFit();
  }, [showMaterials, showInspector, showTimeline, requestFit]);

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
