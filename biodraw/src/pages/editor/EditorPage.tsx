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
  const setPreviewMode = useEditorStore((s) => s.setPreviewMode);
  useBeforeUnload(hasUnsavedChanges);

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
      {isPreviewMode && (
        <button
          onClick={() => setPreviewMode(false)}
          style={{
            position: 'fixed', top: 12, right: 12, zIndex: 9999,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6,
            padding: '5px 12px', cursor: 'pointer', fontSize: 12,
            backdropFilter: 'blur(4px)',
          }}
          title="退出预览 (Esc)"
        >
          ✕ 退出预览
        </button>
      )}
    </div>
  );
}
