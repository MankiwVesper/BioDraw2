import './EditorPage.css';
import { useEffect } from 'react';
import { SkipBack, SkipForward, Play, Pause, Square } from 'lucide-react';
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
  const hasUnsavedChanges  = useEditorStore((s) => s.hasUnsavedChanges);
  const isPreviewMode      = useEditorStore((s) => s.isPreviewMode);
  const setPreviewMode     = useEditorStore((s) => s.setPreviewMode);
  const playbackStatus     = useEditorStore((s) => s.playbackStatus);
  const play               = useEditorStore((s) => s.play);
  const pause              = useEditorStore((s) => s.pause);
  const stop               = useEditorStore((s) => s.stop);
  const stepPlaybackFrame  = useEditorStore((s) => s.stepPlaybackFrame);
  const requestFit         = useEditorStore((s) => s.requestFit);
  useBeforeUnload(hasUnsavedChanges);

  const isPlaying = playbackStatus === 'playing';

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

      {/* 预览模式浮动控制栏：播放四键 + 退出预览 */}
      {isPreviewMode && (
        <div className="preview-controls">
          <button className="pv-btn" onClick={() => stepPlaybackFrame(-1)} title="上一帧">
            <SkipBack size={14} strokeWidth={2} />
          </button>
          <button
            className={`pv-btn pv-play${isPlaying ? ' pv-playing' : ''}`}
            onClick={isPlaying ? pause : play}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying
              ? <Pause size={13} strokeWidth={2.5} fill="currentColor" />
              : <Play  size={13} strokeWidth={2.5} fill="currentColor" />}
          </button>
          <button className="pv-btn" onClick={stop} title="停止">
            <Square size={11} strokeWidth={0} fill="currentColor" />
          </button>
          <button className="pv-btn" onClick={() => stepPlaybackFrame(1)} title="下一帧">
            <SkipForward size={14} strokeWidth={2} />
          </button>
          <div className="pv-divider" />
          <button className="pv-exit" onClick={() => setPreviewMode(false)} title="退出预览 (Esc)">
            ✕ 退出预览
          </button>
        </div>
      )}
    </div>
  );
}
