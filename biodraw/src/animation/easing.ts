// 缓动相关纯函数：被动画引擎与时间轴 UI 共用，避免 cubic-bezier 解析逻辑重复。
// 纯逻辑，不依赖 React / Konva / DOM。

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export type CubicBezierPoints = { x1: number; y1: number; x2: number; y2: number };

// 解析 `cubic-bezier(x1,y1,x2,y2)` 字符串（大小写不敏感）。
// 控制点 x 夹到 [0,1]（缓动函数定义域要求），y 不限制。
// 非 cubic-bezier 字符串或数值非法时返回 null。
// 锚定正则对 'linear'/'ease-in' 等非 bezier 串会在首字符即失败，无需额外前缀守卫。
export const parseCubicBezier = (easing?: string): CubicBezierPoints | null => {
  if (!easing) return null;
  const matched = /^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/i.exec(easing);
  if (!matched) return null;
  const x1 = clamp01(parseFloat(matched[1]));
  const y1 = parseFloat(matched[2]);
  const x2 = clamp01(parseFloat(matched[3]));
  const y2 = parseFloat(matched[4]);
  if ([x1, y1, x2, y2].some((value) => Number.isNaN(value))) return null;
  return { x1, y1, x2, y2 };
};
