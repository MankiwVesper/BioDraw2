import { describe, it, expect } from 'vitest';
import {
  clamp01,
  parseCubicBezier,
  parseEasingControlPoints,
  formatBezierValue,
  buildBezierEasingValue,
  EASING_PRESET_POINTS,
} from './easing';

describe('clamp01', () => {
  it('夹到 [0,1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe('parseCubicBezier', () => {
  it('解析合法 cubic-bezier', () => {
    expect(parseCubicBezier('cubic-bezier(0.42,0,0.58,1)')).toEqual({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
  });

  it('x 夹到 [0,1]，y 不夹', () => {
    expect(parseCubicBezier('cubic-bezier(-1,-2,2,3)')).toEqual({ x1: 0, y1: -2, x2: 1, y2: 3 });
  });

  it('大小写不敏感', () => {
    expect(parseCubicBezier('CUBIC-BEZIER(0,0,1,1)')).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
  });

  it('非 bezier / 非法 / undefined 返回 null', () => {
    expect(parseCubicBezier('linear')).toBeNull();
    expect(parseCubicBezier('ease-in')).toBeNull();
    expect(parseCubicBezier('cubic-bezier(1,2,3)')).toBeNull();
    expect(parseCubicBezier(undefined)).toBeNull();
    expect(parseCubicBezier('')).toBeNull();
  });
});

describe('parseEasingControlPoints', () => {
  it('预设名 → 预设点位', () => {
    expect(parseEasingControlPoints('linear').points).toEqual([0, 0, 1, 1]);
    expect(parseEasingControlPoints('ease-in').points).toEqual([0.42, 0, 1, 1]);
    expect(parseEasingControlPoints('ease-out').points).toEqual([0, 0, 0.58, 1]);
    expect(parseEasingControlPoints('ease-in-out').points).toEqual([0.42, 0, 0.58, 1]);
  });

  it('合法 bezier → 解析点位', () => {
    expect(parseEasingControlPoints('cubic-bezier(0.1,0.2,0.3,0.4)').points).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('undefined → 线性', () => {
    expect(parseEasingControlPoints(undefined).points).toEqual([0, 0, 1, 1]);
  });

  it('无法识别 → 回退 [0,0,1,1]', () => {
    expect(parseEasingControlPoints('cubic-bezier(bad)' as never).points).toEqual([0, 0, 1, 1]);
  });
});

describe('formatBezierValue', () => {
  it('四舍五入到 3 位小数', () => {
    expect(formatBezierValue(0.123456)).toBe(0.123);
    expect(formatBezierValue(1)).toBe(1);
  });
});

describe('buildBezierEasingValue', () => {
  it('生成 cubic-bezier 串并能往返解析', () => {
    const s = buildBezierEasingValue(0.25, 0.1, 0.25, 1);
    expect(s).toBe('cubic-bezier(0.25,0.1,0.25,1)');
    expect(parseCubicBezier(s)).toEqual({ x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 });
  });
});

describe('EASING_PRESET_POINTS', () => {
  it('与四个预设值一致', () => {
    expect(EASING_PRESET_POINTS).toEqual({
      linear: [0, 0, 1, 1],
      'ease-in': [0.42, 0, 1, 1],
      'ease-out': [0, 0, 0.58, 1],
      'ease-in-out': [0.42, 0, 0.58, 1],
    });
  });
});
