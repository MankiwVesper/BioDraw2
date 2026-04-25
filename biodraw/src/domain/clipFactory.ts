import type { AnimationClip, SceneObject } from '../types';

/**
 * 根据对象当前状态创建一个新的动画片段（用于"添加动画"入口）。
 * 纯函数，不依赖 React / Konva / store。
 */
export function buildAnimationClip(
  type: 'move' | 'moveAlongPath' | 'shake' | 'fade' | 'scale' | 'rotate',
  source: SceneObject,
  startTimeMs: number,
): AnimationClip {
  const base = {
    id: crypto.randomUUID(),
    objectId: source.id,
    type,
    startTimeMs,
    durationMs: 1000,
    easing: 'linear' as const,
    enabled: true,
  };

  switch (type) {
    case 'move':
      return {
        ...base, type: 'move',
        payload: { fromX: source.x, fromY: source.y, toX: source.x + 120, toY: source.y + 80 },
      };
    case 'moveAlongPath':
      return {
        ...base, type: 'moveAlongPath',
        payload: {
          fromX: source.x, fromY: source.y,
          control1X: source.x + 40, control1Y: source.y - 120,
          control2X: source.x + 120, control2Y: source.y - 80,
          toX: source.x + 160, toY: source.y,
        },
      };
    case 'shake':
      return {
        ...base, type: 'shake',
        payload: {
          baseX: source.x, baseY: source.y,
          amplitudeX: 16, amplitudeY: 8,
          frequency: 6, decay: 1,
        },
      };
    case 'fade':
      return {
        ...base, type: 'fade',
        payload: {
          fromOpacity: source.opacity,
          toOpacity: Math.max(0.1, source.opacity * 0.4),
        },
      };
    case 'scale':
      return {
        ...base, type: 'scale',
        payload: {
          fromScaleX: source.scaleX, fromScaleY: source.scaleY,
          toScaleX: source.scaleX * 1.2, toScaleY: source.scaleY * 1.2,
        },
      };
    case 'rotate':
    default:
      return {
        ...base, type: 'rotate',
        payload: { fromRotation: source.rotation, toRotation: source.rotation + 90 },
      };
  }
}

export const CLIP_TYPE_OPTIONS = [
  { type: 'move',          label: '移动',    desc: '从 A 移动到 B' },
  { type: 'moveAlongPath', label: '曲线移动', desc: '沿贝塞尔曲线移动' },
  { type: 'fade',          label: '淡入淡出', desc: '透明度渐变' },
  { type: 'scale',         label: '缩放',    desc: '大小缩放' },
  { type: 'rotate',        label: '旋转',    desc: '角度旋转' },
  { type: 'shake',         label: '抖动',    desc: '原地抖动震颤' },
] as const;

export type ClipCreatableType = (typeof CLIP_TYPE_OPTIONS)[number]['type'];
