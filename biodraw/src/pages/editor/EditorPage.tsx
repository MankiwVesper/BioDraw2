import './EditorPage.css';
import { useEffect } from 'react';
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
  useEditorKeyboard();
  useAutoSave();
  const hasUnsavedChanges = useEditorStore((s) => s.hasUnsavedChanges);
  const isPreviewMode     = useEditorStore((s) => s.isPreviewMode);
  const play              = useEditorStore((s) => s.play);
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

  // 进入预览模式：自动适配画布并播放
  useEffect(() => {
    if (isPreviewMode) {
      requestFit();
      play();
    }
  }, [isPreviewMode, requestFit, play]);

  return (
    <div className="editor-layout">
      {!isPreviewMode && <ToolbarPanel />}
      <div className="editor-main">
        {!isPreviewMode && <MaterialsPanel />}
        <div className="editor-center">
          <CanvasPanel />
          {!isPreviewMode && <TimelinePanel />}
        </div>
        {!isPreviewMode && <InspectorPanel />}
      </div>

    </div>
  );
}
