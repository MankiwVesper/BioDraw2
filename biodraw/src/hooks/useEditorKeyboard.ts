import { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { downloadDocument } from '../infrastructure/documentSerializer';
import { cloneDeep } from '../utils/clone';
import type { SceneObject } from '../types';

// 模块级剪贴板，跨渲染保持（支持多选）
let clipboard: SceneObject[] = [];

export function useEditorKeyboard() {
  const selectedIds              = useEditorStore((s) => s.selectedIds);
  const objects                  = useEditorStore((s) => s.objects);
  const playbackStatus           = useEditorStore((s) => s.playbackStatus);
  const removeSceneObjects       = useEditorStore((s) => s.removeSceneObjects);
  const addSceneObjects          = useEditorStore((s) => s.addSceneObjects);
  const selectObject             = useEditorStore((s) => s.selectObject);
  const selectAllObjects         = useEditorStore((s) => s.selectAllObjects);
  const duplicateObjects         = useEditorStore((s) => s.duplicateObjects);
  const groupObjects             = useEditorStore((s) => s.groupObjects);
  const ungroupObjects           = useEditorStore((s) => s.ungroupObjects);
  const exitGroupEditing         = useEditorStore((s) => s.exitGroupEditing);
  const moveMultipleSceneObjects       = useEditorStore((s) => s.moveMultipleSceneObjects);
  const moveMultipleSceneObjectsSilent = useEditorStore((s) => s.moveMultipleSceneObjectsSilent);
  const play                     = useEditorStore((s) => s.play);
  const pause                    = useEditorStore((s) => s.pause);
  const undo                     = useEditorStore((s) => s.undo);
  const redo                     = useEditorStore((s) => s.redo);
  const markSaved                = useEditorStore((s) => s.markSaved);
  const isPreviewMode            = useEditorStore((s) => s.isPreviewMode);
  const setPreviewMode           = useEditorStore((s) => s.setPreviewMode);
  const canvasDrawingMode        = useEditorStore((s) => s.canvasDrawingMode);
  const setCanvasDrawingMode     = useEditorStore((s) => s.setCanvasDrawingMode);

  // Refs 避免 stale closure
  const selectedIdsRef              = useRef(selectedIds);
  const objectsRef                  = useRef(objects);
  const playbackRef                 = useRef(playbackStatus);
  const moveMultipleSceneObjectsRef        = useRef(moveMultipleSceneObjects);
  const moveMultipleSceneObjectsSilentRef  = useRef(moveMultipleSceneObjectsSilent);
  const isPreviewModeRef            = useRef(isPreviewMode);
  const canvasDrawingModeRef        = useRef(canvasDrawingMode);

  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { playbackRef.current = playbackStatus; }, [playbackStatus]);
  useEffect(() => { moveMultipleSceneObjectsRef.current = moveMultipleSceneObjects; }, [moveMultipleSceneObjects]);
  useEffect(() => { moveMultipleSceneObjectsSilentRef.current = moveMultipleSceneObjectsSilent; }, [moveMultipleSceneObjectsSilent]);
  useEffect(() => { isPreviewModeRef.current = isPreviewMode; }, [isPreviewMode]);
  useEffect(() => { canvasDrawingModeRef.current = canvasDrawingMode; }, [canvasDrawingMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 自由绘制模式：ESC 始终取消，不受焦点位置限制
      if (e.key === 'Escape' && useEditorStore.getState().canvasDrawingMode) {
        setCanvasDrawingMode(null);
        return;
      }

      // 不拦截输入框内的按键
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      const selectedAll = selectedIdsRef.current;
      const ctrl = e.ctrlKey || e.metaKey;
      // 统一按小写字母比较，避免 CapsLock / 大写时快捷键失效
      const lk = e.key.toLowerCase();

      // Space：播放 / 暂停
      if (e.key === ' ') {
        e.preventDefault();
        if (playbackRef.current === 'playing') pause();
        else play();
        return;
      }

      // Delete / Backspace：删除所有选中对象（跳过锁定对象；组内编辑时无效）
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAll.length > 0) {
        if (useEditorStore.getState().groupEditingId) return;
        e.preventDefault();
        const deletable = selectedAll.filter((id) => !objectsRef.current.find((o) => o.id === id)?.locked);
        if (deletable.length > 0) removeSceneObjects(deletable);
        return;
      }

      // Escape：优先取消自由绘制，其次退出组内编辑，再退出预览模式，否则取消选中
      if (e.key === 'Escape') {
        if (canvasDrawingModeRef.current) { setCanvasDrawingMode(null); return; }
        if (useEditorStore.getState().groupEditingId) { exitGroupEditing(); return; }
        if (isPreviewModeRef.current) { setPreviewMode(false); return; }
        selectObject(null);
        return;
      }

      // Ctrl+A：全选
      if (ctrl && lk === 'a') {
        e.preventDefault();
        selectAllObjects();
        return;
      }

      // Ctrl+Z：撤销
      if (ctrl && !e.shiftKey && lk === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Shift+Z / Ctrl+Y：重做
      if ((ctrl && e.shiftKey && lk === 'z') || (ctrl && lk === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+C：复制所有选中对象（组内编辑时禁用）
      if (ctrl && lk === 'c' && selectedAll.length > 0) {
        if (useEditorStore.getState().groupEditingId) return;
        clipboard = objectsRef.current
          .filter((o) => selectedAll.includes(o.id))
          .map((o) => cloneDeep(o));
        return;
      }

      // Ctrl+V：粘贴（每个偏移 +20px）
      if (ctrl && lk === 'v' && clipboard.length > 0) {
        e.preventDefault();
        // 旧 groupId → 新 groupId：同组对象粘贴后仍是一个（新）组
        const groupIdMap = new Map<string, string>();
        // 一次性批量加入，保证整次粘贴是单条历史记录（可一步 Undo）
        const pasted = clipboard.map((src) => {
          const cloned = cloneDeep(src);
          let newGroupId: string | undefined;
          if (src.groupId) {
            if (!groupIdMap.has(src.groupId)) groupIdMap.set(src.groupId, crypto.randomUUID());
            newGroupId = groupIdMap.get(src.groupId);
          }
          return {
            ...cloned,
            id: crypto.randomUUID(),
            x: src.x + 20,
            y: src.y + 20,
            animationIds: [],
            groupId: newGroupId,
            appearSegments: cloned.appearSegments?.map((seg) => ({ ...seg, id: crypto.randomUUID() })),
          } satisfies SceneObject;
        });
        addSceneObjects(pasted);
        return;
      }

      // Ctrl+D：就地复制所有选中对象（组内编辑时禁用）；复制整组得到新组
      if (ctrl && lk === 'd' && selectedAll.length > 0) {
        if (useEditorStore.getState().groupEditingId) return;
        e.preventDefault();
        duplicateObjects(selectedAll);
        return;
      }

      // Ctrl+G：组合选中对象（≥2个）
      if (ctrl && !e.shiftKey && lk === 'g' && selectedAll.length >= 2) {
        e.preventDefault();
        groupObjects(selectedAll);
        return;
      }

      // Ctrl+Shift+G：取消组合
      if (ctrl && e.shiftKey && lk === 'g' && selectedAll.length > 0) {
        e.preventDefault();
        const obj = objectsRef.current.find((o) => selectedAll.includes(o.id) && o.groupId);
        if (obj?.groupId) ungroupObjects(obj.groupId);
        return;
      }

      // Ctrl+S：保存文档
      if (ctrl && lk === 's') {
        e.preventDefault();
        const state = useEditorStore.getState();
        downloadDocument({
          objects: state.objects,
          animations: state.animations,
          globalDurationMs: state.globalDurationMs,
          canvasWidth: state.canvasWidth,
          canvasHeight: state.canvasHeight,
          canvasBgColor: state.canvasBgColor,
        }, state.currentFileName as string);
        markSaved();
        return;
      }

      // F 键：切换全屏预览模式（进入时自动播放）
      if (lk === 'f' && !ctrl) {
        e.preventDefault();
        const entering = !isPreviewModeRef.current;
        setPreviewMode(entering);
        if (entering) play();
        return;
      }

      // 方向键微移选中对象（1px；Shift 时 10px）
      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        selectedAll.length > 0 &&
        !ctrl
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
        const moves = objectsRef.current
          .filter((o) => selectedAll.includes(o.id))
          .map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy }));
        if (e.repeat) {
          moveMultipleSceneObjectsSilentRef.current(moves);
        } else {
          moveMultipleSceneObjectsRef.current(moves);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    removeSceneObjects, addSceneObjects, selectObject,
    selectAllObjects, duplicateObjects, groupObjects, ungroupObjects, exitGroupEditing,
    play, pause, undo, redo, markSaved, setPreviewMode, isPreviewMode,
    setCanvasDrawingMode,
  ]);
}
