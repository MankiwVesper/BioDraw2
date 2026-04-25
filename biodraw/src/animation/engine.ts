import type { AnimationClip, EasingType, SceneObject } from '../types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const parseCubicBezierEasing = (easing?: EasingType) => {
  if (!easing || !easing.startsWith('cubic-bezier(')) return null;
  const matched = /^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/i.exec(easing);
  if (!matched) return null;
  const x1 = clamp01(parseFloat(matched[1]));
  const y1 = parseFloat(matched[2]);
  const x2 = clamp01(parseFloat(matched[3]));
  const y2 = parseFloat(matched[4]);
  if ([x1, y1, x2, y2].some((value) => Number.isNaN(value))) return null;
  return { x1, y1, x2, y2 };
};

const cubicBezierAt = (t: number, p1: number, p2: number) => {
  const oneMinusT = 1 - t;
  return 3 * oneMinusT * oneMinusT * t * p1 + 3 * oneMinusT * t * t * p2 + t * t * t;
};

const solveCubicBezierY = (x: number, x1: number, y1: number, x2: number, y2: number) => {
  let left = 0;
  let right = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (left + right) / 2;
    const estimateX = cubicBezierAt(mid, x1, x2);
    if (estimateX < x) {
      left = mid;
    } else {
      right = mid;
    }
  }
  const t = (left + right) / 2;
  return cubicBezierAt(t, y1, y2);
};

const resolveCubicBezier = (p0: number, c1: number, c2: number, p1: number, t: number) => {
  const u = 1 - t;
  return u*u*u*p0 + 3*u*u*t*c1 + 3*u*t*t*c2 + t*t*t*p1;
};

const applyEasing = (t: number, easing: EasingType = 'linear') => {
  const x = clamp01(t);
  const cubicBezier = parseCubicBezierEasing(easing);
  if (cubicBezier) {
    return solveCubicBezierY(x, cubicBezier.x1, cubicBezier.y1, cubicBezier.x2, cubicBezier.y2);
  }
  switch (easing) {
    case 'ease-in':
      return x * x;
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 'ease-in-out':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'linear':
    default:
      return x;
  }
};

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const normalizeInternalKeyframes = <T extends { at: number }>(keyframes?: T[]) => {
  if (!keyframes || keyframes.length === 0) return [] as T[];
  const sorted = keyframes
    .filter((frame) => Number.isFinite(frame.at))
    .map((frame) => ({
      ...frame,
      at: clamp01(frame.at),
    }))
    .filter((frame) => frame.at > 0 && frame.at < 1)
    .sort((a, b) => a.at - b.at);

  const deduped: T[] = [];
  for (const frame of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.at - frame.at) < 0.0001) {
      deduped[deduped.length - 1] = frame;
      continue;
    }
    deduped.push(frame);
  }
  return deduped;
};

const resolveTrackValue = (
  progress: number,
  startValue: number,
  endValue: number,
  keyframes?: Array<{ at: number; value: number }>,
) => {
  const t = clamp01(progress);
  const internal = normalizeInternalKeyframes(keyframes);
  const frames = [
    { at: 0, value: startValue },
    ...internal,
    { at: 1, value: endValue },
  ];

  for (let i = 0; i < frames.length - 1; i += 1) {
    const current = frames[i];
    const next = frames[i + 1];
    if (t >= current.at && t <= next.at) {
      const segment = next.at - current.at;
      if (segment <= 0.000001) return next.value;
      const localT = (t - current.at) / segment;
      return lerp(current.value, next.value, localT);
    }
  }

  return endValue;
};

const resolveProgress = (timeMs: number, clip: AnimationClip) => {
  const duration = Math.max(1, clip.durationMs);
  const local = timeMs - clip.startTimeMs;
  return applyEasing(local / duration, clip.easing);
};

const isClipActiveAt = (timeMs: number, clip: AnimationClip) => {
  if (clip.enabled === false) return false;
  const start = clip.startTimeMs;
  const end = clip.startTimeMs + Math.max(1, clip.durationMs);
  return timeMs >= start && timeMs <= end;
};

const isClipEndedAt = (timeMs: number, clip: AnimationClip) => {
  const end = clip.startTimeMs + Math.max(1, clip.durationMs);
  return timeMs > end;
};

const applyClip = (obj: SceneObject, timeMs: number, clip: AnimationClip): SceneObject => {
  if (clip.enabled === false) return obj;
  const progress = resolveProgress(timeMs, clip);

  switch (clip.type) {
    case 'move': {
      const { fromX, fromY, toX, toY, keyframes } = clip.payload;
      return {
        ...obj,
        x: resolveTrackValue(
          progress,
          fromX,
          toX,
          keyframes?.map((frame) => ({ at: frame.at, value: frame.x })),
        ),
        y: resolveTrackValue(
          progress,
          fromY,
          toY,
          keyframes?.map((frame) => ({ at: frame.at, value: frame.y })),
        ),
      };
    }
    case 'moveAlongPath': {
      const { fromX, fromY, control1X, control1Y, control2X, control2Y, toX, toY } = clip.payload;
      return {
        ...obj,
        x: resolveCubicBezier(fromX, control1X, control2X, toX, progress),
        y: resolveCubicBezier(fromY, control1Y, control2Y, toY, progress),
      };
    }
    case 'shake': {
      const { baseX, baseY, amplitudeX, amplitudeY, frequency, decay = 1 } = clip.payload;
      const safeFrequency = Math.max(0, frequency);
      const safeDecay = Math.max(0, decay);
      const angle = progress * Math.PI * 2 * safeFrequency;
      const envelope = Math.pow(Math.max(0, 1 - progress), safeDecay);
      return {
        ...obj,
        x: baseX + Math.sin(angle) * amplitudeX * envelope,
        y: baseY + Math.sin(angle) * amplitudeY * envelope,
      };
    }
    case 'fade': {
      const { fromOpacity, toOpacity, keyframes } = clip.payload;
      return {
        ...obj,
        opacity: resolveTrackValue(progress, fromOpacity, toOpacity, keyframes),
      };
    }
    case 'scale': {
      const { fromScaleX, fromScaleY, toScaleX, toScaleY, keyframes } = clip.payload;
      return {
        ...obj,
        scaleX: resolveTrackValue(
          progress,
          fromScaleX,
          toScaleX,
          keyframes?.map((frame) => ({ at: frame.at, value: frame.scaleX })),
        ),
        scaleY: resolveTrackValue(
          progress,
          fromScaleY,
          toScaleY,
          keyframes?.map((frame) => ({ at: frame.at, value: frame.scaleY })),
        ),
      };
    }
    case 'rotate': {
      const { fromRotation, toRotation, keyframes } = clip.payload;
      return {
        ...obj,
        rotation: resolveTrackValue(progress, fromRotation, toRotation, keyframes),
      };
    }
    default:
      return obj;
  }
};

export const buildAnimatedPreviewObjects = (
  objects: SceneObject[],
  animations: AnimationClip[],
  currentTimeMs: number,
) => {
  if (animations.length === 0 || currentTimeMs <= 0) return objects;

  const clipsByObjectId = new Map<string, AnimationClip[]>();
  for (const clip of animations) {
    const list = clipsByObjectId.get(clip.objectId) || [];
    list.push(clip);
    clipsByObjectId.set(clip.objectId, list);
  }

  return objects.map((obj) => {
    const clips = (clipsByObjectId.get(obj.id) || [])
      .filter((clip) => clip.type !== 'stateChange')
      .sort((a, b) => a.startTimeMs - b.startTimeMs);

    if (clips.length === 0) return obj;

    let next = obj;
    for (const clip of clips) {
      if (isClipActiveAt(currentTimeMs, clip)) {
        next = applyClip(next, currentTimeMs, clip);
      } else if (isClipEndedAt(currentTimeMs, clip)) {
        next = applyClip(next, clip.startTimeMs + Math.max(1, clip.durationMs), clip);
      }
    }
    return next;
  });
};
