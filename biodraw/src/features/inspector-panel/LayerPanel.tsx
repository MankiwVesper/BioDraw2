import React, { useState, useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import type { SceneObject } from '../../types';

// ── 对象类型图标 ────────────────────────────────────────────────────────────
const TYPE_ICON: Record<string, string> = {
  material:  '🖼',
  rect:      '▭',
  circle:    '○',
  line:      '╱',
  arrow:     '→',
  text:      'T',
  triangle:  '△',
  trapezoid: '⏢',
  curve:     '∿',
};

// ── 拖拽排序辅助 ─────────────────────────────────────────────────────────────
function useLayerDnD(
  onReorder: (fromIndex: number, toIndex: number) => void,
) {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const onDragStart = (index: number) => {
    dragIndexRef.current = index;
  };
  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
      onReorder(dragIndexRef.current, index);
    }
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };
  const onDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  return { onDragStart, onDragOver, onDrop, onDragEnd, dragOverIndex };
}

// ── 主组件 ───────────────────────────────────────────────────────────────────
export function LayerPanel() {
  const objects        = useEditorStore((s) => s.objects);
  const selectedIds    = useEditorStore((s) => s.selectedIds);
  const selectObject   = useEditorStore((s) => s.selectObject);
  const toggleSelectObject = useEditorStore((s) => s.toggleSelectObject);
  const updateSceneObject  = useEditorStore((s) => s.updateSceneObject);
  const toggleObjectLock   = useEditorStore((s) => s.toggleObjectLock);
  const moveObjectForward  = useEditorStore((s) => s.moveObjectForward);
  const moveObjectBackward = useEditorStore((s) => s.moveObjectBackward);

  // 从顶层到底层显示（反转 objects 数组，因为 objects 末尾 = 最顶层）
  const layerOrder = [...objects].reverse();

  // ── 重命名状态 ──────────────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = (obj: SceneObject, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(obj.id);
    setRenameValue(obj.name);
    setTimeout(() => renameInputRef.current?.select(), 30);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      updateSceneObject(renamingId, { name: renameValue.trim() });
    }
    setRenamingId(null);
  };

  // ── 拖拽重排 ─────────────────────────────────────────────────────────────
  // layerOrder index 0 = 最顶层 (objects末尾), index N = 最底层 (objects开头)
  // 拖拽 fromIndex → toIndex 需要对 objects 数组做对应的 z-order 操作
  const handleReorder = (fromLayerIdx: number, toLayerIdx: number) => {
    // 在 objects 数组中的真实 index
    const fromObjIdx = objects.length - 1 - fromLayerIdx;
    const toObjIdx   = objects.length - 1 - toLayerIdx;
    const id = objects[fromObjIdx]?.id;
    if (!id) return;
    // 用 moveObjectToFront/Back 不适合精确定位，直接用 Forward/Backward 多次
    // 简单策略：先移到 front/back，再用 forward/backward 调整
    // 更简单：直接 dispatch 一个新的 reorderObjects action（需要在 store 中添加）
    // 目前用循环 moveObjectForward/Backward 近似处理
    if (fromObjIdx < toObjIdx) {
      // 需要下移 (向 back 移动)
      for (let i = fromObjIdx; i < toObjIdx; i++) {
        moveObjectBackward(id);
      }
    } else {
      // 需要上移 (向 front 移动)
      for (let i = fromObjIdx; i > toObjIdx; i--) {
        moveObjectForward(id);
      }
    }
  };

  const dnd = useLayerDnD(handleReorder);

  if (objects.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        画布上还没有对象
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
      {layerOrder.map((obj, layerIdx) => {
        const isSelected = selectedIds.includes(obj.id);
        const isDragOver = dnd.dragOverIndex === layerIdx;
        const isInGroup  = !!obj.groupId;

        return (
          <div
            key={obj.id}
            draggable
            onDragStart={() => dnd.onDragStart(layerIdx)}
            onDragOver={(e) => dnd.onDragOver(e, layerIdx)}
            onDrop={(e) => dnd.onDrop(e, layerIdx)}
            onDragEnd={dnd.onDragEnd}
            onClick={(e) => {
              if (renamingId) return;
              if (e.shiftKey) toggleSelectObject(obj.id);
              else selectObject(obj.id);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px 4px 12px',
              cursor: 'pointer',
              userSelect: 'none',
              borderTop: isDragOver ? '2px solid var(--primary-color)' : '2px solid transparent',
              background: isSelected
                ? 'rgba(59,130,246,0.10)'
                : 'transparent',
              borderLeft: isSelected
                ? '2px solid var(--primary-color)'
                : '2px solid transparent',
            }}
          >
            {/* 拖拽把手 */}
            <span
              style={{ color: 'var(--text-muted)', fontSize: 11, cursor: 'grab', flexShrink: 0, opacity: 0.5 }}
              data-tooltip="拖拽调整层级"
            >⠿</span>

            {/* 分组缩进线 */}
            {isInGroup && (
              <span style={{ width: 8, flexShrink: 0, borderLeft: '2px solid var(--border-color)', alignSelf: 'stretch', marginLeft: 2 }} />
            )}

            {/* 类型图标 */}
            <span style={{ fontSize: 12, flexShrink: 0, width: 18, textAlign: 'center', color: 'var(--text-muted)' }}>
              {TYPE_ICON[obj.type] || '◻'}
            </span>

            {/* 对象名 / 重命名输入框 */}
            <div style={{ flex: 1, minWidth: 0 }} onDoubleClick={(e) => startRename(obj, e)}>
              {renamingId === obj.id ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    fontSize: 12,
                    padding: '1px 4px',
                    border: '1px solid var(--primary-color)',
                    borderRadius: 6,
                    background: 'var(--bg-color)',
                    color: 'var(--text-main)',
                    outline: 'none',
                  }}
                  autoFocus
                />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: obj.visible === false ? 'var(--text-muted)' : 'var(--text-main)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: obj.visible === false ? 'line-through' : 'none',
                  }}
                  data-tooltip={`${obj.name}（双击重命名）`}
                >
                  {obj.name}
                </span>
              )}
            </div>

            {/* 可见性切换 */}
            <button
              data-tooltip={obj.visible === false ? '显示对象' : '隐藏对象'}
              onClick={(e) => {
                e.stopPropagation();
                updateSceneObject(obj.id, { visible: obj.visible === false ? true : false });
              }}
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                opacity: obj.visible === false ? 0.35 : 0.7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                padding: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--border-color)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = obj.visible === false ? '0.35' : '0.7'; e.currentTarget.style.background = 'transparent'; }}
            >
              {obj.visible === false ? '🙈' : '👁'}
            </button>

            {/* 锁定切换 */}
            <button
              data-tooltip={obj.locked ? '解锁对象' : '锁定对象'}
              onClick={(e) => {
                e.stopPropagation();
                toggleObjectLock(obj.id);
              }}
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 12,
                opacity: obj.locked ? 1 : 0.35,
                color: obj.locked ? 'var(--primary-color)' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                padding: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--border-color)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = obj.locked ? '1' : '0.35'; e.currentTarget.style.background = 'transparent'; }}
            >
              {obj.locked ? '🔒' : '🔓'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
