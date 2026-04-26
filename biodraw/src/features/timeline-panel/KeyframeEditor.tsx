import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnimationClip,
  FadeClip,
  MoveClip,
  NumericKeyframe,
  PointKeyframe,
  RotateClip,
  ScaleClip,
  ScaleKeyframe,
} from '../../types';

// ── 类型 ──────────────────────────────────────────────

type KeyframeableClip = MoveClip | FadeClip | ScaleClip | RotateClip;
type AnyKeyframe = PointKeyframe | NumericKeyframe | ScaleKeyframe;

interface FieldSpec {
  key: string;
  label: string;
  step: number;
  min?: number;
  max?: number;
  sanitize?: (n: number) => number;
}

interface PresetSpec {
  key: string;
  label: string;
  tooltip?: string;
  generate: () => AnyKeyframe[];
}

interface KeyframeEditorProps {
  clip: KeyframeableClip;
  currentTimeMs: number;
  ensurePausedForEdit: () => void;
  updateClipPayload: (clip: AnimationClip, payloadUpdates: Record<string, unknown>) => void;
}

// ── 内部工具 ─────────────────────────────────────────

const MAX_KEYFRAMES = 4;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

const sortAndSanitize = <T extends { at: number }>(kfs: T[]): T[] => {
  const sorted = kfs
    .filter((f) => Number.isFinite(f.at))
    .map((f) => ({ ...f, at: clamp01(f.at) }))
    .filter((f) => f.at > 0 && f.at < 1)
    .sort((a, b) => a.at - b.at);
  const out: T[] = [];
  for (const f of sorted) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.at - f.at) < 0.0001) {
      out[out.length - 1] = f;
      continue;
    }
    out.push(f);
  }
  return out;
};

const findEmptySlotAt = (existing: { at: number }[]) => {
  const slots = [0, ...existing.map((f) => clamp01(f.at)).sort((a, b) => a - b), 1];
  let maxGap = 0, bestAt = 0.5;
  for (let i = 0; i < slots.length - 1; i++) {
    const gap = slots[i + 1] - slots[i];
    if (gap > maxGap) { maxGap = gap; bestAt = (slots[i] + slots[i + 1]) / 2; }
  }
  return bestAt;
};

const getActivePreset = (kfs: { preset?: string }[]): string | null => {
  if (!kfs || kfs.length === 0) return null;
  const p = kfs[0].preset;
  if (!p) return null;
  return kfs.every((f) => f.preset === p) ? p : null;
};

// 在 at 处对字段做线性插值（用周边帧 + from/to）
function interpolateField(
  at: number,
  fieldKey: string,
  kfs: AnyKeyframe[],
  fromVal: number,
  toVal: number,
): number {
  const points: { at: number; v: number }[] = [
    { at: 0, v: fromVal },
    ...kfs.map((kf) => ({ at: kf.at, v: (kf as unknown as Record<string, number>)[fieldKey] ?? 0 })),
    { at: 1, v: toVal },
  ].sort((a, b) => a.at - b.at);
  for (let i = 0; i < points.length - 1; i++) {
    if (at >= points[i].at && at <= points[i + 1].at) {
      const span = points[i + 1].at - points[i].at;
      if (span <= 0) return points[i].v;
      const t = (at - points[i].at) / span;
      return points[i].v + (points[i + 1].v - points[i].v) * t;
    }
  }
  return fromVal;
}

// 吸附到 0 / 25 / 50 / 75 / 100，阈值 2%
const snapPercent = (pct: number) => {
  for (const tgt of [0, 25, 50, 75, 100]) {
    if (Math.abs(pct - tgt) < 2) return tgt;
  }
  return pct;
};

// ── 类型配置 ─────────────────────────────────────────

function getEditorConfig(clip: KeyframeableClip): {
  fields: FieldSpec[];
  presets: PresetSpec[];
  buildKeyframeAt: (at: number, currentKfs: AnyKeyframe[]) => AnyKeyframe;
} {
  if (clip.type === 'move') {
    const { fromX, fromY, toX, toY } = clip.payload;
    return {
      fields: [
        { key: 'x', label: '坐标Ｘ', step: 1 },
        { key: 'y', label: '坐标Ｙ', step: 1 },
      ],
      presets: [
        {
          key: 'waypoint',
          label: '路径点',
          tooltip: '在中点设置一个偏移路径点（如囊泡运输的中间站）',
          generate: () => [{
            at: 0.5,
            x: Math.round((fromX + toX) / 2),
            y: Math.round((fromY + toY) / 2 - 80),
            preset: 'waypoint',
          }],
        },
      ],
      buildKeyframeAt: (at, kfs) => ({
        at,
        x: Math.round(interpolateField(at, 'x', kfs, fromX, toX)),
        y: Math.round(interpolateField(at, 'y', kfs, fromY, toY)),
      }),
    };
  }

  if (clip.type === 'fade') {
    const { fromOpacity, toOpacity } = clip.payload;
    return {
      fields: [
        { key: 'value', label: '透明度', step: 0.01, min: 0, max: 1, sanitize: clamp01 },
      ],
      presets: [
        {
          key: 'flash',
          label: '闪烁',
          tooltip: '透明度在起止之间反复切换（强调某结构）',
          generate: () => [
            { at: 0.33, value: toOpacity, preset: 'flash' },
            { at: 0.67, value: fromOpacity, preset: 'flash' },
          ],
        },
        {
          key: 'emphasis',
          label: '强调',
          tooltip: '中段达到完全不透明',
          generate: () => [
            { at: 0.4, value: 1.0, preset: 'emphasis' },
            { at: 0.6, value: 1.0, preset: 'emphasis' },
          ],
        },
        {
          key: 'gradualUp',
          label: '渐增',
          tooltip: '前慢后快（产物浓度积累、激素释放）',
          generate: () => [
            { at: 0.7, value: clamp01((fromOpacity + toOpacity) / 2), preset: 'gradualUp' },
          ],
        },
        {
          key: 'gradualDown',
          label: '渐减',
          tooltip: '前快后慢（底物消耗、扩散衰减）',
          generate: () => [
            { at: 0.3, value: clamp01((fromOpacity + toOpacity) / 2), preset: 'gradualDown' },
          ],
        },
      ],
      buildKeyframeAt: (at, kfs) => ({
        at,
        value: clamp01(interpolateField(at, 'value', kfs, fromOpacity, toOpacity)),
      }),
    };
  }

  if (clip.type === 'scale') {
    const { fromScaleX, fromScaleY, toScaleX, toScaleY } = clip.payload;
    return {
      fields: [
        { key: 'scaleX', label: '倍数Ｘ', step: 0.01 },
        { key: 'scaleY', label: '倍数Ｙ', step: 0.01 },
      ],
      presets: [
        {
          key: 'pulse',
          label: '脉冲',
          tooltip: '中段超过终点尺寸（单次跳动）',
          generate: () => [
            { at: 0.5, scaleX: toScaleX * 1.3, scaleY: toScaleY * 1.3, preset: 'pulse' },
          ],
        },
        {
          key: 'elastic',
          label: '弹性',
          tooltip: '过冲后回稳（弹性回弹）',
          generate: () => [
            { at: 0.65, scaleX: toScaleX * 1.15, scaleY: toScaleY * 1.15, preset: 'elastic' },
            { at: 0.82, scaleX: toScaleX * 0.97, scaleY: toScaleY * 0.97, preset: 'elastic' },
          ],
        },
        {
          key: 'heartbeat',
          label: '心跳',
          tooltip: '双段脉冲（lub-dub，模拟心搏）',
          generate: () => [
            { at: 0.22, scaleX: toScaleX * 1.28, scaleY: toScaleY * 1.28, preset: 'heartbeat' },
            { at: 0.38, scaleX: toScaleX * 1.0, scaleY: toScaleY * 1.0, preset: 'heartbeat' },
            { at: 0.55, scaleX: toScaleX * 1.18, scaleY: toScaleY * 1.18, preset: 'heartbeat' },
            { at: 0.72, scaleX: toScaleX * 1.0, scaleY: toScaleY * 1.0, preset: 'heartbeat' },
          ],
        },
      ],
      buildKeyframeAt: (at, kfs) => ({
        at,
        scaleX: Number(interpolateField(at, 'scaleX', kfs, fromScaleX, toScaleX).toFixed(3)),
        scaleY: Number(interpolateField(at, 'scaleY', kfs, fromScaleY, toScaleY).toFixed(3)),
      }),
    };
  }

  // rotate
  const { fromRotation, toRotation } = clip.payload;
  return {
    fields: [
      { key: 'value', label: '角度值', step: 1 },
    ],
    presets: [
      {
        key: 'swing',
        label: '摆动',
        tooltip: '左右往复摆动（鞭毛 / 纤毛）',
        generate: () => [
          { at: 0.35, value: toRotation, preset: 'swing' },
          { at: 0.65, value: fromRotation, preset: 'swing' },
        ],
      },
      {
        key: 'elastic',
        label: '弹性',
        tooltip: '过冲后回稳',
        generate: () => [
          { at: 0.65, value: toRotation + (toRotation - fromRotation) * 0.2, preset: 'elastic' },
          { at: 0.85, value: toRotation - (toRotation - fromRotation) * 0.07, preset: 'elastic' },
        ],
      },
    ],
    buildKeyframeAt: (at, kfs) => ({
      at,
      value: Number(interpolateField(at, 'value', kfs, fromRotation, toRotation).toFixed(2)),
    }),
  };
}

// ── 主组件 ───────────────────────────────────────────

export function KeyframeEditor({
  clip,
  currentTimeMs,
  ensurePausedForEdit,
  updateClipPayload,
}: KeyframeEditorProps) {
  const config = useMemo(() => getEditorConfig(clip), [clip]);
  const keyframes = (clip.payload.keyframes || []) as AnyKeyframe[];
  const activePreset = getActivePreset(keyframes as { preset?: string }[]);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [dragState, setDragState] = useState<{ idx: number; at: number } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Refs 持有最新值，避免拖动 effect 内的 stale closure
  const dragStateRef = useRef(dragState);
  const latestRef = useRef({ keyframes, clip, ensurePausedForEdit, updateClipPayload });
  useEffect(() => {
    dragStateRef.current = dragState;
    latestRef.current = { keyframes, clip, ensurePausedForEdit, updateClipPayload };
  });

  // 当前播放头在 clip 内的相对位置（0~1）
  const playheadAt = useMemo(() => {
    const t = (currentTimeMs - clip.startTimeMs) / Math.max(1, clip.durationMs);
    return clamp01(t);
  }, [currentTimeMs, clip.startTimeMs, clip.durationMs]);
  const playheadInRange = currentTimeMs >= clip.startTimeMs && currentTimeMs <= clip.startTimeMs + clip.durationMs;

  // 更新关键帧数组
  const writeKeyframes = (kfs: AnyKeyframe[]) => {
    ensurePausedForEdit();
    updateClipPayload(clip, { keyframes: sortAndSanitize(kfs) });
  };

  const setKeyframeField = (idx: number, key: string, rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const cur = keyframes[idx];
    if (!cur) return;
    const next = [...keyframes];
    if (key === 'at') {
      next[idx] = { ...cur, at: clampPercent(parsed) / 100 } as AnyKeyframe;
    } else {
      const fieldSpec = config.fields.find((f) => f.key === key);
      const v = fieldSpec?.sanitize ? fieldSpec.sanitize(parsed) : parsed;
      next[idx] = { ...cur, [key]: v } as AnyKeyframe;
    }
    writeKeyframes(next);
  };

  const removeAt = (idx: number) => {
    const target = keyframes[idx] as { preset?: string } | undefined;
    const next = target?.preset
      ? keyframes.filter((f) => (f as { preset?: string }).preset !== target.preset)
      : keyframes.filter((_, i) => i !== idx);
    writeKeyframes(next);
    setSelectedIdx(null);
  };

  const customKeyframeCount = keyframes.filter((f) => !(f as { preset?: string }).preset).length;
  const isAtMaxKeyframes = customKeyframeCount >= MAX_KEYFRAMES;

  const addAt = (at: number) => {
    if (isAtMaxKeyframes) return;
    const safeAt = Math.max(0.02, Math.min(0.98, at));
    const newKf = config.buildKeyframeAt(safeAt, keyframes);
    const next = [...keyframes.filter((f) => !(f as { preset?: string }).preset), newKf];
    writeKeyframes(next);
  };

  const addAtPlayhead = () => {
    addAt(playheadInRange ? playheadAt : 0.5);
  };

  const addAtEmptySlot = () => {
    addAt(findEmptySlotAt(keyframes));
  };

  const applyPreset = (preset: PresetSpec) => {
    if (activePreset === preset.key) {
      // 再次点击当前激活预设 = 取消
      writeKeyframes([]);
      setSelectedIdx(null);
      return;
    }
    writeKeyframes(preset.generate());
    setSelectedIdx(null);
  };

  const clearAll = () => {
    writeKeyframes([]);
    setSelectedIdx(null);
  };

  // ── 时间条交互
  const handleTrackDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    addAt(clamp01(ratio));
  };

  const handleDotMouseDown = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const cur = keyframes[idx];
    if (!cur) return;
    setSelectedIdx(idx);
    setDragState({ idx, at: cur.at });
  };

  // 拖动圆点：拖动期间只更新本地 dragState（不写 store）；松开时一次性提交
  // —— 避免 effect 内的 stale closure 把 onMove 写入的最新 at 覆盖回原位
  const isDragging = dragState !== null;
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clampedPct = clampPercent(pct);
      const snapped = e.shiftKey ? clampedPct : snapPercent(clampedPct);
      const newAt = Math.max(0.001, Math.min(0.999, snapped / 100));
      setDragState((p) => (p ? { ...p, at: newAt } : null));
    };
    const onUp = () => {
      const finalDrag = dragStateRef.current;
      setDragState(null);
      if (!finalDrag) return;
      const { keyframes: kfs, clip: c, ensurePausedForEdit: pause, updateClipPayload: upd } = latestRef.current;
      const cur = kfs[finalDrag.idx];
      if (!cur) return;
      const next = [...kfs];
      next[finalDrag.idx] = { ...cur, at: finalDrag.at } as AnyKeyframe;
      const sortedKfs = sortAndSanitize(next);
      pause();
      upd(c, { keyframes: sortedKfs });
      const newIdx = sortedKfs.findIndex((f) => Math.abs(f.at - finalDrag.at) < 0.0001);
      if (newIdx >= 0) setSelectedIdx(newIdx);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // 仅依赖 "是否在拖动" 的布尔切换；最新值通过 ref 读取
  }, [isDragging]);

  // ── 渲染 ───────────────────────────────────────────

  const gridTemplateColumns = `44px repeat(${keyframes.length}, 40px)`;
  // 字段值显示格式：整数字段（step>=1）直接四舍五入，小数字段保留 2 位
  const formatFieldValue = (v: number, step: number) => step >= 1 ? Math.round(v) : Number(v.toFixed(2));

  return (
    <div className="kf-editor">
      {/* 左子列：预设 + 清空 */}
      <div className="kf-editor-actions">
        <span className="tl-col-header">预设</span>
        <div className="kf-actions-presets">
          {config.presets.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`kf-preset-btn${activePreset === p.key ? ' is-active' : ''}`}
              data-tooltip={p.tooltip}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 中子列：时间条 + 转置网格 */}
      <div className="kf-editor-data">
        <span className="tl-col-header">时间轴</span>
        <div
          ref={trackRef}
          className="kf-track"
          onDoubleClick={handleTrackDoubleClick}
          data-tooltip="双击空白处插入关键帧 · 双击圆点删除"
        >
          <div className="kf-track-axis" />
          {playheadInRange && (
            <div
              className="kf-track-playhead"
              style={{ left: `${playheadAt * 100}%` }}
            />
          )}
          {keyframes.map((kf, i) => {
            const isDragging = dragState?.idx === i;
            const renderAt = isDragging ? dragState!.at : kf.at;
            const absoluteMs = clip.startTimeMs + renderAt * clip.durationMs;
            return (
              <button
                key={`${kf.at}-${i}`}
                type="button"
                className={`kf-track-dot${selectedIdx === i ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
                style={{ left: `${renderAt * 100}%` }}
                data-tooltip={`${(renderAt * 100).toFixed(0)}% · ${(absoluteMs / 1000).toFixed(2)}s · 双击删除`}
                onMouseDown={(e) => handleDotMouseDown(i, e)}
                onClick={(e) => { e.stopPropagation(); setSelectedIdx(i); }}
                onDoubleClick={(e) => { e.stopPropagation(); removeAt(i); }}
              />
            );
          })}
          <div className="kf-track-labels">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        {keyframes.length === 0 ? (
          <div className="kf-empty">暂无关键帧 · 选左侧预设或点右侧添加按钮</div>
        ) : (
          <div className="kf-grid" style={{ gridTemplateColumns }}>
            {/* 时间行 */}
            <span className="kf-grid-label">时间％</span>
            {keyframes.map((kf, i) => (
              <input
                key={`at-${i}`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(kf.at * 100)}
                onChange={(e) => setKeyframeField(i, 'at', e.target.value)}
                onClick={(e) => { e.stopPropagation(); setSelectedIdx(i); }}
                className={`kf-grid-input${selectedIdx === i ? ' is-selected' : ''}`}
              />
            ))}
            {/* 字段行 */}
            {config.fields.map((f) => (
              <Fragment key={f.key}>
                <span className="kf-grid-label">{f.label}</span>
                {keyframes.map((kf, i) => (
                  <input
                    key={`${f.key}-${i}`}
                    type="number"
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    value={formatFieldValue((kf as unknown as Record<string, number>)[f.key] ?? 0, f.step)}
                    onChange={(e) => setKeyframeField(i, f.key, e.target.value)}
                    onClick={(e) => { e.stopPropagation(); setSelectedIdx(i); }}
                    className={`kf-grid-input${selectedIdx === i ? ' is-selected' : ''}`}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* 右子列：添加按钮（垂直）+ 清空 */}
      <div className="kf-editor-add">
        <span className="tl-col-header">自定义</span>
        <button
          type="button"
          className="kf-add-btn"
          onClick={addAtPlayhead}
          disabled={isAtMaxKeyframes}
          data-tooltip={
            isAtMaxKeyframes
              ? `关键帧已达上限（${MAX_KEYFRAMES} 个），删除后再添加`
              : (playheadInRange ? '在播放头位置插入关键帧' : '播放头不在 clip 范围，将在中点添加')
          }
        >
          在当前时刻添加
        </button>
        <button
          type="button"
          className="kf-add-btn"
          onClick={addAtEmptySlot}
          disabled={isAtMaxKeyframes}
          data-tooltip={
            isAtMaxKeyframes
              ? `关键帧已达上限（${MAX_KEYFRAMES} 个），删除后再添加`
              : '在现有关键帧之间最大空隙的中点插入'
          }
        >
          在最大空位添加
        </button>
        <button
          type="button"
          className="kf-add-btn kf-clear-btn"
          onClick={clearAll}
          disabled={keyframes.length === 0}
          data-tooltip="清空所有关键帧，回到纯起止过渡"
        >
          清空
        </button>
      </div>
    </div>
  );
}
