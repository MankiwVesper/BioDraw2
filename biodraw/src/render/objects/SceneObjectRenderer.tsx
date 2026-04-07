import { useRef, useEffect, useState } from 'react';
import { Rect, Circle, Line, Text, Image as KonvaImage, Transformer, Group, RegularPolygon } from 'react-konva';
import useImage from 'use-image';
import type { SceneObject } from '../../types';
import { useEditorStore } from '../../state/editorStore';
import type Konva from 'konva';

interface Props {
  sceneObject: SceneObject;
  isSelected: boolean;
  onSelect: () => void;
  onEditStart?: (id: string, rect: { x: number, y: number, width: number, height: number }, target?: 'text' | 'name') => void;
  isEditing?: boolean;
}

const DEFAULT_CURVE_POINTS = [0, 50, 50, 0, 100, 50];
const DEFAULT_LINE_POINTS = [0, 0, 100, 100];
const MATERIAL_NAME_MAX_LENGTH = 20;
const MATERIAL_NAME_LABEL_MIN_HEIGHT = 22;

export function SceneObjectRenderer({ sceneObject, isSelected, onSelect, onEditStart, isEditing }: Props) {
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRef = useRef<Konva.Node>(null);
  const [curveDraftPoints, setCurveDraftPoints] = useState<number[] | null>(null);
  
  // 当物体 ID 或数据点变化时，通过渲染过程中同步更新状态来重置草稿点（避免 useEffect 的性能报警）
  const currentPoints = (sceneObject.data?.points as number[]) || DEFAULT_CURVE_POINTS;
  const [prevId, setPrevId] = useState(sceneObject.id);
  const [prevDataPoints, setPrevDataPoints] = useState(currentPoints);

  if (prevId !== sceneObject.id || prevDataPoints !== currentPoints) {
    setPrevId(sceneObject.id);
    setPrevDataPoints(currentPoints);
    setCurveDraftPoints(sceneObject.type === 'curve' ? currentPoints : null);
  }

  // 利用 use-image 方便地加载素材图片（SVG/PNG）
  const url = sceneObject.type === 'material' ? (sceneObject.data?.url as string) : '';
  const [image] = useImage(url);

  const updateSceneObject = useEditorStore(state => state.updateSceneObject);
  const isRatioLocked = useEditorStore(state => state.isRatioLocked);

  // 处理选中状态框的绑定
  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, sceneObject.type]);

  // 画板内随意拖拽结束回调
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.currentTarget) return;

    updateSceneObject(sceneObject.id, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  // 画板内缩放、旋转结束回调
  const handleTransformEnd = () => {
    const node = shapeRef.current;
    if (!node) return;
    
    updateSceneObject(sceneObject.id, {
      x: node.x(),
      y: node.y(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      rotation: node.rotation(),
    });
  };

  const commonProps = {
    x: sceneObject.x,
    y: sceneObject.y,
    rotation: sceneObject.rotation,
    scaleX: sceneObject.scaleX,
    scaleY: sceneObject.scaleY,
    draggable: true,
    onDragEnd: handleDragEnd,
    onTransformEnd: handleTransformEnd,
    onClick: onSelect,
    onTap: onSelect,
    opacity: sceneObject.opacity,
  };

  const getCurvePoints = () => {
    if (curveDraftPoints) return curveDraftPoints;
    return (sceneObject.data?.points as number[]) || DEFAULT_CURVE_POINTS;
  };

  const commitCurvePoints = (nextPoints: number[]) => {
    setCurveDraftPoints(nextPoints);
    updateSceneObject(sceneObject.id, {
      data: {
        ...(sceneObject.data || {}),
        points: nextPoints,
      },
    });
  };

  const commitLinePoints = (nextPoints: number[]) => {
    updateSceneObject(sceneObject.id, {
      data: {
        ...(sceneObject.data || {}),
        points: nextPoints,
      },
    });
  };

  const renderContent = () => {
    switch (sceneObject.type) {
      case 'material': {
        const normalizedName = (sceneObject.name || '').replace(/\r?\n/g, ' ').trim();
        const displayName = normalizedName.length > MATERIAL_NAME_MAX_LENGTH
          ? `${normalizedName.slice(0, MATERIAL_NAME_MAX_LENGTH)}...`
          : normalizedName;
        const nameFontSize = sceneObject.style?.fontSize || 14;
        const nameFontFamily = sceneObject.style?.fontFamily || 'sans-serif';
        const nameColor = sceneObject.style?.fill || '#334155';
        const nameAlign = sceneObject.style?.textAlign || 'center';
        const nameYOffset = sceneObject.height / 2 + 8;
        return (
          <Group
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Group>}
          >
            <KonvaImage
              image={image}
              width={sceneObject.width}
              height={sceneObject.height}
              offsetX={sceneObject.width / 2}
              offsetY={sceneObject.height / 2}
            />
            <Text
              visible={!isEditing}
              text={displayName}
              width={sceneObject.width}
              x={-sceneObject.width / 2}
              y={nameYOffset}
              align={nameAlign}
              fontSize={nameFontSize}
              fontFamily={nameFontFamily}
              fill={nameColor}
              lineHeight={1.2}
              wrap="char"
              onDblClick={(e) => {
                if (onEditStart) {
                  const node = e.currentTarget;
                  const pos = node.getAbsolutePosition();
                  const scale = node.getAbsoluteScale();
                  const editHeight = Math.max(node.height(), MATERIAL_NAME_LABEL_MIN_HEIGHT);
                  const centerX = pos.x + (sceneObject.width * scale.x) / 2;
                  const centerY = pos.y + (editHeight * scale.y) / 2;
                  onEditStart(sceneObject.id, {
                    x: centerX,
                    y: centerY,
                    width: node.width() * scale.x,
                    height: editHeight * scale.y,
                  }, 'name');
                }
              }}
              onDblTap={(e) => {
                if (onEditStart) {
                  const node = e.currentTarget;
                  const pos = node.getAbsolutePosition();
                  const scale = node.getAbsoluteScale();
                  const editHeight = Math.max(node.height(), MATERIAL_NAME_LABEL_MIN_HEIGHT);
                  const centerX = pos.x + (sceneObject.width * scale.x) / 2;
                  const centerY = pos.y + (editHeight * scale.y) / 2;
                  onEditStart(sceneObject.id, {
                    x: centerX,
                    y: centerY,
                    width: node.width() * scale.x,
                    height: editHeight * scale.y,
                  }, 'name');
                }
              }}
              onMouseEnter={(e) => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'text';
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'default';
              }}
            />
          </Group>
        );
      }
      case 'rect':
        return (
          <Rect
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Rect>}
            width={sceneObject.width}
            height={sceneObject.height}
            offsetX={sceneObject.width / 2}
            offsetY={sceneObject.height / 2}
            fill={sceneObject.style?.fill || '#3b82f6'}
            stroke={sceneObject.style?.stroke || '#1d4ed8'}
            strokeWidth={sceneObject.style?.strokeWidth || 1}
            cornerRadius={sceneObject.style?.cornerRadius || 0}
          />
        );
      case 'circle':
        return (
          <Circle
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Circle>}
            radius={sceneObject.width / 2}
            fill={sceneObject.style?.fill || '#ef4444'}
            stroke={sceneObject.style?.stroke || '#b91c1c'}
            strokeWidth={sceneObject.style?.strokeWidth || 1}
          />
        );
      case 'trapezoid': {
        const inset = sceneObject.width * 0.2;
        return (
          <Line
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Line>}
            points={[
              inset, 0,
              sceneObject.width - inset, 0,
              sceneObject.width, sceneObject.height,
              0, sceneObject.height,
            ]}
            closed
            offsetX={sceneObject.width / 2}
            offsetY={sceneObject.height / 2}
            fill={sceneObject.style?.fill || '#f59e0b'}
            stroke={sceneObject.style?.stroke || '#b45309'}
            strokeWidth={sceneObject.style?.strokeWidth || 1}
            lineJoin="round"
          />
        );
      }
      case 'text':
        return (
          <Text
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Text>}
            visible={!isEditing}
            text={(sceneObject.data?.text as string) || '点击输入内容'}
            fontSize={sceneObject.style?.fontSize || 18}
            fontFamily={sceneObject.style?.fontFamily || 'sans-serif'}
            fill={sceneObject.style?.fill || '#1e293b'}
            width={sceneObject.width}
            height={sceneObject.height}
            offsetX={sceneObject.width / 2}
            offsetY={sceneObject.height / 2}
            align={sceneObject.style?.textAlign || 'center'}
            verticalAlign="middle"
            onDblClick={(e) => {
              if (onEditStart) {
                const node = e.currentTarget;
                const pos = node.getAbsolutePosition();
                const scale = node.getAbsoluteScale();
                onEditStart(sceneObject.id, {
                  x: pos.x,
                  y: pos.y,
                  width: sceneObject.width * scale.x,
                  height: sceneObject.height * scale.y,
                });
              }
            }}
            onDblTap={(e) => {
              if (onEditStart) {
                const node = e.currentTarget;
                const pos = node.getAbsolutePosition();
                const scale = node.getAbsoluteScale();
                onEditStart(sceneObject.id, {
                  x: pos.x,
                  y: pos.y,
                  width: sceneObject.width * scale.x,
                  height: sceneObject.height * scale.y,
                });
              }
            }}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'text';
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />
        );
      case 'curve': {
        const points = getCurvePoints();
        return (
          <Group
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Group>}
          >
            <Line
              key={`${sceneObject.id}-${sceneObject.data?.dashStyle || 'solid'}`}
              points={points}
              stroke={sceneObject.style?.stroke || '#4f46e5'}
              strokeWidth={sceneObject.style?.strokeWidth || 3}
              hitStrokeWidth={15}
              dash={
                sceneObject.data?.dashStyle === 'dashed' ? [10, 5] :
                sceneObject.data?.dashStyle === 'dotted' ? [2, 4] :
                undefined
              }
              tension={0.5}
              lineCap="round"
              lineJoin="round"
            />
            {isSelected &&
              Array.from({ length: points.length / 2 }).map((_, pointIndex) => (
                <Circle
                  key={`curve-point-${pointIndex}`}
                  x={points[pointIndex * 2]}
                  y={points[pointIndex * 2 + 1]}
                  radius={3}
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth={2}
                  draggable
                  onMouseDown={(e) => {
                    e.cancelBubble = true;
                  }}
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                  }}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    onSelect();
                  }}
                  onTap={(e) => {
                    e.cancelBubble = true;
                    onSelect();
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    const nextPoints = [...points];
                    nextPoints[pointIndex * 2] = e.target.x();
                    nextPoints[pointIndex * 2 + 1] = e.target.y();
                    setCurveDraftPoints(nextPoints);
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    const nextPoints = [...points];
                    nextPoints[pointIndex * 2] = e.target.x();
                    nextPoints[pointIndex * 2 + 1] = e.target.y();
                    commitCurvePoints(nextPoints);
                  }}
                />
              ))}
          </Group>
        );
      }
      case 'line':
      case 'arrow': {
        const points = (sceneObject.data?.points as number[]) || DEFAULT_LINE_POINTS;
        
        if (sceneObject.type === 'arrow') {
          const style = (sceneObject.data?.arrowStyle as string) || 'single';
          const atStart = style === 'double' || style === 'start';
          const atEnd = style === 'double' || style === 'single';
          const strokeWidth = sceneObject.style?.strokeWidth || 2;
          const headLen = Math.max(10, strokeWidth * 3);
          const headAngle = Math.PI / 6;
          const offsetDist = headLen * Math.cos(headAngle);

          // 计算缩短后的杆部路径
          const getShaftPoints = () => {
            const newPoints = [...points];
            if (newPoints.length < 4) return newPoints;

            // 处理起点缩进
            if (atStart) {
              const dx = newPoints[2] - newPoints[0];
              const dy = newPoints[3] - newPoints[1];
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > offsetDist) {
                newPoints[0] = newPoints[0] + (dx / dist) * offsetDist;
                newPoints[1] = newPoints[1] + (dy / dist) * offsetDist;
              }
            }

            // 处理终点缩进
            if (atEnd) {
              const len = newPoints.length;
              const dx = newPoints[len - 4] - newPoints[len - 2];
              const dy = newPoints[len - 3] - newPoints[len - 1];
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > offsetDist) {
                newPoints[len - 2] = newPoints[len - 2] + (dx / dist) * offsetDist;
                newPoints[len - 1] = newPoints[len - 1] + (dy / dist) * offsetDist;
              }
            }
            return newPoints;
          };

          const shaftPoints = getShaftPoints();

          // 计算箭头头部的几何参数
          const renderArrowHead = (isStart: boolean) => {
            // 注意：箭头尖端始终在坐标原始定义的位置
            const p1 = isStart ? { x: points[2], y: points[3] } : { x: points[points.length - 4], y: points[points.length - 3] };
            const p2 = isStart ? { x: points[0], y: points[1] } : { x: points[points.length - 2], y: points[points.length - 1] };
            
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

            return (
              <Line
                points={[
                  p2.x - headLen * Math.cos(angle - headAngle), p2.y - headLen * Math.sin(angle - headAngle),
                  p2.x, p2.y,
                  p2.x - headLen * Math.cos(angle + headAngle), p2.y - headLen * Math.sin(angle + headAngle),
                ]}
                stroke={sceneObject.style?.stroke || '#334155'}
                fill={sceneObject.style?.stroke || '#334155'}
                strokeWidth={1}
                closed={true}
                lineJoin="miter"
                lineCap="butt"
              />
            );
          };

          return (
            <Group
              {...commonProps}
              ref={shapeRef as React.RefObject<Konva.Group>}
            >
              {/* 杆部：使用计算后的 shaftPoints，端点改为 butt */}
              <Line
                points={shaftPoints}
                stroke={sceneObject.style?.stroke || '#334155'}
                strokeWidth={sceneObject.style?.strokeWidth || 2}
                hitStrokeWidth={15}
                lineCap="butt"
                dash={
                  sceneObject.data?.dashStyle === 'dashed' ? [10, 5] :
                  sceneObject.data?.dashStyle === 'dotted' ? [2, 4] :
                  undefined
                }
              />
              {/* 手动渲染头部 */}
              {atStart && renderArrowHead(true)}
              {atEnd && renderArrowHead(false)}
              {isSelected &&
                [0, 1].map((pointIndex) => (
                  <Circle
                    key={`arrow-point-${pointIndex}`}
                    x={points[pointIndex * 2]}
                    y={points[pointIndex * 2 + 1]}
                    radius={3}
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth={2}
                    draggable
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                    }}
                    onDragStart={(e) => {
                      e.cancelBubble = true;
                    }}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      onSelect();
                    }}
                    onTap={(e) => {
                      e.cancelBubble = true;
                      onSelect();
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true;
                      const nextPoints = [...points];
                      nextPoints[pointIndex * 2] = e.target.x();
                      nextPoints[pointIndex * 2 + 1] = e.target.y();
                      e.target.getLayer()?.batchDraw();
                      commitLinePoints(nextPoints);
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true;
                      const nextPoints = [...points];
                      nextPoints[pointIndex * 2] = e.target.x();
                      nextPoints[pointIndex * 2 + 1] = e.target.y();
                      commitLinePoints(nextPoints);
                    }}
                  />
                ))}
            </Group>
          );
        } else {
          // 普通直线 (Line) 逻辑
          return (
            <Group
              {...commonProps}
              ref={shapeRef as React.RefObject<Konva.Group>}
            >
              <Line
                key={`${sceneObject.id}-${sceneObject.data?.dashStyle || 'solid'}`}
                points={points}
                stroke={sceneObject.style?.stroke || '#334155'}
                strokeWidth={sceneObject.style?.strokeWidth || 2}
                hitStrokeWidth={15}
                dash={
                  sceneObject.data?.dashStyle === 'dashed' ? [10, 5] :
                  sceneObject.data?.dashStyle === 'dotted' ? [2, 4] :
                  undefined
                }
              />
              {isSelected &&
                [0, 1].map((pointIndex) => (
                  <Circle
                    key={`line-point-${pointIndex}`}
                    x={points[pointIndex * 2]}
                    y={points[pointIndex * 2 + 1]}
                    radius={3}
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth={2}
                    draggable
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                    }}
                    onDragStart={(e) => {
                      e.cancelBubble = true;
                    }}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      onSelect();
                    }}
                    onTap={(e) => {
                      e.cancelBubble = true;
                      onSelect();
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true;
                      const nextPoints = [...points];
                      nextPoints[pointIndex * 2] = e.target.x();
                      nextPoints[pointIndex * 2 + 1] = e.target.y();
                      e.target.getLayer()?.batchDraw();
                      commitLinePoints(nextPoints);
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true;
                      const nextPoints = [...points];
                      nextPoints[pointIndex * 2] = e.target.x();
                      nextPoints[pointIndex * 2 + 1] = e.target.y();
                      commitLinePoints(nextPoints);
                    }}
                  />
                ))}
            </Group>
          );
        }
      }
      case 'triangle':
        return (
          <RegularPolygon
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
            sides={3}
            radius={sceneObject.width / 2}
            fill={sceneObject.style?.fill || '#10b981'}
            stroke={sceneObject.style?.stroke || '#047857'}
            strokeWidth={sceneObject.style?.strokeWidth || 1}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Group>
      {renderContent()}
      {isSelected && !isEditing && (
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
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </Group>
  );
}
