import { useRef, useEffect, useState } from 'react';
import { Rect, Circle, Line, Text, Image as KonvaImage, Transformer, Group, RegularPolygon } from 'react-konva';
import useImage from 'use-image';
import type { SceneObject } from '../../types';
import { useEditorStore } from '../../state/editorStore';
import type Konva from 'konva';

interface Props {
  sceneObject: SceneObject;
  isSelected: boolean;
  onSelect: (shiftKey?: boolean) => void;
  onEditStart?: (id: string, rect: { x: number, y: number, width: number, height: number }, target?: 'text' | 'name') => void;
  isEditing?: boolean;
  /** Visual-only position override while group-dragging (followers) */
  xOverride?: number;
  yOverride?: number;
  /** Called when drag starts on this object */
  onDragStart?: (id: string) => void;
  /** Called on each dragmove; return the snapped {x,y} in canvas coords */
  onDragMove?: (id: string, x: number, y: number, w: number, h: number) => { x: number; y: number } | null;
  /** Clears snap lines when drag ends */
  onDragStop?: () => void;
}

const DEFAULT_CURVE_POINTS = [0, 50, 50, 0, 100, 50];
const DEFAULT_LINE_POINTS = [0, 0, 100, 100];
const MATERIAL_NAME_MAX_LENGTH = 20;
const MATERIAL_NAME_LABEL_MIN_HEIGHT = 22;
const NAME_LABEL_GAP = 8;
const SIDE_NAME_LABEL_MIN_WIDTH = 80;
const LINE_SIDE_NAME_OFFSET_X = 8;
const LINE_SIDE_NAME_OFFSET_Y = 4;
const CURVE_SIDE_NAME_GAP = 2;
const NAME_DRAG_BOUND_PADDING = 40;
const NAME_LABEL_MAX_WIDTH = 320;

const toVerticalText = (value: string) =>
  value
    .split('\n')
    .map((line) => line.split('').join('\n'))
    .join('\n\n');

export function SceneObjectRenderer({ sceneObject, isSelected, onSelect, onEditStart, isEditing, xOverride, yOverride, onDragStart, onDragMove, onDragStop }: Props) {
  const trRef = useRef<Konva.Transformer>(null);
  const shapeRef = useRef<Konva.Node>(null);
  const materialNameRef = useRef<Konva.Text>(null);
  const objectNameRef = useRef<Konva.Text>(null);
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
    onDragStop?.();
    updateSceneObject(sceneObject.id, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  const handleDragStartEvt = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.currentTarget) return;
    onDragStart?.(sceneObject.id);
  };

  const handleDragMoveEvt = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.currentTarget) return;
    if (!onDragMove) return;
    const node = e.target;
    const result = onDragMove(sceneObject.id, node.x(), node.y(), sceneObject.width * (sceneObject.scaleX ?? 1), sceneObject.height * (sceneObject.scaleY ?? 1));
    if (result) {
      node.x(result.x);
      node.y(result.y);
    }
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

  const isLocked = !!sceneObject.locked;

  const commonProps = {
    x: xOverride ?? sceneObject.x,
    y: yOverride ?? sceneObject.y,
    rotation: sceneObject.rotation,
    scaleX: sceneObject.scaleX,
    scaleY: sceneObject.scaleY,
    draggable: !isLocked,
    onDragStart: isLocked ? undefined : handleDragStartEvt,
    onDragMove: isLocked ? undefined : handleDragMoveEvt,
    onDragEnd: isLocked ? undefined : handleDragEnd,
    onTransformEnd: isLocked ? undefined : handleTransformEnd,
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => onSelect(e.evt.shiftKey),
    onTap: (e: Konva.KonvaEventObject<TouchEvent>) => onSelect((e.evt as TouchEvent & { shiftKey?: boolean }).shiftKey),
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

  const normalizedName = (sceneObject.name || '').replace(/\r?\n/g, ' ').trim();
  const displayName = normalizedName.length > MATERIAL_NAME_MAX_LENGTH
    ? `${normalizedName.slice(0, MATERIAL_NAME_MAX_LENGTH)}...`
    : normalizedName;
  const nameFontSize = sceneObject.style?.fontSize || 14;
  const nameFontFamily = sceneObject.style?.fontFamily || 'sans-serif';
  const nameColor = sceneObject.style?.textColor || sceneObject.style?.fill || '#334155';
  const nameAlign = sceneObject.style?.textAlign || 'center';
  const isVerticalName = sceneObject.style?.textDirection === 'vertical';
  const renderedName = isVerticalName ? toVerticalText(displayName) : displayName;
  const nameLineHeight = 1.2;
  const renderedNameLineHeight = isVerticalName ? 1 : nameLineHeight;
  const nameLabelHeight = Math.max(
    nameFontSize * renderedNameLineHeight,
    MATERIAL_NAME_LABEL_MIN_HEIGHT,
  );
  const getNameLabelWidth = () => {
    const estimatedTextWidth = Math.max(
      nameFontSize,
      displayName.length * nameFontSize * 0.9 + 12,
    );
    return Math.max(
      36,
      Math.min(
        NAME_LABEL_MAX_WIDTH,
        Math.max(SIDE_NAME_LABEL_MIN_WIDTH, estimatedTextWidth),
      ),
    );
  };

  const getPointsBounds = (points: number[]) => {
    if (points.length < 2) {
      return { minX: 0, maxX: sceneObject.width, minY: 0, maxY: sceneObject.height };
    }
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      xs.push(points[i]);
      ys.push(points[i + 1]);
    }
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };

  const getCurveNameLabelPosition = (
    points: number[],
    labelWidth: number,
    labelHeight: number,
  ) => {
    const bounds = getPointsBounds(points);
    if (points.length < 4) {
      const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
      return {
        x: centerX - labelWidth / 2,
        y: bounds.minY - labelHeight - CURVE_SIDE_NAME_GAP,
      };
    }

    let totalLength = 0;
    const segments: Array<{ x1: number; y1: number; x2: number; y2: number; len: number }> = [];
    for (let i = 0; i <= points.length - 4; i += 2) {
      const x1 = points[i];
      const y1 = points[i + 1];
      const x2 = points[i + 2];
      const y2 = points[i + 3];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len > 0.0001) {
        segments.push({ x1, y1, x2, y2, len });
        totalLength += len;
      }
    }

    if (segments.length === 0 || totalLength <= 0.0001) {
      const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
      return {
        x: centerX - labelWidth / 2,
        y: bounds.minY - labelHeight - CURVE_SIDE_NAME_GAP,
      };
    }

    const targetLength = totalLength / 2;
    let traversed = 0;
    let targetSegment = segments[segments.length - 1];
    let ratioOnSegment = 0.5;
    for (const seg of segments) {
      if (traversed + seg.len >= targetLength) {
        targetSegment = seg;
        ratioOnSegment = (targetLength - traversed) / seg.len;
        break;
      }
      traversed += seg.len;
    }

    const midX = targetSegment.x1 + (targetSegment.x2 - targetSegment.x1) * ratioOnSegment;
    const midY = targetSegment.y1 + (targetSegment.y2 - targetSegment.y1) * ratioOnSegment;
    const tangentX = targetSegment.x2 - targetSegment.x1;
    const tangentY = targetSegment.y2 - targetSegment.y1;
    const tangentLen = Math.hypot(tangentX, tangentY) || 1;
    const unitTangentX = tangentX / tangentLen;
    const unitTangentY = tangentY / tangentLen;

    const normal1 = { x: -unitTangentY, y: unitTangentX };
    const normal2 = { x: unitTangentY, y: -unitTangentX };
    const centerOffset = labelHeight / 2 + CURVE_SIDE_NAME_GAP;
    const candidate1 = {
      x: midX + normal1.x * centerOffset,
      y: midY + normal1.y * centerOffset,
    };
    const candidate2 = {
      x: midX + normal2.x * centerOffset,
      y: midY + normal2.y * centerOffset,
    };
    const labelCenter = candidate1.y <= candidate2.y ? candidate1 : candidate2;

    return {
      x: labelCenter.x - labelWidth / 2,
      y: labelCenter.y - labelHeight / 2,
    };
  };

  const getNameOffset = () => {
    const rawOffset = (sceneObject.data as { nameOffset?: unknown } | undefined)?.nameOffset;
    if (typeof rawOffset === 'object' && rawOffset !== null) {
      const offset = rawOffset as { x?: unknown; y?: unknown };
      return {
        x: typeof offset.x === 'number' ? offset.x : 0,
        y: typeof offset.y === 'number' ? offset.y : 0,
      };
    }
    return { x: 0, y: 0 };
  };

  const persistNameOffset = (x: number, y: number) => {
    updateSceneObject(sceneObject.id, {
      data: {
        ...(sceneObject.data || {}),
        nameOffset: { x, y },
      },
    });
  };

  const clampNamePosition = (
    baseX: number,
    baseY: number,
    labelWidth: number,
    labelHeight: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    offset: { x: number; y: number },
    _keepOutside: boolean,
  ) => {
    const desiredX = baseX + offset.x;
    const desiredY = baseY + offset.y;

    const horizontalPadding = NAME_DRAG_BOUND_PADDING;
    const verticalPadding = NAME_DRAG_BOUND_PADDING;

    // Clamp by edge distance to object bounds (not by forcing the entire
    // label box to stay inside an expanded rectangle). This keeps dragging
    // smooth while allowing wide labels to move to left/right without being
    // squeezed toward overlap.
    let minX = bounds.minX - horizontalPadding - labelWidth;
    let maxX = bounds.maxX + horizontalPadding;
    let minY = bounds.minY - verticalPadding - labelHeight;
    let maxY = bounds.maxY + verticalPadding;

    if (maxX < minX) {
      const centerX = (bounds.minX + bounds.maxX) / 2 - labelWidth / 2;
      minX = centerX;
      maxX = centerX;
    }
    if (maxY < minY) {
      const centerY = (bounds.minY + bounds.maxY) / 2 - labelHeight / 2;
      minY = centerY;
      maxY = centerY;
    }

    let finalX = Math.max(minX, Math.min(desiredX, maxX));
    let finalY = Math.max(minY, Math.min(desiredY, maxY));

    return {
      x: finalX,
      y: finalY,
      offsetX: finalX - baseX,
      offsetY: finalY - baseY,
    };
  };

  const buildNameLabelLayout = (
    baseX: number,
    baseY: number,
    labelWidth: number,
    labelHeight: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    keepOutside = false,
  ) => {
    const currentOffset = getNameOffset();
    const clampedPosition = clampNamePosition(
      baseX,
      baseY,
      labelWidth,
      labelHeight,
      bounds,
      currentOffset,
      keepOutside,
    );

    const handleNameDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      const nextPosition = clampNamePosition(
        baseX,
        baseY,
        labelWidth,
        labelHeight,
        bounds,
        {
          x: e.target.x() - baseX,
          y: e.target.y() - baseY,
        },
        keepOutside,
      );
      e.target.position({ x: nextPosition.x, y: nextPosition.y });
      e.target.getLayer()?.batchDraw();
    };

    const handleNameDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      const nextPosition = clampNamePosition(
        baseX,
        baseY,
        labelWidth,
        labelHeight,
        bounds,
        {
          x: e.target.x() - baseX,
          y: e.target.y() - baseY,
        },
        keepOutside,
      );
      e.target.position({ x: nextPosition.x, y: nextPosition.y });
      persistNameOffset(nextPosition.offsetX, nextPosition.offsetY);
    };

    return {
      x: clampedPosition.x,
      y: clampedPosition.y,
      dragProps: {
        draggable: !isEditing,
        onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true;
          onSelect();
        },
        onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
          e.cancelBubble = true;
          onSelect();
        },
        onDragMove: handleNameDragMove,
        onDragEnd: handleNameDragEnd,
      },
    };
  };

  const startNameEdit = (
    nameNode: Konva.Text | null,
    fallbackRect: { x: number; y: number; width: number; height: number },
  ) => {
    if (!onEditStart) return;
    if (nameNode) {
      const pos = nameNode.getAbsolutePosition();
      const scale = nameNode.getAbsoluteScale();
      const editHeight = Math.max(nameNode.height(), MATERIAL_NAME_LABEL_MIN_HEIGHT);
      onEditStart(sceneObject.id, {
        x: pos.x + (nameNode.width() * scale.x) / 2,
        y: pos.y + (editHeight * scale.y) / 2,
        width: nameNode.width() * scale.x,
        height: editHeight * scale.y,
      }, 'name');
      return;
    }
    onEditStart(sceneObject.id, fallbackRect, 'name');
  };

  const renderContent = () => {
    switch (sceneObject.type) {
      case 'material': {
        const nameYOffset = sceneObject.height / 2 + NAME_LABEL_GAP;
        const nameLabelWidth = getNameLabelWidth();
        const nameBaseX = -nameLabelWidth / 2;
        const nameBounds = {
          minX: -sceneObject.width / 2,
          maxX: sceneObject.width / 2,
          minY: -sceneObject.height / 2,
          maxY: sceneObject.height / 2,
        };
        const nameLayout = buildNameLabelLayout(
          nameBaseX,
          nameYOffset,
          nameLabelWidth,
          nameLabelHeight,
          nameBounds,
          true,
        );
        const startMaterialNameEdit = () => {
          const scaleX = sceneObject.scaleX || 1;
          const scaleY = sceneObject.scaleY || 1;
          startNameEdit(materialNameRef.current, {
            x: sceneObject.x + (nameLayout.x + nameLabelWidth / 2) * scaleX,
            y: sceneObject.y + (nameLayout.y + nameLabelHeight / 2) * scaleY,
            width: nameLabelWidth * scaleX,
            height: nameLabelHeight * scaleY,
          });
        };
        return (
          <Group
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Group>}
            onDblClick={startMaterialNameEdit}
            onDblTap={startMaterialNameEdit}
          >
            <KonvaImage
              image={image}
              width={sceneObject.width}
              height={sceneObject.height}
              offsetX={sceneObject.width / 2}
              offsetY={sceneObject.height / 2}
            />
            <Text
              ref={materialNameRef}
              visible={!isEditing}
              text={renderedName}
              width={nameLabelWidth}
              x={nameLayout.x}
              y={nameLayout.y}
              align={nameAlign}
              fontSize={nameFontSize}
              fontFamily={nameFontFamily}
              fill={nameColor}
              lineHeight={renderedNameLineHeight}
              wrap="char"
              onDblClick={startMaterialNameEdit}
              onDblTap={startMaterialNameEdit}
              {...nameLayout.dragProps}
            />
          </Group>
        );
      }
      case 'rect': {
        const nameYOffset = sceneObject.height / 2 + NAME_LABEL_GAP;
        const nameLabelWidth = getNameLabelWidth();
        const nameBaseX = -nameLabelWidth / 2;
        const nameBounds = {
          minX: -sceneObject.width / 2,
          maxX: sceneObject.width / 2,
          minY: -sceneObject.height / 2,
          maxY: sceneObject.height / 2,
        };
        const nameLayout = buildNameLabelLayout(
          nameBaseX,
          nameYOffset,
          nameLabelWidth,
          nameLabelHeight,
          nameBounds,
          true,
        );
        const startBottomNameEdit = () => {
          const scaleX = sceneObject.scaleX || 1;
          const scaleY = sceneObject.scaleY || 1;
          startNameEdit(objectNameRef.current, {
            x: sceneObject.x + (nameLayout.x + nameLabelWidth / 2) * scaleX,
            y: sceneObject.y + (nameLayout.y + nameLabelHeight / 2) * scaleY,
            width: nameLabelWidth * scaleX,
            height: nameLabelHeight * scaleY,
          });
        };
        return (
          <Group
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Group>}
            onDblClick={startBottomNameEdit}
            onDblTap={startBottomNameEdit}
          >
            <Rect
              width={sceneObject.width}
              height={sceneObject.height}
              offsetX={sceneObject.width / 2}
              offsetY={sceneObject.height / 2}
              fill={sceneObject.style?.fill || '#3b82f6'}
              stroke={sceneObject.style?.stroke || '#1d4ed8'}
              strokeWidth={sceneObject.style?.strokeWidth || 1}
              cornerRadius={sceneObject.style?.cornerRadius || 0}
            />
            <Text
              ref={objectNameRef}
              visible={!isEditing}
              text={renderedName}
              width={nameLabelWidth}
              x={nameLayout.x}
              y={nameLayout.y}
              align={nameAlign}
              fontSize={nameFontSize}
              fontFamily={nameFontFamily}
              fill={nameColor}
              lineHeight={renderedNameLineHeight}
              wrap="char"
              onDblClick={startBottomNameEdit}
              onDblTap={startBottomNameEdit}
              {...nameLayout.dragProps}
            />
          </Group>
        );
      }
      case 'circle': {
        const nameYOffset = sceneObject.width / 2 + NAME_LABEL_GAP;
        const nameLabelWidth = getNameLabelWidth();
        const nameBaseX = -nameLabelWidth / 2;
        const radius = sceneObject.width / 2;
        const nameBounds = {
          minX: -radius,
          maxX: radius,
          minY: -radius,
          maxY: radius,
        };
        const nameLayout = buildNameLabelLayout(
          nameBaseX,
          nameYOffset,
          nameLabelWidth,
          nameLabelHeight,
          nameBounds,
          true,
        );
        const startBottomNameEdit = () => {
          const scaleX = sceneObject.scaleX || 1;
          const scaleY = sceneObject.scaleY || 1;
          startNameEdit(objectNameRef.current, {
            x: sceneObject.x + (nameLayout.x + nameLabelWidth / 2) * scaleX,
            y: sceneObject.y + (nameLayout.y + nameLabelHeight / 2) * scaleY,
            width: nameLabelWidth * scaleX,
            height: nameLabelHeight * scaleY,
          });
        };
        return (
          <Group
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Group>}
            onDblClick={startBottomNameEdit}
            onDblTap={startBottomNameEdit}
          >
            <Circle
              radius={sceneObject.width / 2}
              fill={sceneObject.style?.fill || '#ef4444'}
              stroke={sceneObject.style?.stroke || '#b91c1c'}
              strokeWidth={sceneObject.style?.strokeWidth || 1}
            />
            <Text
              ref={objectNameRef}
              visible={!isEditing}
              text={renderedName}
              width={nameLabelWidth}
              x={nameLayout.x}
              y={nameLayout.y}
              align={nameAlign}
              fontSize={nameFontSize}
              fontFamily={nameFontFamily}
              fill={nameColor}
              lineHeight={renderedNameLineHeight}
              wrap="char"
              onDblClick={startBottomNameEdit}
              onDblTap={startBottomNameEdit}
              {...nameLayout.dragProps}
            />
          </Group>
        );
      }
      case 'trapezoid': {
        const inset = sceneObject.width * 0.2;
        const nameYOffset = sceneObject.height / 2 + NAME_LABEL_GAP;
        const nameLabelWidth = getNameLabelWidth();
        const nameBaseX = -nameLabelWidth / 2;
        const nameBounds = {
          minX: -sceneObject.width / 2,
          maxX: sceneObject.width / 2,
          minY: -sceneObject.height / 2,
          maxY: sceneObject.height / 2,
        };
        const nameLayout = buildNameLabelLayout(
          nameBaseX,
          nameYOffset,
          nameLabelWidth,
          nameLabelHeight,
          nameBounds,
          true,
        );
        const startBottomNameEdit = () => {
          const scaleX = sceneObject.scaleX || 1;
          const scaleY = sceneObject.scaleY || 1;
          startNameEdit(objectNameRef.current, {
            x: sceneObject.x + (nameLayout.x + nameLabelWidth / 2) * scaleX,
            y: sceneObject.y + (nameLayout.y + nameLabelHeight / 2) * scaleY,
            width: nameLabelWidth * scaleX,
            height: nameLabelHeight * scaleY,
          });
        };
        return (
          <Group
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Group>}
            onDblClick={startBottomNameEdit}
            onDblTap={startBottomNameEdit}
          >
            <Line
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
            <Text
              ref={objectNameRef}
              visible={!isEditing}
              text={renderedName}
              width={nameLabelWidth}
              x={nameLayout.x}
              y={nameLayout.y}
              align={nameAlign}
              fontSize={nameFontSize}
              fontFamily={nameFontFamily}
              fill={nameColor}
              lineHeight={renderedNameLineHeight}
              wrap="char"
              onDblClick={startBottomNameEdit}
              onDblTap={startBottomNameEdit}
              {...nameLayout.dragProps}
            />
          </Group>
        );
      }
      case 'text': {
        const rawText = (sceneObject.data?.text as string) || '点击输入内容';
        const isVerticalText = sceneObject.style?.textDirection === 'vertical';
        const renderedText = isVerticalText ? toVerticalText(rawText) : rawText;
        const textLineHeight = isVerticalText ? 1 : 1.2;
        return (
          <Text
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Text>}
            visible={!isEditing}
            text={renderedText}
            fontSize={sceneObject.style?.fontSize || 18}
            fontFamily={sceneObject.style?.fontFamily || 'sans-serif'}
            fill={sceneObject.style?.fill || '#1e293b'}
            width={sceneObject.width}
            height={sceneObject.height}
            offsetX={sceneObject.width / 2}
            offsetY={sceneObject.height / 2}
            align={sceneObject.style?.textAlign || 'center'}
            verticalAlign="middle"
            lineHeight={textLineHeight}
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
      }
      case 'curve': {
        const points = getCurvePoints();
        const sideLabelWidth = SIDE_NAME_LABEL_MIN_WIDTH;
        const sideLabelBase = getCurveNameLabelPosition(
          points,
          sideLabelWidth,
          nameLabelHeight,
        );
        const sideNameBounds = getPointsBounds(points);
        const nameLayout = buildNameLabelLayout(
          sideLabelBase.x,
          sideLabelBase.y,
          sideLabelWidth,
          nameLabelHeight,
          sideNameBounds,
        );
        const startSideNameEdit = () => {
          const scaleX = sceneObject.scaleX || 1;
          const scaleY = sceneObject.scaleY || 1;
          startNameEdit(objectNameRef.current, {
            x: sceneObject.x + (nameLayout.x + sideLabelWidth / 2) * scaleX,
            y: sceneObject.y + (nameLayout.y + nameLabelHeight / 2) * scaleY,
            width: sideLabelWidth * scaleX,
            height: nameLabelHeight * scaleY,
          });
        };
        return (
          <Group
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Group>}
            onDblClick={startSideNameEdit}
            onDblTap={startSideNameEdit}
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
            <Text
              ref={objectNameRef}
              visible={!isEditing}
              text={renderedName}
              width={sideLabelWidth}
              x={nameLayout.x}
              y={nameLayout.y}
              align={nameAlign}
              fontSize={nameFontSize}
              fontFamily={nameFontFamily}
              fill={nameColor}
              lineHeight={renderedNameLineHeight}
              wrap="char"
              onDblClick={startSideNameEdit}
              onDblTap={startSideNameEdit}
              {...nameLayout.dragProps}
            />
          </Group>
        );
      }
      case 'line':
      case 'arrow': {
        const points = (sceneObject.data?.points as number[]) || DEFAULT_LINE_POINTS;
        const bounds = getPointsBounds(points);
        const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
        const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2;
        const sideLabelWidth = SIDE_NAME_LABEL_MIN_WIDTH;
        const sideLabelBaseX = centerX - sideLabelWidth / 2 + LINE_SIDE_NAME_OFFSET_X;
        const sideLabelBaseY = centerY + LINE_SIDE_NAME_OFFSET_Y;
        const nameLayout = buildNameLabelLayout(
          sideLabelBaseX,
          sideLabelBaseY,
          sideLabelWidth,
          nameLabelHeight,
          bounds,
        );
        const startSideNameEdit = () => {
          const scaleX = sceneObject.scaleX || 1;
          const scaleY = sceneObject.scaleY || 1;
          startNameEdit(objectNameRef.current, {
            x: sceneObject.x + (nameLayout.x + sideLabelWidth / 2) * scaleX,
            y: sceneObject.y + (nameLayout.y + nameLabelHeight / 2) * scaleY,
            width: sideLabelWidth * scaleX,
            height: nameLabelHeight * scaleY,
          });
        };
        
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
              onDblClick={startSideNameEdit}
              onDblTap={startSideNameEdit}
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
              <Text
                ref={objectNameRef}
                visible={!isEditing}
                text={renderedName}
                width={sideLabelWidth}
                x={nameLayout.x}
                y={nameLayout.y}
                align={nameAlign}
                fontSize={nameFontSize}
                fontFamily={nameFontFamily}
                fill={nameColor}
                lineHeight={renderedNameLineHeight}
                wrap="char"
                onDblClick={startSideNameEdit}
                onDblTap={startSideNameEdit}
                {...nameLayout.dragProps}
              />
            </Group>
          );
        } else {
          // 普通直线 (Line) 逻辑
          return (
            <Group
              {...commonProps}
              ref={shapeRef as React.RefObject<Konva.Group>}
              onDblClick={startSideNameEdit}
              onDblTap={startSideNameEdit}
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
              <Text
                ref={objectNameRef}
                visible={!isEditing}
                text={renderedName}
                width={sideLabelWidth}
                x={nameLayout.x}
                y={nameLayout.y}
                align={nameAlign}
                fontSize={nameFontSize}
                fontFamily={nameFontFamily}
                fill={nameColor}
                lineHeight={renderedNameLineHeight}
                wrap="char"
                onDblClick={startSideNameEdit}
                onDblTap={startSideNameEdit}
                {...nameLayout.dragProps}
              />
            </Group>
          );
        }
      }
      case 'triangle': {
        const nameYOffset = sceneObject.width / 2 + NAME_LABEL_GAP;
        const nameLabelWidth = getNameLabelWidth();
        const nameBaseX = -nameLabelWidth / 2;
        const triangleRadius = sceneObject.width / 2;
        const nameBounds = {
          minX: -triangleRadius,
          maxX: triangleRadius,
          minY: -triangleRadius,
          maxY: triangleRadius,
        };
        const nameLayout = buildNameLabelLayout(
          nameBaseX,
          nameYOffset,
          nameLabelWidth,
          nameLabelHeight,
          nameBounds,
          true,
        );
        const startBottomNameEdit = () => {
          const scaleX = sceneObject.scaleX || 1;
          const scaleY = sceneObject.scaleY || 1;
          startNameEdit(objectNameRef.current, {
            x: sceneObject.x + (nameLayout.x + nameLabelWidth / 2) * scaleX,
            y: sceneObject.y + (nameLayout.y + nameLabelHeight / 2) * scaleY,
            width: nameLabelWidth * scaleX,
            height: nameLabelHeight * scaleY,
          });
        };
        return (
          <Group
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Group>}
            onDblClick={startBottomNameEdit}
            onDblTap={startBottomNameEdit}
          >
            <RegularPolygon
              sides={3}
              radius={sceneObject.width / 2}
              fill={sceneObject.style?.fill || '#10b981'}
              stroke={sceneObject.style?.stroke || '#047857'}
              strokeWidth={sceneObject.style?.strokeWidth || 1}
            />
            <Text
              ref={objectNameRef}
              visible={!isEditing}
              text={renderedName}
              width={nameLabelWidth}
              x={nameLayout.x}
              y={nameLayout.y}
              align={nameAlign}
              fontSize={nameFontSize}
              fontFamily={nameFontFamily}
              fill={nameColor}
              lineHeight={renderedNameLineHeight}
              wrap="char"
              onDblClick={startBottomNameEdit}
              onDblTap={startBottomNameEdit}
              {...nameLayout.dragProps}
            />
          </Group>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Group>
      {renderContent()}
      {isSelected && !isEditing && !isLocked && (
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
