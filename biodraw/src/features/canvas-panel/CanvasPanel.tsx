import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { useEditorStore } from '../../state/editorStore';
import { SceneObjectRenderer } from '../../render/objects/SceneObjectRenderer';
import type { SceneObject } from '../../types';
import type Konva from 'konva';
import './CanvasPanel.css';

const TEXT_LINE_HEIGHT = 1.2;

const getVerticalEditorSize = (value: string, fontSizePx: number) => {
  const lines = (value || ' ').split('\n');
  const columnCount = Math.max(lines.length, 1);
  const maxCharsInColumn = Math.max(
    ...lines.map((line) => Math.max([...line].length, 1)),
    1,
  );
  const unit = Math.max(fontSizePx * TEXT_LINE_HEIGHT, fontSizePx);
  return {
    width: Math.ceil(columnCount * unit),
    height: Math.ceil(maxCharsInColumn * unit),
  };
};

export function CanvasPanel() {
  type EditingTarget = 'text' | 'name';

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false); // 空格键按下时进入平移模式
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>('text');
  const [editingRect, setEditingRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const objects = useEditorStore(state => state.objects);
  const selectedIds = useEditorStore(state => state.selectedIds);
  const addSceneObject = useEditorStore(state => state.addSceneObject);
  const selectObject = useEditorStore(state => state.selectObject);
  const removeSceneObject = useEditorStore(state => state.removeSceneObject);
  const updateSceneObject = useEditorStore(state => state.updateSceneObject);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);
  const past = useEditorStore(state => state.past);
  const future = useEditorStore(state => state.future);

  // 聚焦编辑器并在首帧同步输入框尺寸，避免首次进入编辑时位置跳变
  useLayoutEffect(() => {
    if (editingTextId && textareaRef.current) {
      const targetObj = objects.find((o) => o.id === editingTextId);
      const isVerticalText =
        editingTarget === 'text'
        && targetObj?.type === 'text'
        && (targetObj.style?.textDirection || 'horizontal') === 'vertical';

      if (!isVerticalText) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }

      textareaRef.current.focus();
      textareaRef.current.select(); // 自动全选，方便修改
      textareaRef.current.scrollLeft = 0;
      textareaRef.current.scrollTop = 0;
    }
  }, [editingTextId, editingTarget, objects]);

  // 响应式 Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 避免在输入框中触发快捷键
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return;
      }

      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }

      if (selectedIds.length === 0) return;
      const selectedId = selectedIds[0];
      const selectedObj = objects.find(o => o.id === selectedId);
      if (!selectedObj) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeSceneObject(selectedId);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateSceneObject(selectedId, { y: selectedObj.y - 1 });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSceneObject(selectedId, { y: selectedObj.y + 1 });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateSceneObject(selectedId, { x: selectedObj.x - 1 });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateSceneObject(selectedId, { x: selectedObj.x + 1 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, objects, removeSceneObject, updateSceneObject, undo, redo]);

  // 空格键控制平移模式
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        setIsPanMode(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsPanMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // 滚轮：Ctrl+滚轮 = 缩放，普通滚轮 = 平移
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    if (e.evt.ctrlKey || e.evt.metaKey) {
      // 缩放：以鼠标位置为中心
      const scaleBy = 1.08;
      const oldScale = stageScale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };

      const direction = e.evt.deltaY < 0 ? 1 : -1;
      const newScale = Math.min(10, Math.max(0.05, direction > 0 ? oldScale * scaleBy : oldScale / scaleBy));

      setStageScale(newScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    } else if (e.evt.shiftKey) {
      // Shift + 滚轮 = 左右平移（普通鼠标 deltaX 始终为 0，需借助 deltaY 映射）
      setStagePos(prev => ({
        x: prev.x - e.evt.deltaY,
        y: prev.y,
      }));
    } else {
      // 普通滚轮 = 上下平移
      setStagePos(prev => ({
        x: prev.x - e.evt.deltaX,
        y: prev.y - e.evt.deltaY,
      }));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // 必须调用，允许元素被放下
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dataString = e.dataTransfer.getData('application/biodraw-material');
    if (!dataString) return;
    
    try {
      const data = JSON.parse(dataString);
      const stage = stageRef.current;
      if (!stage) return;
      
      const containerRect = containerRef.current!.getBoundingClientRect();
      // 逆向映射：将鼠标屏幕坐标转换为画布空间坐标（考虑平移和缩放）
      const rawX = e.clientX - containerRect.left;
      const rawY = e.clientY - containerRect.top;
      const x = (rawX - stagePos.x) / stageScale;
      const y = (rawY - stagePos.y) / stageScale;

      const newObj: SceneObject = {
        id: crypto.randomUUID(),
        type: data.type || 'material',
        name: data.name,
        materialId: data.materialId,
        x: x,
        y: y,
        width: data.width || 80, 
        height: data.height || 80,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        zIndex: objects.length,
        animationIds: [],
        data: data.data || { url: data.url }, // 灵活处理自定义数据或SVG路径
        style: data.style || {}
      };

      addSceneObject(newObj);
    } catch (err) {
      console.error("Failed to parse drop data", err);
    }
  };

  const checkDeselect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // 若正在编辑文字，点击其他地方应结束编辑
    if (editingTextId) {
      commitTextChange();
      return;
    }
    // 若点击的不是具体图形而是舞台背景层，取消所有选中状态
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      selectObject(null);
    }
  };

  const handleEditStart = (
    id: string,
    rect: { x: number, y: number, width: number, height: number },
    target: EditingTarget = 'text',
  ) => {
    const obj = objects.find(o => o.id === id);
    if (!obj) return;
    
    setEditingTextId(id);
    setEditingTarget(target);
    setEditingRect({
      x: rect.x * stageScale + stagePos.x,
      y: rect.y * stageScale + stagePos.y,
      width: rect.width * stageScale,
      height: rect.height * stageScale
    });
    setEditingValue(target === 'name' ? obj.name : ((obj.data?.text as string) || ''));
  };

  const commitTextChange = () => {
    if (editingTextId && textareaRef.current) {
      if (editingTarget === 'name') {
        updateSceneObject(editingTextId, {
          name: editingValue.replace(/\r?\n/g, ' ').trim(),
        });
        setEditingTextId(null);
        setEditingTarget('text');
        setEditingRect(null);
        return;
      }

      const currentObject = objects.find(o => o.id === editingTextId);
      const isVerticalText = currentObject?.type === 'text' && currentObject.style?.textDirection === 'vertical';
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = scrollHeight / stageScale;
      const textFontSize = (currentObject?.style?.fontSize || 18) * stageScale;
      const verticalSize = getVerticalEditorSize(editingValue, textFontSize);

      updateSceneObject(editingTextId, {
        ...(isVerticalText
          ? {
            width: verticalSize.width / stageScale,
            height: verticalSize.height / stageScale,
          }
          : { height: newHeight }),
        data: {
          ...(currentObject?.data || {}),
          text: editingValue,
        }
      });
      setEditingTextId(null);
      setEditingTarget('text');
      setEditingRect(null);
    }
  };

  const editingObject = editingTextId ? objects.find(o => o.id === editingTextId) : null;
  const isVerticalTextEditing =
    editingTarget === 'text'
    && editingObject?.type === 'text'
    && (editingObject.style?.textDirection || 'horizontal') === 'vertical';
  const editorFontSizePx = ((editingObject?.style?.fontSize || (editingTarget === 'name' ? 14 : 18)) * stageScale);
  const verticalEditorSize = isVerticalTextEditing
    ? getVerticalEditorSize(editingValue, editorFontSizePx)
    : null;
  const horizontalTextEditOffset =
    editingTarget === 'text' && !isVerticalTextEditing ? 1 : 0;

  return (
    <main className="canvas-panel">
      <div 
        className="canvas-wrapper" 
        ref={containerRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {dimensions.width > 0 && dimensions.height > 0 ? (
        <Stage 
            width={dimensions.width} 
            height={dimensions.height}
            ref={stageRef}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            draggable={isPanMode}
            onDragEnd={() => {
              const stage = stageRef.current;
              if (stage) setStagePos({ x: stage.x(), y: stage.y() });
            }}
            onWheel={handleWheel}
            onMouseDown={checkDeselect}
            onTouchStart={checkDeselect}
            style={{ cursor: isPanMode ? 'grab' : 'default' }}
          >
            <Layer>
              {objects.map((obj) => (
                <SceneObjectRenderer 
                  key={obj.id} 
                  sceneObject={obj}
                  isSelected={selectedIds.includes(obj.id)}
                  onSelect={() => selectObject(obj.id)}
                  onEditStart={handleEditStart}
                  isEditing={editingTextId === obj.id}
                />
              ))}
            </Layer>
          </Stage>
        ) : (
          <div className="canvas-placeholder">画布初始化中...</div>
        )}

        {/* 文字编辑遮罩层 */}
        {editingTextId && editingRect && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {/* 容器层：负责定位和垂直居中 */}
            <div
              style={{
                position: 'absolute',
                top: `${editingRect.y + horizontalTextEditOffset}px`,
                left: `${editingRect.x + horizontalTextEditOffset}px`,
                width: `${editingRect.width}px`,
                height: `${editingRect.height}px`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center', // 垂直居中
                justifyContent: 'center', // 水平居中
                pointerEvents: 'none',
              }}
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={editingValue}
                onChange={(e) => {
                  setEditingValue(e.target.value);
                  if (!isVerticalTextEditing) {
                    // 横排动态调整高度以适配内容
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }
                }}
                onBlur={commitTextChange}
                onFocus={(e) => {
                  if (!isVerticalTextEditing) {
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    commitTextChange();
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitTextChange();
                  } else if (e.key === 'Escape') {
                    setEditingTextId(null);
                    setEditingTarget('text');
                    setEditingRect(null);
                  }
                }}
                style={{
                  width: isVerticalTextEditing ? `${verticalEditorSize?.width || editingRect.width}px` : '100%',
                  height: isVerticalTextEditing ? `${verticalEditorSize?.height || editingRect.height}px` : 'auto',
                  fontSize: `${editorFontSizePx}px`,
                  fontFamily: editingObject?.style?.fontFamily || 'sans-serif',
                  color: editingObject?.style?.fill || (editingTarget === 'name' ? '#334155' : '#1e293b'),
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  textAlign: editingObject?.style?.textAlign || 'center',
                  padding: 0,
                  margin: 0,
                  overflow: 'hidden',
                  pointerEvents: 'auto',
                  lineHeight: TEXT_LINE_HEIGHT,
                  writingMode: isVerticalTextEditing ? 'vertical-rl' : 'horizontal-tb',
                  textOrientation: isVerticalTextEditing ? 'upright' : 'mixed',
                  whiteSpace: 'pre-wrap',
                  caretColor: editingObject?.style?.fill || (editingTarget === 'name' ? '#334155' : '#4f46e5'),
                }}
              />
            </div>
          </div>
        )}

        {/* 右上角悬浮撤销/重做控制条 */}
        <div style={{
          position: 'absolute', top: '12px', right: '12px',
          display: 'flex', alignItems: 'center', gap: '2px',
          backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)',
          borderRadius: '8px', padding: '4px 6px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 100, userSelect: 'none',
        }}>
          <button
            onClick={undo}
            disabled={past.length === 0}
            title="撤销 (Ctrl+Z)"
            style={{
              background: 'none', border: 'none', cursor: past.length === 0 ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)', fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
              opacity: past.length === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (past.length > 0) { e.currentTarget.style.backgroundColor = 'var(--bg-color)'; e.currentTarget.style.color = 'var(--text-main)'; } }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>↶</span>
            <span>撤销</span>
          </button>
          <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)' }} />
          <button
            onClick={redo}
            disabled={future.length === 0}
            title="重做 (Ctrl+Y)"
            style={{
              background: 'none', border: 'none', cursor: future.length === 0 ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)', fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
              opacity: future.length === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', gap: '4px',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (future.length > 0) { e.currentTarget.style.backgroundColor = 'var(--bg-color)'; e.currentTarget.style.color = 'var(--text-main)'; } }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>↷</span>
            <span>重做</span>
          </button>
        </div>

        {/* 右下角悬浮缩放控制条 */}
        <div style={{
          position: 'absolute', bottom: '12px', right: '12px',
          display: 'flex', alignItems: 'center', gap: '4px',
          backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)',
          borderRadius: '8px', padding: '4px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 100, userSelect: 'none',
        }}>
          <button
            onClick={() => {
              const newScale = Math.max(0.05, stageScale / 1.2);
              const cx = dimensions.width / 2;
              const cy = dimensions.height / 2;
              const pointTo = { x: (cx - stagePos.x) / stageScale, y: (cy - stagePos.y) / stageScale };
              setStageScale(newScale);
              setStagePos({ x: cx - pointTo.x * newScale, y: cy - pointTo.y * newScale });
            }}
            title="缩小"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
          >−</button>
          <button
            onClick={() => { setStageScale(1); setStagePos({ x: 0, y: 0 }); }}
            title="重置到 100%"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', minWidth: '44px', textAlign: 'center', padding: '0 4px' }}
          >
            {Math.round(stageScale * 100)}%
          </button>
          <button
            onClick={() => {
              const newScale = Math.min(10, stageScale * 1.2);
              const cx = dimensions.width / 2;
              const cy = dimensions.height / 2;
              const pointTo = { x: (cx - stagePos.x) / stageScale, y: (cy - stagePos.y) / stageScale };
              setStageScale(newScale);
              setStagePos({ x: cx - pointTo.x * newScale, y: cy - pointTo.y * newScale });
            }}
            title="放大"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
          >+</button>
        </div>
      </div>
    </main>
  );
}
