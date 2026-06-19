// 动画片段工厂：纯函数，根据类型/模板构造默认 AnimationClip。
// 不依赖 React/Konva/DOM/store；id 由入参 createId 注入，几何取自入参 src。
import type { AnimationClip, SceneObject } from '../types';
import { clamp01 } from './easing';

export type ClipTiming = { startTimeMs: number; durationMs: number };

export type BuildClipParams = {
  type: AnimationClip['type'];
  src: SceneObject;
  objectId: string;
  segmentId: string;
  timing: ClipTiming;
  createId: () => string;
  // stateChange 用：取第一个状态键作为初始目标状态
  stateKeys?: string[];
};

// 构造单个默认片段。各分支保留 `type` 字面量重设以让 TS 收窄到联合成员。
export const buildClip = ({
  type,
  src,
  objectId,
  segmentId,
  timing,
  createId,
  stateKeys,
}: BuildClipParams): AnimationClip => {
  const base = {
    id: createId(),
    objectId,
    type,
    startTimeMs: timing.startTimeMs,
    durationMs: timing.durationMs,
    easing: 'linear' as const,
    enabled: true,
    segmentId,
  };
  switch (type) {
    case 'move':
      return { ...base, type: 'move', payload: { fromX: src.x, fromY: src.y, toX: src.x + 120, toY: src.y + 80 } };
    case 'polylineMove':
      return { ...base, type: 'polylineMove', payload: { fromX: src.x, fromY: src.y, midX: src.x + 60, midY: src.y - 80, toX: src.x + 120, toY: src.y } };
    case 'moveAlongPath':
      return { ...base, type: 'moveAlongPath', payload: { fromX: src.x, fromY: src.y, control1X: src.x + 40, control1Y: src.y - 120, control2X: src.x + 120, control2Y: src.y - 80, toX: src.x + 160, toY: src.y } };
    case 'shake':
      return { ...base, type: 'shake', payload: { baseX: src.x, baseY: src.y, amplitudeX: 16, amplitudeY: 8, frequency: 6, decay: 1 } };
    case 'fade':
      return { ...base, type: 'fade', payload: { fromOpacity: src.opacity, toOpacity: Math.max(0.1, src.opacity * 0.4) } };
    case 'scale':
      return { ...base, type: 'scale', payload: { fromScaleX: src.scaleX, fromScaleY: src.scaleY, toScaleX: src.scaleX * 1.2, toScaleY: src.scaleY * 1.2 } };
    case 'rotate':
      return { ...base, type: 'rotate', payload: { fromRotation: src.rotation, toRotation: src.rotation + 90 } };
    case 'stateChange':
    default: {
      // stateChange 强制 durationMs:1（瞬时切换），atMs 落在片段起点
      const firstKey = stateKeys?.[0] ?? '';
      return { ...base, type: 'stateChange', durationMs: 1, payload: { steps: [{ atMs: timing.startTimeMs, toStateKey: firstKey }] } };
    }
  }
};

export type PresetTemplate =
  | 'fadeIn'
  | 'bounceIn'
  | 'moveFadeIn'
  | 'fadeOut'
  | 'crossMembrane'
  | 'endocytosis'
  | 'moveFadeOut';

export type BuildPresetClipsParams = {
  template: PresetTemplate;
  src: SceneObject;
  objectId: string;
  startTimeMs: number;
  createId: () => string;
};

// 构造预设模板片段（可能多个）。输出为「未夹取、无 segmentId」的裸片段，
// 段内裁剪与 segmentId 注入由调用方完成。
export const buildPresetClips = ({
  template,
  src,
  objectId,
  startTimeMs,
  createId,
}: BuildPresetClipsParams): AnimationClip[] => {
  const created: AnimationClip[] = [];
  if (template === 'fadeIn') {
    created.push({ id: createId(), objectId, type: 'fade', startTimeMs, durationMs: 700, easing: 'ease-out', enabled: true, payload: { fromOpacity: 0, toOpacity: clamp01(src.opacity) } });
  }
  if (template === 'bounceIn') {
    created.push(
      { id: createId(), objectId, type: 'scale', startTimeMs, durationMs: 900, easing: 'cubic-bezier(0.2,0.9,0.2,1)', enabled: true, payload: { fromScaleX: src.scaleX * 0.45, fromScaleY: src.scaleY * 0.45, toScaleX: src.scaleX, toScaleY: src.scaleY, keyframes: [{ at: 0.55, scaleX: src.scaleX * 1.12, scaleY: src.scaleY * 1.12 }, { at: 0.78, scaleX: src.scaleX * 0.96, scaleY: src.scaleY * 0.96 }] } },
      { id: createId(), objectId, type: 'fade', startTimeMs, durationMs: 500, easing: 'ease-out', enabled: true, payload: { fromOpacity: 0, toOpacity: clamp01(src.opacity) } },
    );
  }
  if (template === 'moveFadeIn') {
    created.push(
      { id: createId(), objectId, type: 'move', startTimeMs, durationMs: 800, easing: 'ease-out', enabled: true, payload: { fromX: src.x - 120, fromY: src.y, toX: src.x, toY: src.y } },
      { id: createId(), objectId, type: 'fade', startTimeMs, durationMs: 800, easing: 'ease-out', enabled: true, payload: { fromOpacity: 0, toOpacity: clamp01(src.opacity) } },
    );
  }
  // ── 生物学场景模板 ──
  if (template === 'fadeOut') {
    created.push({ id: createId(), objectId, type: 'fade', startTimeMs, durationMs: 800, easing: 'ease-in', enabled: true, payload: { fromOpacity: clamp01(src.opacity), toOpacity: 0 } });
  }
  if (template === 'crossMembrane') {
    // 分子穿越膜结构：水平方向短弧穿越（控制点向上拱起）
    created.push({ id: createId(), objectId, type: 'moveAlongPath', startTimeMs, durationMs: 1200, easing: 'ease-in-out', enabled: true, payload: { fromX: src.x - 80, fromY: src.y, control1X: src.x - 27, control1Y: src.y - 40, control2X: src.x + 27, control2Y: src.y - 40, toX: src.x + 80, toY: src.y } });
  }
  if (template === 'endocytosis') {
    // 胞吞入胞：物质从细胞外弧形进入细胞内（大弧 + 淡入）
    created.push(
      { id: createId(), objectId, type: 'moveAlongPath', startTimeMs, durationMs: 1500, easing: 'ease-in-out', enabled: true, payload: { fromX: src.x, fromY: src.y - 120, control1X: src.x + 87, control1Y: src.y, control2X: src.x + 87, control2Y: src.y + 67, toX: src.x, toY: src.y + 80 } },
      { id: createId(), objectId, type: 'fade', startTimeMs, durationMs: 400, easing: 'ease-out', enabled: true, payload: { fromOpacity: 0, toOpacity: clamp01(src.opacity) } },
    );
  }
  if (template === 'moveFadeOut') {
    // 移动消失：向右平移同时淡出
    created.push(
      { id: createId(), objectId, type: 'move', startTimeMs, durationMs: 800, easing: 'ease-in', enabled: true, payload: { fromX: src.x, fromY: src.y, toX: src.x + 150, toY: src.y } },
      { id: createId(), objectId, type: 'fade', startTimeMs, durationMs: 800, easing: 'ease-in', enabled: true, payload: { fromOpacity: clamp01(src.opacity), toOpacity: 0 } },
    );
  }
  return created;
};
