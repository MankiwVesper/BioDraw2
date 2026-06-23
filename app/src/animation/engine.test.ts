import { describe, it, expect } from 'vitest';
import { buildAnimatedPreviewObjects } from './engine';
import type { AnimationClip, SceneObject } from '../types';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: 'o1', type: 'rect', name: '', x: 0, y: 0, width: 100, height: 100,
    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, visible: true, zIndex: 0,
    animationIds: [],
    ...overrides,
  };
}

describe('buildAnimatedPreviewObjects — 编辑态/求值', () => {
  it('t<=0 且无 evaluateAtZero 时原样返回同一数组', () => {
    const objs = [makeObj({ x: 999 })];
    const result = buildAnimatedPreviewObjects(objs, [], 0);
    expect(result).toBe(objs);
  });

  it('move 片段在中点线性插值', () => {
    const obj = makeObj({ x: 999, y: 0 });
    const anims: AnimationClip[] = [
      { id: 'm', objectId: 'o1', type: 'move', startTimeMs: 0, durationMs: 1000, payload: { fromX: 0, fromY: 0, toX: 100, toY: 0 } },
    ];
    const result = buildAnimatedPreviewObjects([obj], anims, 500);
    expect(result[0].x).toBeCloseTo(50);
  });

  it('片段结束后保持末值', () => {
    const obj = makeObj();
    const anims: AnimationClip[] = [
      { id: 'm', objectId: 'o1', type: 'move', startTimeMs: 0, durationMs: 1000, payload: { fromX: 0, fromY: 0, toX: 100, toY: 0 } },
    ];
    const result = buildAnimatedPreviewObjects([obj], anims, 1500);
    expect(result[0].x).toBeCloseTo(100);
  });

  it('fade 片段插值透明度', () => {
    const obj = makeObj({ opacity: 0.2 });
    const anims: AnimationClip[] = [
      { id: 'f', objectId: 'o1', type: 'fade', startTimeMs: 0, durationMs: 1000, payload: { fromOpacity: 1, toOpacity: 0 } },
    ];
    const result = buildAnimatedPreviewObjects([obj], anims, 500);
    expect(result[0].opacity).toBeCloseTo(0.5);
  });

  it('evaluateAtZero 时在 t=0 应用片段起始值', () => {
    const obj = makeObj({ x: 999 });
    const anims: AnimationClip[] = [
      { id: 'm', objectId: 'o1', type: 'move', startTimeMs: 0, durationMs: 1000, payload: { fromX: 0, fromY: 0, toX: 100, toY: 0 } },
    ];
    const result = buildAnimatedPreviewObjects([obj], anims, 0, { evaluateAtZero: true });
    expect(result[0].x).toBeCloseTo(0);
  });
});

describe('buildAnimatedPreviewObjects — 出现窗口', () => {
  it('appearSegments：窗口外的对象被裁掉', () => {
    const obj = makeObj({ id: 'seg', appearSegments: [{ id: 's1', startMs: 0, endMs: 1000 }] });
    expect(buildAnimatedPreviewObjects([obj], [], 2000)).toHaveLength(0);
    expect(buildAnimatedPreviewObjects([obj], [], 500)).toHaveLength(1);
  });

  it('legacy appearStartMs/appearEndMs：窗口外被裁掉', () => {
    const obj = makeObj({ id: 'leg', appearStartMs: 0, appearEndMs: 1000 });
    expect(buildAnimatedPreviewObjects([obj], [], 2000)).toHaveLength(0);
    expect(buildAnimatedPreviewObjects([obj], [], 500)).toHaveLength(1);
  });
});

describe('buildAnimatedPreviewObjects — stateChange 全局时间序（B5 回归）', () => {
  it('多个 stateChange 片段按 atMs 全局排序解析，而非数组顺序', () => {
    const obj = makeObj({ id: 'sc', stateKey: 'init', appearSegments: [{ id: 's1', startMs: 0, endMs: 10000 }] });
    // 故意把 atMs 较晚的片段放在数组前面：旧的按数组顺序覆盖会错误地解析成 'a'
    const anims: AnimationClip[] = [
      { id: 'B', objectId: 'sc', type: 'stateChange', segmentId: 's1', startTimeMs: 500, durationMs: 1, payload: { steps: [{ atMs: 500, toStateKey: 'b' }] } },
      { id: 'A', objectId: 'sc', type: 'stateChange', segmentId: 's1', startTimeMs: 0, durationMs: 1, payload: { steps: [{ atMs: 0, toStateKey: 'a' }] } },
    ];
    const result = buildAnimatedPreviewObjects([obj], anims, 600);
    expect(result[0].stateKey).toBe('b');
  });

  it('单个 stateChange 片段内按 atMs 解析当前状态', () => {
    const obj = makeObj({ id: 'sc', stateKey: 'init', appearSegments: [{ id: 's1', startMs: 0, endMs: 10000 }] });
    const anims: AnimationClip[] = [
      { id: 'S', objectId: 'sc', type: 'stateChange', segmentId: 's1', startTimeMs: 0, durationMs: 1, payload: { steps: [{ atMs: 0, toStateKey: 'a' }, { atMs: 1000, toStateKey: 'b' }] } },
    ];
    expect(buildAnimatedPreviewObjects([obj], anims, 500)[0].stateKey).toBe('a');
    expect(buildAnimatedPreviewObjects([obj], anims, 1500)[0].stateKey).toBe('b');
  });
});

describe('buildAnimatedPreviewObjects — 其它位置插值与缓动', () => {
  it('polylineMove 两段按弧长比例插值', () => {
    const obj = makeObj();
    const anims: AnimationClip[] = [
      { id: 'p', objectId: 'o1', type: 'polylineMove', startTimeMs: 0, durationMs: 1000, payload: { fromX: 0, fromY: 0, midX: 100, midY: 0, toX: 200, toY: 0 } },
    ];
    // 两段等长 → split=0.5：t=250 在第一段中点(50)，t=500 恰在拐点(100)，t=750 在第二段中点(150)
    expect(buildAnimatedPreviewObjects([obj], anims, 250)[0].x).toBeCloseTo(50);
    expect(buildAnimatedPreviewObjects([obj], anims, 500)[0].x).toBeCloseTo(100);
    expect(buildAnimatedPreviewObjects([obj], anims, 750)[0].x).toBeCloseTo(150);
  });

  it('moveAlongPath 三次贝塞尔端点 = from/to', () => {
    const obj = makeObj({ x: 999 });
    const anims: AnimationClip[] = [
      { id: 'b', objectId: 'o1', type: 'moveAlongPath', startTimeMs: 0, durationMs: 1000, payload: { fromX: 0, fromY: 0, control1X: 10, control1Y: 0, control2X: 20, control2Y: 0, toX: 100, toY: 0 } },
    ];
    expect(buildAnimatedPreviewObjects([obj], anims, 0, { evaluateAtZero: true })[0].x).toBeCloseTo(0);
    expect(buildAnimatedPreviewObjects([obj], anims, 1500)[0].x).toBeCloseTo(100);
  });

  const moveWith = (easing: AnimationClip['easing']): AnimationClip[] => [
    { id: 'm', objectId: 'o1', type: 'move', startTimeMs: 0, durationMs: 1000, easing, payload: { fromX: 0, fromY: 0, toX: 100, toY: 0 } },
  ];

  it.each([
    ['ease-in', 'cubic-bezier(0.42,0,1,1)'],
    ['ease-out', 'cubic-bezier(0,0,0.58,1)'],
    ['ease-in-out', 'cubic-bezier(0.42,0,0.58,1)'],
  ] as const)('命名预设 %s 求值 = 其 cubic-bezier %s（与曲线编辑器一致）', (named, bezier) => {
    const obj = makeObj();
    for (const t of [250, 500, 750]) {
      const a = buildAnimatedPreviewObjects([obj], moveWith(named), t)[0].x;
      const b = buildAnimatedPreviewObjects([obj], moveWith(bezier), t)[0].x;
      expect(a).toBeCloseTo(b);
    }
  });

  it('ease-in 慢起步：中点位移低于线性的 50', () => {
    const obj = makeObj();
    const x = buildAnimatedPreviewObjects([obj], moveWith('ease-in'), 500)[0].x;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(50);
  });
});
