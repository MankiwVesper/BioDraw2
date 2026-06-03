import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore } from '../state/projectStore';
import { serializeDocument } from '../infrastructure/documentSerializer';
import { updateProjectData } from '../infrastructure/projectService';

const DEBOUNCE_MS = 5000;

export function useCloudSave(projectId: string) {
  const objects          = useEditorStore((s) => s.objects);
  const animations       = useEditorStore((s) => s.animations);
  const globalDurationMs = useEditorStore((s) => s.globalDurationMs);
  const canvasWidth      = useEditorStore((s) => s.canvasWidth);
  const canvasHeight     = useEditorStore((s) => s.canvasHeight);
  const canvasBgColor    = useEditorStore((s) => s.canvasBgColor);
  const markSaved        = useEditorStore((s) => s.markSaved);
  const setSaveStatus    = useProjectStore((s) => s.setSaveStatus);
  const setLastSavedAt   = useProjectStore((s) => s.setLastSavedAt);

  const isFirstRender = useRef(true);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSave = useCallback(async () => {
    const s = useEditorStore.getState();
    setSaveStatus('saving');
    try {
      const snapshot = serializeDocument({
        objects: s.objects,
        animations: s.animations,
        globalDurationMs: s.globalDurationMs,
        canvasWidth: s.canvasWidth,
        canvasHeight: s.canvasHeight,
        canvasBgColor: s.canvasBgColor,
      });
      await updateProjectData(projectId, snapshot);
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      markSaved();
    } catch {
      setSaveStatus('error');
    }
  }, [projectId, setSaveStatus, setLastSavedAt, markSaved]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(performSave, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [objects, animations, globalDurationMs, canvasWidth, canvasHeight, canvasBgColor, performSave]);

  return { saveNow: performSave };
}
