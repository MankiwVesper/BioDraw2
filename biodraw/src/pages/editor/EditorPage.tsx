import './EditorPage.css';
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
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);
  useBeforeUnload(hasUnsavedChanges);

  if (isPreviewMode) {
    return (
      <div className="editor-preview-fullscreen">
        <CanvasPanel />
        <div className="preview-exit-hint">按 ESC 或 F 退出预览</div>
      </div>
    );
  }

  return (
    <div className="editor-layout">
      <ToolbarPanel />
      <div className="editor-main">
        <MaterialsPanel />
        <div className="editor-center">
          <CanvasPanel />
          <TimelinePanel />
        </div>
        <InspectorPanel />
      </div>
    </div>
  );
}
