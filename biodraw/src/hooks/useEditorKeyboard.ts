import { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { downloadDocument } from '../infrastructure/documentSerializer';
import type { SceneObject } from '../types';

// 模块级剪贴板，跨渲染保持
let clipboard: SceneObject | null = null;

export function useEditorKeyboard() {
  const selectedIds              = useEditorStore((s) => s.selectedIds);
  const objects                  = useEditorStore((s) => s.objects);
  const playbackStatus           = useEditorStore((s) => s.playbackStatus);
  const removeSceneObjects       = useEditorStore((s) => s.removeSceneObjects);
  const addSceneObject           = useEditorStore((s) => s.addSceneObject);
  const selectObject             = useEditorStore((s) => s.selectObject);
  const selectAllObjects         = useEditorStore((s) => s.selectAllObjects);
  const duplicateObject          = useEditorStore((s) => s.duplicateObject);
  const moveMultipleSceneObjects = useEditorStore((s) => s.moveMultipleSceneObjects);
  const undo                     = useEditorStore((s) => s.undo);
  const redo                     = useEditorStore((s) => s.redo);
  const markSaved                = useEditorStore((s) => s.markSaved);

  // Refs 避免 stale closure
  const selectedIdsRef              = useRef(selectedIds);
  const objectsRef                  = useRef(objects);
  const playbackRef                 = useRef(playbackStatus);
  const moveMultipleSceneObjectsRef = useRef(moveMultipleSceneObjects);

  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { playbackRef.current = playbackStatus; }, [playbackStatus]);
  useEffect(() => { moveMultipleSceneObjectsRef.current = moveMultipleSceneObjects; }, [moveMultipleSceneObjects]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 不拦截输入框内的按键
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      const selectedId  = selectedIdsRef.current[0];
      const selectedAll = selectedIdsRef.current;
      const ctrl = e.ctrlKey || e.metaKey;

      // Delete / Backspace：删除所有选中对象
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAll.length > 0) {
        e.preventDefault();
        removeSceneObjects(selectedAll);
        return;
      }

      // Escape：取消选中
      if (e.key === 'Escape') {
        selectObject(null);
        return;
      }

      // Ctrl+A：全选
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        selectAllObjects();
        return;
      }

      // Ctrl+Z：撤销
      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Shift+Z / Ctrl+Y：重做（Shift 时 e.key 为大写 'Z'，统一 toLowerCase）
      if ((ctrl && e.shiftKey && e.key.toLowerCase() === 'z') || (ctrl && e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+C：复制
      if (ctrl && e.key === 'c' && selectedId) {
        const obj = objectsRef.current.find((o) => o.id === selectedId);
        if (obj) clipboard = JSON.parse(JSON.stringify(obj));
        return;
      }

      // Ctrl+V：粘贴（偏移 +20px）
      if (ctrl && e.key === 'v' && clipboard) {
        e.preventDefault();
        const newObj: SceneObject = {
          ...JSON.parse(JSON.stringify(clipboard)),
          id: crypto.randomUUID(),
          x: clipboard.x + 20,
          y: clipboard.y + 20,
          animationIds: [],
        };
        addSceneObject(newObj);
        return;
      }

      // Ctrl+D：就地复制选中对象
      if (ctrl && e.key === 'd' && selectedId) {
        e.preventDefault();
        duplicateObject(selectedId);
        return;
      }

      // Ctrl+S：保存文档
      if (ctrl && e.key === 's') {
        e.preventDefault();
        const state = useEditorStore.getState();
        downloadDocument({
          objects: state.objects,
          animations: state.animations,
          globalDurationMs: state.globalDurationMs,
          canvasWidth: state.canvasWidth,
          canvasHeight: state.canvasHeight,
          canvasBgColor: state.canvasBgColor,
        });
        markSaved();
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
        moveMultipleSceneObjectsRef.current(moves);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    removeSceneObjects, addSceneObject, selectObject,
    selectAllObjects, duplicateObject, moveMultipleSceneObjects, undo, redo, markSaved,
  ]);
}
