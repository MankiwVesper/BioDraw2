export type Id = string;
export type TimestampISO = string;
export type Numeric = number;

export type Point2D = {
  x: number;
  y: number;
};

export type Size2D = {
  width: number;
  height: number;
};

export type Rect2D = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ColorValue = string;
export type VisibilityFlag = boolean;

// =======================
// 素材层模型
// =======================

export type MaterialCategory = {
  id: Id;
  name: string;
  parentId?: Id | null;
  order: number;
  description?: string;
};

export type MaterialStyleCapabilities = {
  recolorable: boolean;
  opacityAdjustable: boolean;
  scalable: boolean;
  rotatable: boolean;
};

export type MaterialAnimationCapabilities = {
  movable: boolean;
  stateSwitchable: boolean;
  pathBindable: boolean;
  fadeable: boolean;
  scalable: boolean;
  rotatable: boolean;
};

export type MaterialVariant = {
  key: string;
  label: string;
  assetPath?: string;
  hiddenParts?: string[];
  visibleParts?: string[];
};

export type MaterialSource = {
  sourceName: string;
  sourceUrl?: string;
  license?: string;
  author?: string;
  notes?: string;
};

export type MaterialItem = {
  id: Id;
  name: string;
  englishName?: string;
  categoryId: Id;
  tags: string[];
  description?: string;

  assetType: 'svg' | 'png' | 'webp';
  assetPath: string;
  thumbnailPath?: string;

  defaultWidth: number;
  defaultHeight: number;

  styleCapabilities: MaterialStyleCapabilities;
  animationCapabilities: MaterialAnimationCapabilities;

  variants?: MaterialVariant[];
  defaultStateKey?: string;

  source?: MaterialSource;
};

// =======================
// 场景层模型
// =======================

export type SceneObjectType = 'material' | 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'triangle' | 'trapezoid' | 'curve';

export type SceneObjectStyle = {
  fill?: ColorValue;
  stroke?: ColorValue;
  strokeWidth?: number;
  textColor?: ColorValue;
  fontSize?: number;
  cornerRadius?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right';
  textDirection?: 'horizontal' | 'vertical';
  opacity?: number;
};

export type SceneObjectMeta = {
  createdFrom?: 'material-drop' | 'duplicate' | 'import';
  notes?: string;
};

export type SceneObject = {
  id: Id;
  type: SceneObjectType;
  name: string;

  materialId?: Id | null;

  x: number;
  y: number;
  width: number;
  height: number;

  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;

  visible: boolean;
  locked?: boolean;
  groupId?: string;

  zIndex: number;

  anchorX?: number;
  anchorY?: number;

  style?: SceneObjectStyle;
  stateKey?: string;

  pathIds?: Id[];
  animationIds: Id[];

  meta?: SceneObjectMeta;
  data?: Record<string, unknown>; // Holds LabelObjectData, ArrowObjectData, etc.
};

// =======================
// 路径层模型
// =======================

export type MotionPathKind = 'line' | 'polyline' | 'bezier';

export type PathPoint = {
  x: number;
  y: number;
  inHandleX?: number;
  inHandleY?: number;
  outHandleX?: number;
  outHandleY?: number;
};

export type MotionPathStyle = {
  stroke?: ColorValue;
  strokeWidth?: number;
  dash?: number[];
};

export type MotionPath = {
  id: Id;
  name?: string;
  kind: MotionPathKind;

  points: PathPoint[];
  pathData: string;

  closed: boolean;
  visible: boolean;

  boundObjectIds?: Id[];

  style?: MotionPathStyle;
};

// =======================
// 动画层模型
// =======================

export type AnimationClipType =
  | 'move'
  | 'moveAlongPath'
  | 'shake'
  | 'fade'
  | 'scale'
  | 'rotate'
  | 'stateChange';

export type EasingType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | `cubic-bezier(${string})`;

export type AnimationClipBase = {
  id: Id;
  objectId: Id;
  type: AnimationClipType;
  startTimeMs: number;
  durationMs: number;
  easing?: EasingType;
  enabled?: boolean;
};

export type NumericKeyframe = {
  at: number;
  value: number;
};

export type PointKeyframe = {
  at: number;
  x: number;
  y: number;
};

export type ScaleKeyframe = {
  at: number;
  scaleX: number;
  scaleY: number;
};

export type MoveAlongPathClip = AnimationClipBase & {
  type: 'moveAlongPath';
  payload: {
    fromX: number;
    fromY: number;
    controlX: number;
    controlY: number;
    toX: number;
    toY: number;
  };
};

export type MoveClip = AnimationClipBase & {
  type: 'move';
  payload: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    keyframes?: PointKeyframe[];
  };
};

export type ShakeClip = AnimationClipBase & {
  type: 'shake';
  payload: {
    baseX: number;
    baseY: number;
    amplitudeX: number;
    amplitudeY: number;
    frequency: number;
    decay?: number;
  };
};

export type StateChangeClip = AnimationClipBase & {
  type: 'stateChange';
  payload: {
    fromStateKey?: string;
    toStateKey: string;
  };
};

export type FadeClip = AnimationClipBase & {
  type: 'fade';
  payload: {
    fromOpacity: number;
    toOpacity: number;
    keyframes?: NumericKeyframe[];
  };
};

export type ScaleClip = AnimationClipBase & {
  type: 'scale';
  payload: {
    fromScaleX: number;
    fromScaleY: number;
    toScaleX: number;
    toScaleY: number;
    keyframes?: ScaleKeyframe[];
  };
};

export type RotateClip = AnimationClipBase & {
  type: 'rotate';
  payload: {
    fromRotation: number;
    toRotation: number;
    keyframes?: NumericKeyframe[];
  };
};

export type AnimationClip =
  | MoveClip
  | MoveAlongPathClip
  | ShakeClip
  | StateChangeClip
  | FadeClip
  | ScaleClip
  | RotateClip;

// =======================
// 场景文档 & 工程层模型
// =======================

export type SceneCanvasConfig = {
  width: number;
  height: number;
  backgroundColor?: ColorValue;
};

export type SceneDocument = {
  version: string;
  canvas: SceneCanvasConfig;
  materials: Id[];
  objects: SceneObject[];
  paths: MotionPath[];
  animations: AnimationClip[];
  globalDurationMs: number;
};

export type ProjectMeta = {
  id: Id;
  title: string;
  description?: string;
  createdAt: TimestampISO;
  updatedAt: TimestampISO;
};

export type ProjectDocument = {
  version: string;
  meta: ProjectMeta;
  scene: SceneDocument;
};
