import './EditorPage.css';
import { ToolbarPanel } from '../../features/toolbar/ToolbarPanel';
import { MaterialsPanel } from '../../features/materials-panel/MaterialsPanel';
import { CanvasPanel } from '../../features/canvas-panel/CanvasPanel';
import { InspectorPanel } from '../../features/inspector-panel/InspectorPanel';
import { TimelinePanel } from '../../features/timeline-panel/TimelinePanel';
import { useEditorKeyboard } from '../../hooks/useEditorKeyboard';

export default function EditorPage() {
  useEditorKeyboard();
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
