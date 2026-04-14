import { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { downloadDocument } from '../infrastructure/documentSerializer';
import type { SceneObject } from '../types';

// 模块级剪贴板，跨渲染保持（支持多选）
let clipboard: SceneObject[] = [];

export function useEditorKeyboard() {
  const selectedIds              = useEditorStore((s) => s.selectedIds);
  const objects                  = useEditorStore((s) => s.objects);
  const playbackStatus           = useEditorStore((s) => s.playbackStatus);
  const removeSceneObjects       = useEditorStore((s) => s.removeSceneObjects);
  const addSceneObject           = useEditorStore((s) => s.addSceneObject);
  const selectObject             = useEditorStore((s) => s.selectObject);
  const selectAllObjects         = useEditorStore((s) => s.selectAllObjects);
  const duplicateObject          = useEditorStore((s) => s.duplicateObject);
  const groupObjects             = useEditorStore((s) => s.groupObjects);
  const ungroupObjects           = useEditorStore((s) => s.ungroupObjects);
  const moveMultipleSceneObjects = useEditorStore((s) => s.moveMultipleSceneObjects);
  const play                     = useEditorStore((s) => s.play);
  const pause                    = useEditorStore((s) => s.pause);
  const undo                     = useEditorStore((s) => s.undo);
  const redo                     = useEditorStore((s) => s.redo);
  const markSaved                = useEditorStore((s) => s.markSaved);
  const isPreviewMode            = useEditorStore((s) => s.isPreviewMode);
  const setPreviewMode           = useEditorStore((s) => s.setPreviewMode);

  // Refs 避免 stale closure
  const selectedIdsRef              = useRef(selectedIds);
  const objectsRef                  = useRef(objects);
  const playbackRef                 = useRef(playbackStatus);
  const moveMultipleSceneObjectsRef = useRef(moveMultipleSceneObjects);
  const isPreviewModeRef            = useRef(isPreviewMode);

  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { playbackRef.current = playbackStatus; }, [playbackStatus]);
  useEffect(() => { moveMultipleSceneObjectsRef.current = moveMultipleSceneObjects; }, [moveMultipleSceneObjects]);
  useEffect(() => { isPreviewModeRef.current = isPreviewMode; }, [isPreviewMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 不拦截输入框内的按键
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      const selectedAll = selectedIdsRef.current;
      const ctrl = e.ctrlKey || e.metaKey;

      // Space：播放 / 暂停
      if (e.key === ' ') {
        e.preventDefault();
        if (playbackRef.current === 'playing') pause();
        else play();
        return;
      }

      // Delete / Backspace：删除所有选中对象
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAll.length > 0) {
        e.preventDefault();
        removeSceneObjects(selectedAll);
        return;
      }

      // Escape：优先退出预览模式，否则取消选中
      if (e.key === 'Escape') {
        if (isPreviewModeRef.current) { setPreviewMode(false); return; }
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

      // Ctrl+Shift+Z / Ctrl+Y：重做
      if ((ctrl && e.shiftKey && e.key.toLowerCase() === 'z') || (ctrl && e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+C：复制所有选中对象
      if (ctrl && e.key === 'c' && selectedAll.length > 0) {
        clipboard = objectsRef.current
          .filter((o) => selectedAll.includes(o.id))
          .map((o) => JSON.parse(JSON.stringify(o)));
        return;
      }

      // Ctrl+V：粘贴（每个偏移 +20px）
      if (ctrl && e.key === 'v' && clipboard.length > 0) {
        e.preventDefault();
        clipboard.forEach((src) => {
          const newObj: SceneObject = {
            ...JSON.parse(JSON.stringify(src)),
            id: crypto.randomUUID(),
            x: src.x + 20,
            y: src.y + 20,
            animationIds: [],
          };
          addSceneObject(newObj);
        });
        return;
      }

      // Ctrl+D：就地复制所有选中对象
      if (ctrl && e.key === 'd' && selectedAll.length > 0) {
        e.preventDefault();
        selectedAll.forEach((id) => duplicateObject(id));
        return;
      }

      // Ctrl+G：组合选中对象（≥2个）
      if (ctrl && !e.shiftKey && e.key === 'g' && selectedAll.length >= 2) {
        e.preventDefault();
        groupObjects(selectedAll);
        return;
      }

      // Ctrl+Shift+G：取消组合
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'g' && selectedAll.length > 0) {
        e.preventDefault();
        const obj = objectsRef.current.find((o) => selectedAll.includes(o.id) && o.groupId);
        if (obj?.groupId) ungroupObjects(obj.groupId);
        return;
      }

      // Ctrl+S：保存文档
      if (ctrl && e.key === 's') {
        e.preventDefault();
        const state = useEditorStore.getState();
        const fileName = downloadDocument({
          objects: state.objects,
          animations: state.animations,
          globalDurationMs: state.globalDurationMs,
          canvasWidth: state.canvasWidth,
          canvasHeight: state.canvasHeight,
          canvasBgColor: state.canvasBgColor,
        });
        markSaved(fileName);
        return;
      }

      // F 键：切换全屏预览模式（进入时自动播放）
      if (e.key === 'f' && !ctrl) {
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
        moveMultipleSceneObjectsRef.current(moves);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    removeSceneObjects, addSceneObject, selectObject,
    selectAllObjects, duplicateObject, groupObjects, ungroupObjects,
    play, pause, undo, redo, markSaved, setPreviewMode, isPreviewMode,
  ]);
}
