// 动画冲突域：把 clip 类型归并到「冲突域」，用于同段同域不可叠加的判定。
// 纯逻辑，被 state（套用冲突检测）与 timeline UI（冲突提示）共用。
import type { AnimationClip } from '../types';

// 冲突域固定展示顺序
export const CONFLICT_DOMAIN_ORDER = ['position', 'opacity', 'scale', 'rotation', 'state'];

// clip 类型 → 冲突域
export const getConflictDomain = (clipType: AnimationClip['type']) => {
  switch (clipType) {
    case 'move':
    case 'moveAlongPath':
    case 'polylineMove':
    case 'shake':
      return 'position';
    case 'fade':
      return 'opacity';
    case 'scale':
      return 'scale';
    case 'rotate':
      return 'rotation';
    case 'stateChange':
      return 'state';
    default:
      return clipType;
  }
};

// 按 CONFLICT_DOMAIN_ORDER 排序冲突域
export const sortConflictDomains = (domains: string[]) =>
  [...domains].sort((a, b) => {
    const ai = CONFLICT_DOMAIN_ORDER.indexOf(a), bi = CONFLICT_DOMAIN_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
