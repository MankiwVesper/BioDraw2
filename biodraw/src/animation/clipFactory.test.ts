import { describe, it, expect } from 'vitest';
import { buildClip, buildPresetClips, type ClipTiming } from './clipFactory';
import type { SceneObject } from '../types';

function makeObj(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: 'src-1', type: 'rect', name: '', x: 10, y: 20, width: 100, height: 80,
    rotation: 30, scaleX: 2, scaleY: 3, opacity: 0.5, visible: true, zIndex: 0,
    animationIds: [],
    ...overrides,
  };
}

const timing: ClipTiming = { startTimeMs: 100, durationMs: 1000 };
const fixedId = () => 'clip-id';

describe('buildClip', () => {
  it('公共字段来自入参', () => {
    const clip = buildClip({ type: 'move', src: makeObj(), objectId: 'obj-9', segmentId: 'seg-3', timing, createId: fixedId });
    expect(clip.id).toBe('clip-id');
    expect(clip.objectId).toBe('obj-9');
    expect(clip.segmentId).toBe('seg-3');
    expect(clip.startTimeMs).toBe(100);
    expect(clip.durationMs).toBe(1000);
    expect(clip.easing).toBe('linear');
    expect(clip.enabled).toBe(true);
  });

  it('move 默认 payload 基于 src 坐标', () => {
    const clip = buildClip({ type: 'move', src: makeObj(), objectId: 'o', segmentId: 's', timing, createId: fixedId });
    expect(clip).toMatchObject({ type: 'move', payload: { fromX: 10, fromY: 20, toX: 130, toY: 100 } });
  });

  it('scale 默认 payload 基于 src 缩放', () => {
    const clip = buildClip({ type: 'scale', src: makeObj(), objectId: 'o', segmentId: 's', timing, createId: fixedId });
    expect(clip.type).toBe('scale');
    if (clip.type === 'scale') {
      expect(clip.payload.fromScaleX).toBe(2);
      expect(clip.payload.fromScaleY).toBe(3);
      expect(clip.payload.toScaleX).toBeCloseTo(2.4);
      expect(clip.payload.toScaleY).toBeCloseTo(3.6);
    }
  });

  it('rotate 默认 payload 基于 src 旋转', () => {
    const clip = buildClip({ type: 'rotate', src: makeObj(), objectId: 'o', segmentId: 's', timing, createId: fixedId });
    expect(clip).toMatchObject({ type: 'rotate', payload: { fromRotation: 30, toRotation: 120 } });
  });

  it('polylineMove 默认 payload', () => {
    const clip = buildClip({ type: 'polylineMove', src: makeObj(), objectId: 'o', segmentId: 's', timing, createId: fixedId });
    expect(clip).toMatchObject({ type: 'polylineMove', payload: { fromX: 10, fromY: 20, midX: 70, midY: -60, toX: 130, toY: 20 } });
  });

  it('moveAlongPath 默认 payload', () => {
    const clip = buildClip({ type: 'moveAlongPath', src: makeObj(), objectId: 'o', segmentId: 's', timing, createId: fixedId });
    expect(clip).toMatchObject({ type: 'moveAlongPath', payload: { fromX: 10, fromY: 20, control1X: 50, control1Y: -100, control2X: 130, control2Y: -60, toX: 170, toY: 20 } });
  });

  it('shake 默认 payload', () => {
    const clip = buildClip({ type: 'shake', src: makeObj(), objectId: 'o', segmentId: 's', timing, createId: fixedId });
    expect(clip).toMatchObject({ type: 'shake', payload: { baseX: 10, baseY: 20, amplitudeX: 16, amplitudeY: 8, frequency: 6, decay: 1 } });
  });

  it('fade 默认 payload', () => {
    const clip = buildClip({ type: 'fade', src: makeObj({ opacity: 1 }), objectId: 'o', segmentId: 's', timing, createId: fixedId });
    expect(clip).toMatchObject({ type: 'fade', payload: { fromOpacity: 1, toOpacity: 0.4 } });
  });

  it('stateChange 强制 durationMs:1、atMs=timing.startTimeMs、取 stateKeys[0]', () => {
    const clip = buildClip({
      type: 'stateChange', src: makeObj(), objectId: 'o', segmentId: 's', timing,
      createId: fixedId, stateKeys: ['open', 'closed'],
    });
    expect(clip.type).toBe('stateChange');
    expect(clip.durationMs).toBe(1);
    if (clip.type === 'stateChange') {
      expect(clip.payload.steps).toEqual([{ atMs: 100, toStateKey: 'open' }]);
    }
  });

  it('stateChange 无 stateKeys 时 toStateKey 为空串', () => {
    const clip = buildClip({ type: 'stateChange', src: makeObj(), objectId: 'o', segmentId: 's', timing, createId: fixedId });
    if (clip.type === 'stateChange') {
      expect(clip.payload.steps[0].toStateKey).toBe('');
    }
  });
});

describe('buildPresetClips', () => {
  function counterId() {
    let n = 0;
    return () => `id-${n++}`;
  }

  it('bounceIn → scale + fade 两段', () => {
    const clips = buildPresetClips({ template: 'bounceIn', src: makeObj(), objectId: 'o', startTimeMs: 0, createId: counterId() });
    expect(clips.map((c) => c.type)).toEqual(['scale', 'fade']);
  });

  it.each([
    ['fadeIn', ['fade']],
    ['moveFadeIn', ['move', 'fade']],
    ['fadeOut', ['fade']],
    ['crossMembrane', ['moveAlongPath']],
    ['endocytosis', ['moveAlongPath', 'fade']],
    ['moveFadeOut', ['move', 'fade']],
  ] as const)('%s → %j', (template, types) => {
    const clips = buildPresetClips({ template, src: makeObj(), objectId: 'o', startTimeMs: 0, createId: counterId() });
    expect(clips.map((c) => c.type)).toEqual(types);
  });

  it('产出片段无 segmentId、startTimeMs 用入参（未夹取）', () => {
    const clips = buildPresetClips({ template: 'moveFadeIn', src: makeObj(), objectId: 'o', startTimeMs: 777, createId: counterId() });
    for (const c of clips) {
      expect(c.segmentId).toBeUndefined();
      expect(c.startTimeMs).toBe(777);
      expect(c.objectId).toBe('o');
    }
  });
});
