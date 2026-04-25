import { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';

const STORAGE_KEY = 'biodraw_autosave';
const CURRENT_VERSION = 2;
const DEBOUNCE_MS = 1500;

type SavePayload = {
  version: number;
  savedAt: string;
  objects: ReturnType<typeof useEditorStore.getState>['objects'];
  animations: ReturnType<typeof useEditorStore.getState>['animations'];
  globalDurationMs: number;
  canvasWidth: number;
  canvasHeight: number;
  canvasBgColor: string;
};

export function useAutoSave() {
  const objects         = useEditorStore((s) => s.objects);
  const animations      = useEditorStore((s) => s.animations);
  const globalDurationMs = useEditorStore((s) => s.globalDurationMs);
  const canvasWidth     = useEditorStore((s) => s.canvasWidth);
  const canvasHeight    = useEditorStore((s) => s.canvasHeight);
  const canvasBgColor   = useEditorStore((s) => s.canvasBgColor);
  const loadSnapshot    = useEditorStore((s) => s.loadSnapshot);

  // 启动时恢复
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: SavePayload = JSON.parse(raw);
      if (!data?.objects || !data?.animations) return;
      if (data.version !== CURRENT_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      loadSnapshot({
        objects: data.objects,
        animations: data.animations,
        globalDurationMs: data.globalDurationMs ?? 10000,
        canvasWidth: data.canvasWidth,
        canvasHeight: data.canvasHeight,
        canvasBgColor: data.canvasBgColor,
      });
    } catch {
      // 存档损坏时静默忽略
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 变化时防抖保存
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const payload: SavePayload = {
          version: CURRENT_VERSION,
          savedAt: new Date().toISOString(),
          objects,
          animations,
          globalDurationMs,
          canvasWidth,
          canvasHeight,
          canvasBgColor,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // localStorage 满时静默忽略
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [objects, animations, globalDurationMs, canvasWidth, canvasHeight, canvasBgColor]);
}
