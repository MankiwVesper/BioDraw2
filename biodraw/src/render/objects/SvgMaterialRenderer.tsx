import { useRef, useEffect } from 'react';
import { Image as KonvaImage, Transformer, Group } from 'react-konva';
import useImage from 'use-image';
import type { SceneObject } from '../../types';
import { useEditorStore } from '../../state/editorStore';
import type Konva from 'konva';

interface Props {
  sceneObject: SceneObject;
  isSelected: boolean;
  onSelect: () => void;
}

export function SvgMaterialRenderer({ sceneObject, isSelected, onSelect }: Props) {
  const trRef = useRef<Konva.Transformer>(null);
  const imageRef = useRef<Konva.Image>(null);
  
  // 利用 use-image 方便地加载外部 SVG
  const url = sceneObject.data?.url as string;
  const [image] = useImage(url);

  const updateSceneObject = useEditorStore(state => state.updateSceneObject);
  const isRatioLocked = useEditorStore(state => state.isRatioLocked);

  // 处理选中状态框的绑定
  useEffect(() => {
    if (isSelected && trRef.current && imageRef.current) {
      // 若处于选中状态，将变形控制框绑定在当前图片身上
      trRef.current.nodes([imageRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  // 画板内随意拖拽结束回调
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    updateSceneObject(sceneObject.id, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  // 画板内缩放、旋转结束回调
  const handleTransformEnd = () => {
    const node = imageRef.current;
    if (!node) return;
    
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    
    updateSceneObject(sceneObject.id, {
      x: node.x(),
      y: node.y(),
      scaleX,
      scaleY,
      rotation,
    });
  };

  return (
    <Group>
      <KonvaImage
        ref={imageRef}
        image={image}
        x={sceneObject.x}
        y={sceneObject.y}
        offsetX={sceneObject.width / 2}
        offsetY={sceneObject.height / 2}
        width={sceneObject.width}
        height={sceneObject.height}
        rotation={sceneObject.rotation}
        scaleX={sceneObject.scaleX}
        scaleY={sceneObject.scaleY}
        draggable
        dragBoundFunc={(pos) => {
          const stage = imageRef.current?.getStage();
          if (!stage) return pos;
          return {
            x: Math.max(0, Math.min(pos.x, stage.width())),
            y: Math.max(0, Math.min(pos.y, stage.height()))
          };
        }}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onClick={onSelect}
        onTap={onSelect}
      />
      {isSelected && (
        <Transformer 
          ref={trRef}
          keepRatio={isRatioLocked}
          enabledAnchors={isRatioLocked 
            ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
            : ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']
          }
          anchorSize={5}
          rotateAnchorCursor={`url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%2012a9%209%200%201%200%209-9%209.75%209.75%200%200%200-6.74%202.74L3%208%22%2F%3E%3Cpath%20d%3D%22M3%203v5h5%22%2F%3E%3C%2Fsvg%3E") 10 10, auto`}
          boundBoxFunc={(oldBox, newBox) => {
            // 限制变形尺寸避免反向翻转和越界
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </Group>
  );
}
