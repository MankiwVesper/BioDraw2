import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import { useEditorStore } from '../../state/editorStore';
import { SvgMaterialRenderer } from '../../render/objects/SvgMaterialRenderer';
import type { SceneObject } from '../../types';
import './CanvasPanel.css';

export function CanvasPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const objects = useEditorStore(state => state.objects);
  const selectedIds = useEditorStore(state => state.selectedIds);
  const addSceneObject = useEditorStore(state => state.addSceneObject);
  const selectObject = useEditorStore(state => state.selectObject);

  // 响应式 Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;

      const newObj: SceneObject = {
        id: crypto.randomUUID(),
        type: 'material',
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
        data: { url: data.url } // 将真实SVG加载路径传递给渲染器
      };

      addSceneObject(newObj);
    } catch (err) {
      console.error("Failed to parse drop data", err);
    }
  };

  const checkDeselect = (e: any) => {
    // 若点击的不是具体图形而是舞台背景层，取消所有选中状态
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      selectObject(null);
    }
  };

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
            onMouseDown={checkDeselect}
            onTouchStart={checkDeselect}
          >
            <Layer>
              {objects.map((obj) => (
                <SvgMaterialRenderer 
                  key={obj.id} 
                  sceneObject={obj}
                  isSelected={selectedIds.includes(obj.id)}
                  onSelect={() => selectObject(obj.id)}
                />
              ))}
            </Layer>
          </Stage>
        ) : (
          <div className="canvas-placeholder">画布初始化中...</div>
        )}
      </div>
    </main>
  );
}
