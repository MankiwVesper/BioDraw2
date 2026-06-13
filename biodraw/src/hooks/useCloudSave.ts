import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore } from '../state/projectStore';
import { serializeDocument } from '../infrastructure/documentSerializer';
import { updateProjectData, getProjectVersion } from '../infrastructure/projectService';
import { thumbnailCapture } from '../infrastructure/thumbnailCapture';

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
  const setProjectVersion = useProjectStore((s) => s.setProjectVersion);

  const isFirstRender   = useRef(true);
  const prevProjectIdRef = useRef(projectId);
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 每次有新编辑时递增；performSave 完成时若版本已变则跳过 markSaved，
  // 防止慢请求清除更新改动的 dirty 标志。
  const editRevisionRef  = useRef(0);
  // 串行化保存：同一时刻只允许一个请求在途；在途时收到新保存请求则置位，
  // 当前请求完成后立即用最新快照再保存一次，防止旧快照覆盖新数据。
  const isSavingRef      = useRef(false);
  const pendingSaveRef   = useRef(false);

  const performSave = useCallback(async () => {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    do {
      isSavingRef.current = true;
      pendingSaveRef.current = false;

      const revision = editRevisionRef.current;
      const s = useEditorStore.getState();
      const currentVersion = useProjectStore.getState().projectVersion;
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
        const thumbnail = thumbnailCapture.current?.() ?? null;
        const newVersion = await updateProjectData(projectId, snapshot, thumbnail, currentVersion);
        setProjectVersion(newVersion);
        if (editRevisionRef.current === revision) {
          setSaveStatus('saved');
          setLastSavedAt(new Date());
          markSaved();
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'CONFLICT') {
          pendingSaveRef.current = false;
          // 从服务器同步最新版本，下次保存用正确版本，避免持续冲突
          getProjectVersion(projectId).then(setProjectVersion).catch(() => {});
        }
        setSaveStatus('error');
      }
      isSavingRef.current = false;
    } while (pendingSaveRef.current);
  }, [projectId, setSaveStatus, setLastSavedAt, markSaved, setProjectVersion]);

  useEffect(() => {
    const projectChanged = projectId !== prevProjectIdRef.current;
    prevProjectIdRef.current = projectId;

    // 首次渲染或项目切换时不触发保存，清理残留定时器后直接返回。
    // 项目切换时 store 仍是旧项目数据，不得排队写入新 projectId。
    if (isFirstRender.current || projectChanged) {
      isFirstRender.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    editRevisionRef.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(performSave, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [objects, animations, globalDurationMs, canvasWidth, canvasHeight, canvasBgColor, performSave, projectId]);

  return { saveNow: performSave };
}
