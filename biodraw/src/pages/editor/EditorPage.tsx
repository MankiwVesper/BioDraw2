import './EditorPage.css';
import { ToolbarPanel } from '../../features/toolbar/ToolbarPanel';
import { MaterialsPanel } from '../../features/materials-panel/MaterialsPanel';
import { CanvasPanel } from '../../features/canvas-panel/CanvasPanel';
import { InspectorPanel } from '../../features/inspector-panel/InspectorPanel';

export default function EditorPage() {
  return (
    <div className="editor-layout">
      <ToolbarPanel />
      <div className="editor-main">
        <MaterialsPanel />
        <CanvasPanel />
        <InspectorPanel />
      </div>
    </div>
  );
}
