// 缓动相关纯函数：被动画引擎与时间轴 UI 共用（cubic-bezier 解析、贝塞尔曲线编辑数学）。
// 纯逻辑，不依赖 React / Konva / DOM。
import type { EasingType } from '../types';

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

// 缓动预设的控制点（纯数据；对应的 UI label/下拉选项留在使用方）
export const EASING_PRESET_POINTS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

export const clampBezierY = (value: number) => Math.max(-2, Math.min(2, value));

// 解析 easing 为贝塞尔控制点 [x1,y1,x2,y2]：预设→对应点；cubic-bezier→解析；否则默认线性。
export const parseEasingControlPoints = (
  easing?: EasingType,
): { points: [number, number, number, number] } => {
  const raw = easing || 'linear';
  const preset = EASING_PRESET_POINTS[raw];
  if (preset) return { points: [...preset] as [number, number, number, number] };
  const bezier = parseCubicBezier(raw);
  if (bezier) {
    return { points: [bezier.x1, bezier.y1, bezier.x2, bezier.y2] as [number, number, number, number] };
  }
  return { points: [0, 0, 1, 1] as [number, number, number, number] };
};

export const formatBezierValue = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Number(rounded.toFixed(3));
};

export const buildBezierEasingValue = (x1: number, y1: number, x2: number, y2: number): EasingType =>
  `cubic-bezier(${formatBezierValue(x1)},${formatBezierValue(y1)},${formatBezierValue(x2)},${formatBezierValue(y2)})` as EasingType;

export const getEasingPreviewPath = (x1: number, y1: number, x2: number, y2: number) => {
  const w = 88, h = 52, sx = 4, sy = h - 4, ex = w - 4, ey = 4;
  const c1x = sx + (ex - sx) * x1, c1y = sy - (sy - ey) * y1;
  const c2x = sx + (ex - sx) * x2, c2y = sy - (sy - ey) * y2;
  return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
};

// 缓动曲线编辑器用的固定 SVG 参考空间
export const CURVE_VB = { sx: 4, sy: 48, ex: 84, ey: 4, w: 80, h: 44 } as const;

export function getBezierSvgYBounds(ey1: number, ey2: number) {
  const { sy, ey, h } = CURVE_VB;
  const c1y = sy - h * ey1;
  const c2y = sy - h * ey2;
  let minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
  for (let i = 1; i <= 200; i++) {
    const t = i / 200;
    const mt = 1 - t;
    const y = mt*mt*mt*sy + 3*mt*mt*t*c1y + 3*mt*t*t*c2y + t*t*t*ey;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minY, maxY };
}

export function evalBezierPoint(t: number, ex1: number, ey1: number, ex2: number, ey2: number) {
  const { sx, sy, ex, ey, w, h } = CURVE_VB;
  const c1x = sx + w * ex1, c1y = sy - h * ey1;
  const c2x = sx + w * ex2, c2y = sy - h * ey2;
  const mt = 1 - t;
  return {
    x: mt*mt*mt*sx + 3*mt*mt*t*c1x + 3*mt*t*t*c2x + t*t*t*ex,
    y: mt*mt*mt*sy + 3*mt*mt*t*c1y + 3*mt*t*t*c2y + t*t*t*ey,
  };
}

export function findCurveT(mx: number, my: number, ex1: number, ey1: number, ex2: number, ey2: number) {
  let best = 0.5, bestD = Infinity;
  for (let i = 1; i < 100; i++) {
    const t = i / 100;
    const p = evalBezierPoint(t, ex1, ey1, ex2, ey2);
    const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
    if (d < bestD) { best = t; bestD = d; }
  }
  return best;
}
