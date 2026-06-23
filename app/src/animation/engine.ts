import type { AnimationClip, EasingType, SceneObject, StateChangeClip } from '../types';
import { clamp01, parseEasingControlPoints } from './easing';

const cubicBezierAt = (t: number, p1: number, p2: number) => {
  const oneMinusT = 1 - t;
  return 3 * oneMinusT * oneMinusT * t * p1 + 3 * oneMinusT * t * t * p2 + t * t * t;
};

const solveCubicBezierY = (x: number, x1: number, y1: number, x2: number, y2: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
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
  if (easing === 'linear') return x;
  // 命名预设（ease-in/out/in-out）与自定义 cubic-bezier 统一走时间轴曲线编辑器
  // 同一套控制点解析（parseEasingControlPoints）+ 贝塞尔求解，保证"所见即所播"；
  // 无法识别的 easing 串会回退为线性 [0,0,1,1]。
  const [x1, y1, x2, y2] = parseEasingControlPoints(easing).points;
  return solveCubicBezierY(x, x1, y1, x2, y2);
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
    case 'polylineMove': {
      const { fromX, fromY, midX, midY, toX, toY } = clip.payload;
      const seg1Len = Math.sqrt((midX - fromX) ** 2 + (midY - fromY) ** 2);
      const seg2Len = Math.sqrt((toX - midX) ** 2 + (toY - midY) ** 2);
      const totalLen = seg1Len + seg2Len;
      const split = totalLen > 0 ? seg1Len / totalLen : 0.5;
      let x: number, y: number;
      if (progress <= split) {
        const t = split > 0 ? progress / split : 0;
        x = fromX + (midX - fromX) * t;
        y = fromY + (midY - fromY) * t;
      } else {
        const t = split < 1 ? (progress - split) / (1 - split) : 1;
        x = midX + (toX - midX) * t;
        y = midY + (toY - midY) * t;
      }
      return { ...obj, x, y };
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
    case 'stateChange':
      return obj; // handled separately by renderer; upstream .filter() should prevent this path
    default: {
      const _exhaustive: never = clip;
      return _exhaustive;
    }
  }
};

export const buildAnimatedPreviewObjects = (
  objects: SceneObject[],
  animations: AnimationClip[],
  currentTimeMs: number,
  options: { evaluateAtZero?: boolean } = {},
) => {
  // t=0 默认编辑态：保留全部对象（即使其出现窗口不含 0），方便用户初始化布局。
  if (currentTimeMs <= 0 && !options.evaluateAtZero) return objects;

  const clipsByObjectId = new Map<string, AnimationClip[]>();
  for (const clip of animations) {
    const list = clipsByObjectId.get(clip.objectId) || [];
    list.push(clip);
    clipsByObjectId.set(clip.objectId, list);
  }

  const result: SceneObject[] = [];
  for (const obj of objects) {
    // 出现窗口硬切：appearSegments 存在（含空数组）按多段语义，undefined 才回退 legacy。
    let activeSegmentId: string | null = null;
    if (obj.appearSegments !== undefined) {
      const activeSeg = obj.appearSegments.find(
        (seg) => currentTimeMs >= seg.startMs && currentTimeMs <= seg.endMs,
      );
      if (!activeSeg) continue;
      activeSegmentId = activeSeg.id;
    } else {
      const startMs = obj.appearStartMs ?? 0;
      const endMs = obj.appearEndMs ?? Infinity;
      if (currentTimeMs < startMs || currentTimeMs > endMs) continue;
    }

    const segmentClips = (clipsByObjectId.get(obj.id) || [])
      .filter((clip) => !activeSegmentId || !clip.segmentId || clip.segmentId === activeSegmentId);

    // Compute active stateKey: merge steps from ALL stateChange clips and sort
    // globally by atMs, then apply those that have fired by currentTimeMs.
    // (Merging across clips—rather than per-clip—keeps the result correct even
    // when a segment ends up with more than one stateChange clip.)
    let resolvedStateKey: string | undefined = undefined;
    const stateSteps = segmentClips
      .filter((clip): clip is StateChangeClip => clip.type === 'stateChange')
      .flatMap((clip) => clip.payload.steps)
      .sort((a, b) => a.atMs - b.atMs);
    for (const step of stateSteps) {
      if (currentTimeMs >= step.atMs) resolvedStateKey = step.toStateKey;
    }

    const clips = segmentClips
      .filter((clip) => clip.type !== 'stateChange')
      .sort((a, b) => a.startTimeMs - b.startTimeMs);

    const withState = (o: SceneObject) =>
      resolvedStateKey !== obj.stateKey ? { ...o, stateKey: resolvedStateKey } : o;

    if (clips.length === 0) {
      result.push(withState(obj));
      continue;
    }

    let next = obj;
    for (const clip of clips) {
      if (isClipActiveAt(currentTimeMs, clip)) {
        next = applyClip(next, currentTimeMs, clip);
      } else if (isClipEndedAt(currentTimeMs, clip)) {
        next = applyClip(next, clip.startTimeMs + Math.max(1, clip.durationMs), clip);
      }
    }
    result.push(withState(next));
  }
  return result;
};
