import React, { useState, useRef, useEffect } from "react";
import { useEditorStore } from "../../state/editorStore";
import type { AnimationClip, StateChangeClip } from "../../types";
import { LayerPanel } from "./LayerPanel";
import "./InspectorPanel.css";

const svgModules = import.meta.glob<{ default: string }>('/src/assets/svgs/**/*.svg', { eager: true });
const allSvgOptions = Object.entries(svgModules).map(([path, mod]) => {
  const parts = path.split('/');
  return { url: mod.default, name: parts[parts.length - 1].replace('.svg', ''), category: parts[4] || '未分类' };
});
const allSvgCategories = Array.from(new Set(allSvgOptions.map((o) => o.category))).sort();

const STATE_NAME_MAX_UNITS = 14;
const getStateNameUnitWidth = (char: string) => {
  const codePoint = char.codePointAt(0) ?? 0;
  return codePoint <= 0x7f ? 1 : 2;
};
const trimStateNameToUnits = (name: string, maxUnits: number) => {
  let usedUnits = 0;
  let result = '';
  for (const char of Array.from(name.trim())) {
    const charUnits = getStateNameUnitWidth(char);
    if (usedUnits + charUnits > maxUnits) break;
    result += char;
    usedUnits += charUnits;
  }
  return result;
};
const trimStateName = (name: string) => trimStateNameToUnits(name, STATE_NAME_MAX_UNITS);
const buildUniqueStateName = (name: string, existingKeys: string[]) => {
  const base = trimStateName(name) || '状态';
  if (!existingKeys.includes(base)) return base;
  let suffix = 1;
  while (true) {
    const suffixText = `_${suffix}`;
    const basePart = trimStateNameToUnits(base, STATE_NAME_MAX_UNITS - suffixText.length) || '状';
    const candidate = `${basePart}${suffixText}`;
    if (!existingKeys.includes(candidate)) return candidate;
    suffix += 1;
  }
};


export function InspectorPanel() {
  type BasicParamField = "x" | "y" | "width" | "height" | "rotation";

  const [activeTab, setActiveTab] = useState<"properties" | "layers">(
    "properties",
  );
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const [basicParamDrafts, setBasicParamDrafts] = useState<
    Partial<Record<BasicParamField, string>>
  >({});
  const basicParamCancelledRef = useRef<BasicParamField | null>(null);
  const [msParamDrafts, setMsParamDrafts] = useState<{ w?: string; h?: string; rot?: string }>({});
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [statePickerCategory, setStatePickerCategory] = useState<string | null>(null);
  const [stateSearchQuery, setStateSearchQuery] = useState('');
  const [editingStateKey, setEditingStateKey] = useState<string | null>(null);
  const [editingStateName, setEditingStateName] = useState('');
  const statePickerContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!statePickerOpen && !stateSearchQuery.trim()) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (statePickerContainerRef.current && !statePickerContainerRef.current.contains(e.target as Node)) {
        setStatePickerOpen(false);
        setStateSearchQuery('');
        setStatePickerCategory(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [statePickerOpen, stateSearchQuery]);
  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const sectionChevron = (key: string) => (
    <span
      className={`ip-section-chevron${collapsedSections[key] ? " is-collapsed" : ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  );

  const isRatioLocked = useEditorStore((state) => state.isRatioLocked);
  const setIsRatioLocked = useEditorStore((state) => state.setIsRatioLocked);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const objects = useEditorStore((state) => state.objects);
  const updateSceneObject = useEditorStore((state) => state.updateSceneObject);
  const updateSceneObjectSilent = useEditorStore((state) => state.updateSceneObjectSilent);
  const batchUpdateSceneObjectsSilent = useEditorStore((state) => state.batchUpdateSceneObjectsSilent);
  const animations = useEditorStore((state) => state.animations);
  const batchUpdateAnimationClips = useEditorStore((state) => state.batchUpdateAnimationClips);
  const removeAnimationClips = useEditorStore((state) => state.removeAnimationClips);

  const moveObjectForward = useEditorStore((state) => state.moveObjectForward);
  const moveObjectBackward = useEditorStore(
    (state) => state.moveObjectBackward,
  );
  const moveObjectToFront = useEditorStore((state) => state.moveObjectToFront);
  const moveObjectToBack = useEditorStore((state) => state.moveObjectToBack);

  const canvasWidth = useEditorStore((state) => state.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.canvasHeight);
  const duplicateObject = useEditorStore((state) => state.duplicateObject);
  const removeSceneObject = useEditorStore((state) => state.removeSceneObject);
  const moveMultipleSceneObjects = useEditorStore(
    (state) => state.moveMultipleSceneObjects,
  );
  const removeSceneObjects = useEditorStore(
    (state) => state.removeSceneObjects,
  );
  const toggleObjectLock = useEditorStore((state) => state.toggleObjectLock);
  const groupObjects = useEditorStore((state) => state.groupObjects);
  const ungroupObjects = useEditorStore((state) => state.ungroupObjects);
  const groupEditingId = useEditorStore((state) => state.groupEditingId);
  const batchUpdateSceneObjects = useEditorStore((state) => state.batchUpdateSceneObjects);
  const moveMultipleObjectsToFront = useEditorStore((state) => state.moveMultipleObjectsToFront);
  const moveMultipleObjectsToBack = useEditorStore((state) => state.moveMultipleObjectsToBack);
  const moveMultipleObjectsForward = useEditorStore((state) => state.moveMultipleObjectsForward);
  const moveMultipleObjectsBackward = useEditorStore((state) => state.moveMultipleObjectsBackward);
  const flipSceneObject = useEditorStore((state) => state.flipSceneObject);
  const flipMultipleSceneObjects = useEditorStore((state) => state.flipMultipleSceneObjects);
  const axisFlipSceneObject = useEditorStore((state) => state.axisFlipSceneObject);
  const axisFlipMultipleSceneObjects = useEditorStore((state) => state.axisFlipMultipleSceneObjects);
  const centerFlipSceneObject = useEditorStore((state) => state.centerFlipSceneObject);
  const centerFlipMultipleSceneObjects = useEditorStore((state) => state.centerFlipMultipleSceneObjects);

  const selectedObj =
    selectedIds.length === 1 || groupEditingId
      ? objects.find((o) => o.id === (groupEditingId ?? selectedIds[0]))
      : null;

  useEffect(() => {
    setBasicParamDrafts({});
  }, [selectedObj?.id]);
  const selectedIdsKey = selectedIds.join(',');
  useEffect(() => {
    setMsParamDrafts({});
  }, [selectedIdsKey]);

  // ── 多选对齐逻辑 ─────────────────────────────────────────────
  const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));

  const getBox = (o: (typeof objects)[0]) => {
    const w = o.width * (o.scaleX ?? 1);
    const h = o.height * (o.scaleY ?? 1);
    return {
      left: o.x - w / 2,
      right: o.x + w / 2,
      top: o.y - h / 2,
      bottom: o.y + h / 2,
      cx: o.x,
      cy: o.y,
      w,
      h,
    };
  };

  // edge: 'left'|'right'|'cx' for X axis, 'top'|'bottom'|'cy' for Y axis
  const alignToEdge = (
    edgeX: "left" | "right" | "cx" | null,
    edgeY: "top" | "bottom" | "cy" | null,
  ) => {
    const boxes = selectedObjects.map((o) => ({
      id: o.id,
      obj: o,
      box: getBox(o),
    }));
    let refX: number | null = null;
    let refY: number | null = null;
    if (edgeX) {
      const vals = boxes.map(({ box }) =>
        edgeX === "left" ? box.left : edgeX === "right" ? box.right : box.cx,
      );
      if (edgeX === "left") refX = Math.min(...vals);
      else if (edgeX === "right") refX = Math.max(...vals);
      else refX = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    if (edgeY) {
      const vals = boxes.map(({ box }) =>
        edgeY === "top" ? box.top : edgeY === "bottom" ? box.bottom : box.cy,
      );
      if (edgeY === "top") refY = Math.min(...vals);
      else if (edgeY === "bottom") refY = Math.max(...vals);
      else refY = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    moveMultipleSceneObjects(
      boxes.map(({ id, obj, box }) => ({
        id,
        x:
          refX !== null
            ? edgeX === "left"
              ? refX + box.w / 2
              : edgeX === "right"
                ? refX - box.w / 2
                : refX
            : obj.x,
        y:
          refY !== null
            ? edgeY === "top"
              ? refY + box.h / 2
              : edgeY === "bottom"
                ? refY - box.h / 2
                : refY
            : obj.y,
      })),
    );
  };

  const distributeH = () => {
    if (selectedObjects.length < 3) return;
    const sorted = [...selectedObjects].sort((a, b) => a.x - b.x);
    const first = sorted[0].x,
      last = sorted[sorted.length - 1].x;
    const step = (last - first) / (sorted.length - 1);
    moveMultipleSceneObjects(
      sorted.map((o, i) => ({ id: o.id, x: first + i * step, y: o.y })),
    );
  };

  const distributeV = () => {
    if (selectedObjects.length < 3) return;
    const sorted = [...selectedObjects].sort((a, b) => a.y - b.y);
    const first = sorted[0].y,
      last = sorted[sorted.length - 1].y;
    const step = (last - first) / (sorted.length - 1);
    moveMultipleSceneObjects(
      sorted.map((o, i) => ({ id: o.id, x: o.x, y: first + i * step })),
    );
  };
  const basicNamedTypes = [
    "rect",
    "circle",
    "triangle",
    "trapezoid",
    "line",
    "arrow",
    "curve",
  ];

  if (!selectedObj) {
    // 多选时显示对齐面板
    if (selectedIds.length > 1) {
      const groupIds = selectedObjects.map((o) => o.groupId).filter(Boolean) as string[];
      const uniqueGroups = Array.from(new Set(groupIds));
      const allSameGroup = uniqueGroups.length === 1 && groupIds.length === selectedObjects.length;
      const abStyle: React.CSSProperties = {
        flex: 1, height: 24, padding: 0,
        border: "1px solid var(--border-color)", background: "transparent",
        borderRadius: 6, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      };
      const abHoverOn = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.borderColor = "var(--primary-color)";
        e.currentTarget.style.background = "rgba(59,130,246,0.05)";
      };
      const abHoverOff = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.borderColor = "var(--border-color)";
        e.currentTarget.style.background = "transparent";
      };
      return (
        <aside className="ip-inspector-panel">
          <InspectorTabHeader activeTab={activeTab} onTabChange={setActiveTab} />
          {activeTab === "layers" ? (
            <LayerPanel />
          ) : (
            <div className="ip-inspector-content">

              {/* 基础参数 */}
              {(() => {
                const refObj = [...selectedObjects].sort((a, b) => (a.x + a.y) - (b.x + b.y))[0];
                const refW = Math.round(refObj.width * (refObj.scaleX ?? 1));
                const refH = Math.round(refObj.height * (refObj.scaleY ?? 1));
                const refRot = Math.round(refObj.rotation || 0);

                const wVal = msParamDrafts.w ?? String(refW);
                const hVal = msParamDrafts.h ?? String(refH);
                const rotVal = msParamDrafts.rot ?? String(refRot);

                const applyW = (num: number) => {
                  batchUpdateSceneObjects(selectedObjects.filter(o => !o.locked).map(o => {
                    const sx = o.width ? num / o.width : 1;
                    return { id: o.id, patch: { scaleX: sx, ...(isRatioLocked ? { scaleY: sx } : {}) } };
                  }));
                  if (isRatioLocked) setMsParamDrafts(prev => ({ ...prev, h: undefined }));
                };
                const applyH = (num: number) => {
                  batchUpdateSceneObjects(selectedObjects.filter(o => !o.locked).map(o => {
                    const sy = o.height ? num / o.height : 1;
                    return { id: o.id, patch: { scaleY: sy, ...(isRatioLocked ? { scaleX: sy } : {}) } };
                  }));
                  if (isRatioLocked) setMsParamDrafts(prev => ({ ...prev, w: undefined }));
                };
                const applyRot = (num: number) => {
                  batchUpdateSceneObjects(selectedObjects.filter(o => !o.locked).map(o => ({ id: o.id, patch: { rotation: num } })));
                };
                const batchReset = () => {
                  batchUpdateSceneObjects(selectedObjects.filter(o => !o.locked).map(o => ({ id: o.id, patch: { scaleX: 1, scaleY: 1, rotation: 0 } })));
                  setMsParamDrafts({});
                };

                const inputStyle: React.CSSProperties = { padding: "3px 4px", height: "24px" };
                const layerBtnStyle: React.CSSProperties = {
                  flex: 1, padding: "4px", backgroundColor: "var(--bg-color)",
                  border: "1px solid var(--border-color)", borderRadius: "6px",
                  cursor: "pointer", color: "var(--text-main)",
                  display: "flex", alignItems: "center", justifyContent: "center", height: "24px",
                };

                return (
                  <div className="ip-property-group">
                    <h4
                      className={`ip-group-title${collapsedSections["ms-params"] ? " is-collapsed" : ""}`}
                      onClick={() => toggleSection("ms-params")}
                    >
                      基础参数
                      {sectionChevron("ms-params")}
                    </h4>
                    {!collapsedSections["ms-params"] && (<>
                      {/* 宽 / 高 */}
                      <div className="ip-property-field" style={{ marginBottom: "8px", flexDirection: "row", alignItems: "center" }}>
                        <label style={{ width: "70px", flexShrink: 0, marginBottom: 0, fontSize: "13px" }}>宽/高(px)：</label>
                        <div style={{ display: "flex", gap: "8px", flex: 1, alignItems: "center", minWidth: 0 }}>
                          <div className="ip-input-group" style={{ flex: 1, minWidth: 0 }}>
                            <input className="ip-input-nospin" type="number" inputMode="numeric" min={1} step={1}
                              value={wVal}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                                setMsParamDrafts(prev => ({ ...prev, w: digits }));
                                const num = parseInt(digits, 10);
                                if (!isNaN(num) && num >= 1) applyW(num);
                              }}
                              onBlur={() => setMsParamDrafts(prev => ({ ...prev, w: undefined }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              onFocus={(e) => e.target.select()}
                              style={inputStyle}
                            />
                          </div>
                          <div className="ip-input-group" style={{ flex: 1, minWidth: 0 }}>
                            <input className="ip-input-nospin" type="number" inputMode="numeric" min={1} step={1}
                              value={hVal}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                                setMsParamDrafts(prev => ({ ...prev, h: digits }));
                                const num = parseInt(digits, 10);
                                if (!isNaN(num) && num >= 1) applyH(num);
                              }}
                              onBlur={() => setMsParamDrafts(prev => ({ ...prev, h: undefined }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              onFocus={(e) => e.target.select()}
                              style={inputStyle}
                            />
                          </div>
                          <button
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "0", width: "28px", flexShrink: 0, fontSize: "1rem", display: "flex", justifyContent: "center", alignItems: "center", color: isRatioLocked ? "var(--primary-color)" : "var(--text-muted)" }}
                            onClick={() => setIsRatioLocked(!isRatioLocked)}
                            data-tooltip={isRatioLocked ? "解锁宽高比" : "锁定宽高比"}
                          >
                            {isRatioLocked ? "🔒" : "🔓"}
                          </button>
                        </div>
                      </div>
                      {/* 旋转角度 */}
                      <div className="ip-property-field" style={{ marginBottom: "8px", flexDirection: "row", alignItems: "center" }}>
                        <label style={{ width: "70px", flexShrink: 0, marginBottom: 0, fontSize: "13px" }}>旋转角度：</label>
                        <div style={{ display: "flex", gap: "8px", flex: 1, alignItems: "center", minWidth: 0 }}>
                          <div className="ip-input-group" style={{ flex: 1, minWidth: 0 }}>
                            <input className="ip-input-nospin" type="number" inputMode="numeric" step={1}
                              value={rotVal}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const sign = raw.startsWith('-') ? '-' : '';
                                const digits = raw.replace(/[^0-9]/g, '').slice(0, 5);
                                const cleaned = `${sign}${digits}`;
                                setMsParamDrafts(prev => ({ ...prev, rot: cleaned }));
                                if (cleaned === '' || cleaned === '-') return;
                                const num = parseInt(cleaned, 10);
                                if (!isNaN(num)) applyRot(num);
                              }}
                              onBlur={() => setMsParamDrafts(prev => ({ ...prev, rot: undefined }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              onFocus={(e) => e.target.select()}
                              style={inputStyle}
                            />
                          </div>
                          <button
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "0", width: "28px", flexShrink: 0, fontSize: "1.1rem", display: "flex", justifyContent: "center", alignItems: "center", color: "var(--text-main)", opacity: 0.8 }}
                            onClick={batchReset}
                            data-tooltip="重置尺寸与角度"
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
                          >
                            🔄
                          </button>
                        </div>
                      </div>
                      {/* 图层顺序 */}
                      <div className="ip-property-field" style={{ marginBottom: "8px", flexDirection: "row", alignItems: "center" }}>
                        <label style={{ width: "70px", flexShrink: 0, marginBottom: 0, fontSize: "13px" }}>图层顺序：</label>
                        <div style={{ display: "flex", gap: "8px", flex: 1, justifyContent: "space-between" }}>
                          {[
                            { tooltip: "置底", onClick: () => moveMultipleObjectsToBack(selectedIds), icon: <><line x1="12" y1="3" x2="12" y2="17"/><polyline points="19 10 12 17 5 10"/><line x1="4" y1="21" x2="20" y2="21"/></> },
                            { tooltip: "下移一层", onClick: () => moveMultipleObjectsBackward(selectedIds), icon: <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></> },
                            { tooltip: "上移一层", onClick: () => moveMultipleObjectsForward(selectedIds), icon: <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></> },
                            { tooltip: "置顶", onClick: () => moveMultipleObjectsToFront(selectedIds), icon: <><line x1="12" y1="21" x2="12" y2="7"/><polyline points="5 14 12 7 19 14"/><line x1="4" y1="3" x2="20" y2="3"/></> },
                          ].map((b, i) => (
                            <button key={i} style={layerBtnStyle} data-tooltip={b.tooltip} onClick={b.onClick}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{b.icon}</svg>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>)}
                  </div>
                );
              })()}

              {/* 基础操作 */}
              <div className="ip-property-group">
                <h4
                  className={`ip-group-title${collapsedSections["ms-ops"] ? " is-collapsed" : ""}`}
                  onClick={() => toggleSection("ms-ops")}
                >
                  基础操作
                  {sectionChevron("ms-ops")}
                </h4>
                {!collapsedSections["ms-ops"] && (<>
                  <div className="ip-property-row" style={{ gap: 4 }}>
                    <button
                      data-tooltip="将选中对象组合为一个分组 (Ctrl+G)"
                      disabled={allSameGroup}
                      onClick={() => groupObjects(selectedIds)}
                      style={{
                        flex: 1, height: 24, borderRadius: 6, cursor: allSameGroup ? "not-allowed" : "pointer", fontSize: 13,
                        border: "1px solid var(--border-color)", background: "transparent",
                        color: "var(--text-muted)", opacity: allSameGroup ? 0.4 : 1,
                      }}
                    >
                      组合
                    </button>
                    <button
                      data-tooltip="解散分组，恢复为独立对象 (Ctrl+Shift+G)"
                      disabled={!allSameGroup}
                      onClick={() => ungroupObjects(uniqueGroups[0])}
                      style={{
                        flex: 1, height: 24, borderRadius: 6, cursor: allSameGroup ? "pointer" : "not-allowed", fontSize: 13,
                        border: allSameGroup ? "1px solid var(--primary-color)" : "1px solid var(--border-color)",
                        background: allSameGroup ? "rgba(59,130,246,0.08)" : "transparent",
                        color: allSameGroup ? "var(--primary-color)" : "var(--text-muted)",
                        opacity: allSameGroup ? 1 : 0.4,
                      }}
                    >
                      解组
                    </button>
                    <button
                      data-tooltip="删除所有选中对象 (Delete)"
                      onClick={() => removeSceneObjects(selectedIds)}
                      style={{
                        flex: 1, height: 24, borderRadius: 6, cursor: "pointer", fontSize: 13,
                        border: "1px solid rgba(239,68,68,0.4)", background: "transparent", color: "#ef4444",
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                      删除
                    </button>
                  </div>
                  <div className="ip-property-row" style={{ gap: 4, marginTop: 4 }}>
                    <button
                      data-tooltip="以各元素自身纵轴为对称轴，原地左右镜像"
                      onClick={() => axisFlipMultipleSceneObjects(selectedIds, 'x')}
                      style={{
                        flex: 1, height: 24, borderRadius: 6, fontSize: 13,
                        border: "1px solid var(--border-color)", background: "transparent",
                        color: "var(--text-muted)", cursor: "pointer",
                      }}
                    >
                      纵轴对称
                    </button>
                    <button
                      data-tooltip="以各元素自身横轴为对称轴，原地上下镜像"
                      onClick={() => axisFlipMultipleSceneObjects(selectedIds, 'y')}
                      style={{
                        flex: 1, height: 24, borderRadius: 6, fontSize: 13,
                        border: "1px solid var(--border-color)", background: "transparent",
                        color: "var(--text-muted)", cursor: "pointer",
                      }}
                    >
                      横轴对称
                    </button>
                    <button
                      data-tooltip="以各元素自身几何中心为对称中心，原地旋转180°"
                      onClick={() => centerFlipMultipleSceneObjects(selectedIds)}
                      style={{
                        flex: 1, height: 24, borderRadius: 6, fontSize: 13,
                        border: "1px solid var(--border-color)", background: "transparent",
                        color: "var(--text-muted)", cursor: "pointer",
                      }}
                    >
                      中心对称
                    </button>
                  </div>
                  <div className="ip-property-row" style={{ gap: 4, marginTop: 4 }}>
                    <button
                      data-tooltip="以画布垂直中线为轴水平翻转所有选中对象"
                      onClick={() => flipMultipleSceneObjects(selectedIds, 'x')}
                      style={{
                        flex: '0 0 calc((100% - 8px) / 3)', height: 24, borderRadius: 6, fontSize: 13,
                        border: "1px solid var(--border-color)", background: "transparent",
                        color: "var(--text-muted)", cursor: "pointer",
                      }}
                    >
                      水平翻转
                    </button>
                    <button
                      data-tooltip="以画布水平中线为轴垂直翻转所有选中对象"
                      onClick={() => flipMultipleSceneObjects(selectedIds, 'y')}
                      style={{
                        flex: '0 0 calc((100% - 8px) / 3)', height: 24, borderRadius: 6, fontSize: 13,
                        border: "1px solid var(--border-color)", background: "transparent",
                        color: "var(--text-muted)", cursor: "pointer",
                      }}
                    >
                      垂直翻转
                    </button>
                  </div>
                </>)}
              </div>

              {/* 组内对齐 */}
              <div className="ip-property-group">
                <h4
                  className={`ip-group-title${collapsedSections["ms-align-self"] ? " is-collapsed" : ""}`}
                  onClick={() => toggleSection("ms-align-self")}
                >
                  组内对齐
                  {sectionChevron("ms-align-self")}
                </h4>
                {!collapsedSections["ms-align-self"] && (
                  <>
                    <div className="ip-property-row" style={{ gap: 8, marginBottom: 8 }}>
                      {[
                        { tooltip: "组内对象左边缘对齐", onClick: () => alignToEdge("left", null), icon: <><rect x="0" y="0" width="2" height="14" fill="var(--primary-color)"/><rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6"/><rect x="2" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35"/></> },
                        { tooltip: "组内对象水平居中对齐", onClick: () => alignToEdge("cx", null), icon: <><rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6"/><rect x="4" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35"/><rect x="6" y="0" width="2" height="14" fill="var(--primary-color)"/></> },
                        { tooltip: "组内对象右边缘对齐", onClick: () => alignToEdge("right", null), icon: <><rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6"/><rect x="6" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35"/><rect x="12" y="0" width="2" height="14" fill="var(--primary-color)"/></> },
                      ].map((b, i) => (
                        <button key={i} style={abStyle} data-tooltip={b.tooltip} onMouseEnter={abHoverOn} onMouseLeave={abHoverOff} onClick={b.onClick}>
                          <svg viewBox="0 0 14 14" width="14" height="14">{b.icon}</svg>
                        </button>
                      ))}
                    </div>
                    <div className="ip-property-row" style={{ gap: 8, marginBottom: selectedIds.length >= 3 ? 8 : 0 }}>
                      {[
                        { tooltip: "组内对象顶边缘对齐", onClick: () => alignToEdge(null, "top"), icon: <><rect x="0" y="0" width="14" height="2" fill="var(--primary-color)"/><rect x="2" y="2" width="3" height="10" fill="var(--primary-color)" opacity="0.6"/><rect x="8" y="2" width="3" height="6" fill="var(--primary-color)" opacity="0.35"/></> },
                        { tooltip: "组内对象垂直居中对齐", onClick: () => alignToEdge(null, "cy"), icon: <><rect x="2" y="2" width="3" height="10" fill="var(--primary-color)" opacity="0.6"/><rect x="8" y="4" width="3" height="6" fill="var(--primary-color)" opacity="0.35"/><rect x="0" y="6" width="14" height="2" fill="var(--primary-color)"/></> },
                        { tooltip: "组内对象底边缘对齐", onClick: () => alignToEdge(null, "bottom"), icon: <><rect x="2" y="1" width="3" height="11" fill="var(--primary-color)" opacity="0.6"/><rect x="8" y="5" width="3" height="7" fill="var(--primary-color)" opacity="0.35"/><rect x="0" y="12" width="14" height="2" fill="var(--primary-color)"/></> },
                      ].map((b, i) => (
                        <button key={i} style={abStyle} data-tooltip={b.tooltip} onMouseEnter={abHoverOn} onMouseLeave={abHoverOff} onClick={b.onClick}>
                          <svg viewBox="0 0 14 14" width="14" height="14">{b.icon}</svg>
                        </button>
                      ))}
                    </div>
                    {selectedIds.length >= 3 && (
                      <div className="ip-property-row" style={{ gap: 8 }}>
                        {[
                          { tooltip: "组内对象水平等间距分布", onClick: distributeH, icon: <><rect x="0" y="0" width="1" height="14" fill="var(--primary-color)" opacity="0.4"/><rect x="13" y="0" width="1" height="14" fill="var(--primary-color)" opacity="0.4"/><rect x="3" y="3" width="3" height="8" fill="var(--primary-color)" opacity="0.6"/><rect x="8" y="3" width="3" height="8" fill="var(--primary-color)" opacity="0.6"/></> },
                          { tooltip: "组内对象垂直等间距分布", onClick: distributeV, icon: <><rect x="0" y="0" width="14" height="1" fill="var(--primary-color)" opacity="0.4"/><rect x="0" y="13" width="14" height="1" fill="var(--primary-color)" opacity="0.4"/><rect x="3" y="3" width="8" height="3" fill="var(--primary-color)" opacity="0.6"/><rect x="3" y="8" width="8" height="3" fill="var(--primary-color)" opacity="0.6"/></> },
                        ].map((b, i) => (
                          <button key={i} style={abStyle} data-tooltip={b.tooltip} onMouseEnter={abHoverOn} onMouseLeave={abHoverOff} onClick={b.onClick}>
                            <svg viewBox="0 0 14 14" width="14" height="14">{b.icon}</svg>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 画布对齐 */}
              <div className="ip-property-group">
                <h4
                  className={`ip-group-title${collapsedSections["ms-align-canvas"] ? " is-collapsed" : ""}`}
                  onClick={() => toggleSection("ms-align-canvas")}
                >
                  画布对齐
                  {sectionChevron("ms-align-canvas")}
                </h4>
                {!collapsedSections["ms-align-canvas"] && (
                  <>
                    <div className="ip-property-row" style={{ gap: 8, marginBottom: 8 }}>
                      {[
                        { tooltip: "所有对象左边缘贴画布左边", onClick: () => moveMultipleSceneObjects(selectedObjects.map((o) => { const w = o.width*(o.scaleX??1); return { id: o.id, x: w/2, y: o.y }; })), icon: <><rect x="0" y="0" width="2" height="14" fill="var(--primary-color)"/><rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6"/><rect x="2" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35"/></> },
                        { tooltip: "所有对象水平居中于画布", onClick: () => moveMultipleSceneObjects(selectedObjects.map((o) => ({ id: o.id, x: canvasWidth/2, y: o.y }))), icon: <><rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6"/><rect x="4" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35"/><rect x="6" y="0" width="2" height="14" fill="var(--primary-color)"/></> },
                        { tooltip: "所有对象右边缘贴画布右边", onClick: () => moveMultipleSceneObjects(selectedObjects.map((o) => { const w = o.width*(o.scaleX??1); return { id: o.id, x: canvasWidth-w/2, y: o.y }; })), icon: <><rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6"/><rect x="6" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35"/><rect x="12" y="0" width="2" height="14" fill="var(--primary-color)"/></> },
                      ].map((b, i) => (
                        <button key={i} style={abStyle} data-tooltip={b.tooltip} onMouseEnter={abHoverOn} onMouseLeave={abHoverOff} onClick={b.onClick}>
                          <svg viewBox="0 0 14 14" width="14" height="14">{b.icon}</svg>
                        </button>
                      ))}
                    </div>
                    <div className="ip-property-row" style={{ gap: 8 }}>
                      {[
                        { tooltip: "所有对象顶边缘贴画布顶部", onClick: () => moveMultipleSceneObjects(selectedObjects.map((o) => { const h = o.height*(o.scaleY??1); return { id: o.id, x: o.x, y: h/2 }; })), icon: <><rect x="0" y="0" width="14" height="2" fill="var(--primary-color)"/><rect x="2" y="2" width="3" height="10" fill="var(--primary-color)" opacity="0.6"/><rect x="8" y="2" width="3" height="6" fill="var(--primary-color)" opacity="0.35"/></> },
                        { tooltip: "所有对象垂直居中于画布", onClick: () => moveMultipleSceneObjects(selectedObjects.map((o) => ({ id: o.id, x: o.x, y: canvasHeight/2 }))), icon: <><rect x="2" y="2" width="3" height="10" fill="var(--primary-color)" opacity="0.6"/><rect x="8" y="4" width="3" height="6" fill="var(--primary-color)" opacity="0.35"/><rect x="0" y="6" width="14" height="2" fill="var(--primary-color)"/></> },
                        { tooltip: "所有对象底边缘贴画布底部", onClick: () => moveMultipleSceneObjects(selectedObjects.map((o) => { const h = o.height*(o.scaleY??1); return { id: o.id, x: o.x, y: canvasHeight-h/2 }; })), icon: <><rect x="2" y="1" width="3" height="11" fill="var(--primary-color)" opacity="0.6"/><rect x="8" y="5" width="3" height="7" fill="var(--primary-color)" opacity="0.35"/><rect x="0" y="12" width="14" height="2" fill="var(--primary-color)"/></> },
                      ].map((b, i) => (
                        <button key={i} style={abStyle} data-tooltip={b.tooltip} onMouseEnter={abHoverOn} onMouseLeave={abHoverOff} onClick={b.onClick}>
                          <svg viewBox="0 0 14 14" width="14" height="14">{b.icon}</svg>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 文字设置（批量应用）*/}
              {(() => {
                const refObj = [...selectedObjects].sort((a, b) => (a.x + a.y) - (b.x + b.y))[0];
                const refTextColor = (refObj.type === 'text' || refObj.type === 'material')
                  ? refObj.style?.fill || '#000000'
                  : refObj.style?.textColor || '#334155';
                const batchTextColorChange = (val: string) => {
                  batchUpdateSceneObjects(selectedObjects.filter(o => !o.locked).map(o => ({
                    id: o.id,
                    patch: { style: { ...(o.style || {}), ...((o.type === 'text' || o.type === 'material') ? { fill: val } : { textColor: val }) } },
                  })));
                };
                const batchTextColorChangeSilent = (val: string) => {
                  batchUpdateSceneObjectsSilent(selectedObjects.filter(o => !o.locked).map(o => ({
                    id: o.id,
                    patch: { style: { ...(o.style || {}), ...((o.type === 'text' || o.type === 'material') ? { fill: val } : { textColor: val }) } },
                  })));
                };
                const batchStyleChange = (field: string, val: string | number) => {
                  batchUpdateSceneObjects(selectedObjects.filter(o => !o.locked).map(o => ({
                    id: o.id,
                    patch: { style: { ...(o.style || {}), [field]: val } },
                  })));
                };
                return (
                  <div className="ip-property-group">
                    <h4
                      className={`ip-group-title${collapsedSections["ms-text"] ? " is-collapsed" : ""}`}
                      onClick={() => toggleSection("ms-text")}
                    >
                      文字设置
                      {sectionChevron("ms-text")}
                    </h4>
                    {!collapsedSections["ms-text"] && (
                      <>
                        {/* 文字颜色 | 字体大小 */}
                        <div className="ip-property-field" style={{ flexDirection: "row", gap: "8px", marginBottom: "8px" }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                            <label style={{ marginBottom: 0, fontSize: "13px", whiteSpace: "nowrap", width: "65px", flexShrink: 0 }}>文字颜色：</label>
                            <div className="ip-input-group" style={{ width: "45px" }}>
                              <input type="color" value={refTextColor}
                                onChange={(e) => batchTextColorChangeSilent(e.target.value)}
                                onBlur={(e) => batchTextColorChange(e.target.value)}
                                style={{ width: "100%", height: "24px", padding: 0, cursor: "pointer", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", backgroundColor: "white" }}
                              />
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <label style={{ marginBottom: 0, fontSize: "13px", whiteSpace: "nowrap", width: "65px", flexShrink: 0 }}>字体大小：</label>
                            <div className="ip-input-group" style={{ width: "45px" }}>
                              <input type="number" min="5" max="120"
                                value={refObj.style?.fontSize || 14}
                                onChange={(e) => {
                                  let val = parseInt(e.target.value);
                                  if (isNaN(val)) val = 5;
                                  if (val < 5) val = 5;
                                  if (val > 120) val = 120;
                                  batchStyleChange("fontSize", val);
                                }}
                                style={{ textAlign: "center", padding: "3px 4px", height: "24px" }}
                              />
                            </div>
                          </div>
                        </div>
                        {/* 对齐方式 */}
                        <div className="ip-property-field" style={{ flexDirection: "row", gap: "28px", marginBottom: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                            <label style={{ marginBottom: 0, fontSize: "13px", whiteSpace: "nowrap", width: "65px", flexShrink: 0 }}>对齐方式：</label>
                            <div style={{ display: "flex", flex: 1, gap: "1px", backgroundColor: "rgba(0,0,0,0.05)", padding: "2px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                              {[
                                { id: "left", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg> },
                                { id: "center", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg> },
                                { id: "right", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg> },
                              ].map((btn) => (
                                <button key={btn.id} onClick={() => batchStyleChange("textAlign", btn.id)}
                                  style={{ flex: 1, height: "20px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", backgroundColor: (refObj.style?.textAlign || "center") === btn.id ? "white" : "transparent", color: (refObj.style?.textAlign || "center") === btn.id ? "var(--primary-color)" : "var(--text-muted)", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s" }}
                                >{btn.icon}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                        {/* 文字方向 */}
                        <div className="ip-property-field" style={{ flexDirection: "row", gap: "28px", marginBottom: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                            <label style={{ marginBottom: 0, fontSize: "13px", whiteSpace: "nowrap", width: "65px", flexShrink: 0 }}>文字方向：</label>
                            <div style={{ display: "flex", flex: 1, gap: "1px", backgroundColor: "rgba(0,0,0,0.05)", padding: "2px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                              {[{ id: "horizontal", label: "横排" }, { id: "vertical", label: "纵排" }].map((btn) => (
                                <button key={btn.id} onClick={() => batchStyleChange("textDirection", btn.id)}
                                  style={{ flex: 1, height: "20px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", backgroundColor: (refObj.style?.textDirection || "horizontal") === btn.id ? "white" : "transparent", color: (refObj.style?.textDirection || "horizontal") === btn.id ? "var(--primary-color)" : "var(--text-muted)", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s", fontSize: "13px" }}
                                >{btn.label}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* 样式设置（批量应用，仅对形状/路径类元素生效）*/}
              {selectedObjects.some(o => !['text', 'material'].includes(o.type)) && (() => {
                const refObj = [...selectedObjects].sort((a, b) => (a.x + a.y) - (b.x + b.y))[0];
                const shapeTypes = ['rect', 'circle', 'triangle', 'trapezoid', 'line', 'arrow', 'curve'];
                const fillTypes = ['rect', 'circle', 'triangle', 'trapezoid'];
                const refForStroke = [...selectedObjects].sort((a, b) => (a.x + a.y) - (b.x + b.y)).find(o => shapeTypes.includes(o.type)) || refObj;
                const refForFill = [...selectedObjects].sort((a, b) => (a.x + a.y) - (b.x + b.y)).find(o => fillTypes.includes(o.type));
                const batchStroke = (val: string) => batchUpdateSceneObjects(
                  selectedObjects.filter(o => !o.locked && shapeTypes.includes(o.type)).map(o => ({ id: o.id, patch: { style: { ...(o.style || {}), stroke: val } } }))
                );
                const batchStrokeSilent = (val: string) => batchUpdateSceneObjectsSilent(
                  selectedObjects.filter(o => !o.locked && shapeTypes.includes(o.type)).map(o => ({ id: o.id, patch: { style: { ...(o.style || {}), stroke: val } } }))
                );
                const batchFill = (val: string) => batchUpdateSceneObjects(
                  selectedObjects.filter(o => !o.locked && fillTypes.includes(o.type)).map(o => ({ id: o.id, patch: { style: { ...(o.style || {}), fill: val } } }))
                );
                const batchFillSilent = (val: string) => batchUpdateSceneObjectsSilent(
                  selectedObjects.filter(o => !o.locked && fillTypes.includes(o.type)).map(o => ({ id: o.id, patch: { style: { ...(o.style || {}), fill: val } } }))
                );
                const batchStrokeWidth = (val: number) => batchUpdateSceneObjects(
                  selectedObjects.filter(o => !o.locked && shapeTypes.includes(o.type)).map(o => ({ id: o.id, patch: { style: { ...(o.style || {}), strokeWidth: val } } }))
                );
                return (
                  <div className="ip-property-group">
                    <h4
                      className={`ip-group-title${collapsedSections["ms-style"] ? " is-collapsed" : ""}`}
                      onClick={() => toggleSection("ms-style")}
                    >
                      样式设置
                      {sectionChevron("ms-style")}
                    </h4>
                    {!collapsedSections["ms-style"] && (
                      <>
                        {/* 描边颜色 | 填充颜色 */}
                        <div className="ip-property-field" style={{ flexDirection: "row", gap: "8px", marginBottom: "8px" }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                            <label style={{ marginBottom: 0, fontSize: "13px", whiteSpace: "nowrap", width: "65px", flexShrink: 0 }}>描边颜色：</label>
                            <div className="ip-input-group" style={{ width: "45px" }}>
                              <input type="color" value={refForStroke.style?.stroke || '#000000'}
                                onChange={(e) => batchStrokeSilent(e.target.value)}
                                onBlur={(e) => batchStroke(e.target.value)}
                                style={{ width: "100%", height: "24px", padding: 0, cursor: "pointer", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", backgroundColor: "white" }}
                              />
                            </div>
                          </div>
                          {refForFill && (
                            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <label style={{ marginBottom: 0, fontSize: "13px", whiteSpace: "nowrap", width: "40px", flexShrink: 0 }}>填充颜色：</label>
                              <div className="ip-input-group" style={{ width: "45px" }}>
                                <input type="color" value={refForFill.style?.fill || '#000000'}
                                  onChange={(e) => batchFillSilent(e.target.value)}
                                  onBlur={(e) => batchFill(e.target.value)}
                                  style={{ width: "100%", height: "24px", padding: 0, cursor: "pointer", border: "1px solid var(--border-color)", borderRadius: "var(--radius)", backgroundColor: "white" }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        {/* 描边粗细 */}
                        <div className="ip-property-field" style={{ flexDirection: "row", gap: "8px", marginBottom: "8px" }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                            <label style={{ marginBottom: 0, fontSize: "13px", whiteSpace: "nowrap", width: "65px", flexShrink: 0 }}>描边粗细：</label>
                            <div className="ip-input-group" style={{ width: "45px" }}>
                              <input type="number" min="1" max="20" value={refForStroke.style?.strokeWidth || 1}
                                onChange={(e) => {
                                  let val = parseInt(e.target.value);
                                  if (isNaN(val)) val = 1;
                                  if (val < 1) val = 1;
                                  if (val > 20) val = 20;
                                  batchStrokeWidth(val);
                                }}
                                style={{ textAlign: "center", padding: "3px 4px", height: "24px" }}
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

            </div>
          )}
        </aside>
      );
    }

    return (
      <aside className="ip-inspector-panel">
        <InspectorTabHeader activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === "layers" ? (
          <LayerPanel />
        ) : (
          <>
            <div className="ip-inspector-content">
              <div className="ip-empty-state">
                未选中任何对象
                <span className="ip-hint">请在画板中点击对象以加载其属性</span>
              </div>
            </div>
          </>
        )}
      </aside>
    );
  }

  const handleChange = (field: string, val: string) => {
    if (selectedObj.locked) return;
    let num = parseFloat(val);
    if (isNaN(num)) num = 0;
    updateSceneObject(selectedObj.id, { [field]: num });
  };

  const formatBasicParamValue = (field: BasicParamField) => {
    if (!selectedObj) return "";

    if (field === "width") {
      return String(Math.round(selectedObj.width * (selectedObj.scaleX ?? 1)));
    }
    if (field === "height") {
      return String(Math.round(selectedObj.height * (selectedObj.scaleY ?? 1)));
    }
    if (field === "rotation") {
      return String(Math.round(selectedObj.rotation || 0));
    }
    return String(Math.round(selectedObj[field]));
  };

  const getBasicParamValue = (field: BasicParamField) =>
    basicParamDrafts[field] ?? formatBasicParamValue(field);

  const isSignedBasicParamField = (field: BasicParamField) =>
    field === "x" || field === "y" || field === "rotation";

  const sanitizeIntegerDraft = (rawValue: string, allowNegative: boolean) => {
    const sign = allowNegative && rawValue.trimStart().startsWith("-") ? "-" : "";
    const digits = rawValue.replace(/\D/g, "").slice(0, 5);
    return `${sign}${digits}`;
  };

  const updateBasicParamDraft = (field: BasicParamField, rawValue: string) => {
    if (!selectedObj) return;

    if (basicParamCancelledRef.current === field) {
      basicParamCancelledRef.current = null;
    }
    const nextValue = sanitizeIntegerDraft(rawValue, isSignedBasicParamField(field));
    setBasicParamDrafts((prev) => ({ ...prev, [field]: nextValue }));
    if (nextValue === "" || nextValue === "-") return;

    // Silent update during typing — no history entry; commitBasicParamDraft pushes history on blur/Enter
    if (field === "width" || field === "height") {
      let num = parseFloat(nextValue);
      if (isNaN(num) || num < 1) num = 1;
      if (field === "width") {
        const newScaleX = selectedObj.width ? num / selectedObj.width : 1;
        updateSceneObjectSilent(selectedObj.id, { scaleX: newScaleX, ...(isRatioLocked ? { scaleY: newScaleX } : {}) });
      } else {
        const newScaleY = selectedObj.height ? num / selectedObj.height : 1;
        updateSceneObjectSilent(selectedObj.id, { scaleY: newScaleY, ...(isRatioLocked ? { scaleX: newScaleY } : {}) });
      }
      return;
    }
    let num = parseFloat(nextValue);
    if (isNaN(num)) num = 0;
    updateSceneObjectSilent(selectedObj.id, { [field]: num });
  };

  const clearBasicParamDraft = (field: BasicParamField) => {
    setBasicParamDrafts((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const commitBasicParamDraft = (
    field: BasicParamField,
    input?: HTMLInputElement,
  ) => {
    if (!selectedObj) return;

    if (basicParamCancelledRef.current === field) {
      basicParamCancelledRef.current = null;
      clearBasicParamDraft(field);
      return;
    }

    const draft = input?.value ?? basicParamDrafts[field];
    const parsed = Number.parseInt(draft ?? "", 10);
    if (Number.isFinite(parsed)) {
      const normalized = String(
        field === "width" || field === "height" ? Math.max(1, parsed) : parsed,
      );
      if (field === "width" || field === "height") {
        handleDimensionChange(field, normalized);
      } else {
        handleChange(field, normalized);
      }
      if (input) input.value = normalized;
    }
    clearBasicParamDraft(field);
  };

  const handleBasicParamKeyDown = (
    field: BasicParamField,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (
      e.key === "e" ||
      e.key === "E" ||
      e.key === "+" ||
      e.key === "." ||
      (!isSignedBasicParamField(field) && e.key === "-")
    ) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      basicParamCancelledRef.current = field;
      clearBasicParamDraft(field);
      e.currentTarget.blur();
    }
  };

  const handleStyleChange = (field: string, val: string | number) => {
    if (selectedObj.locked) return;
    updateSceneObject(selectedObj.id, {
      style: { ...(selectedObj.style || {}), [field]: val },
    });
  };

  const handleStyleChangeSilent = (field: string, val: string | number) => {
    if (selectedObj.locked) return;
    updateSceneObjectSilent(selectedObj.id, {
      style: { ...(selectedObj.style || {}), [field]: val },
    });
  };

  const handleDataChange = (field: string, val: string | number) => {
    if (selectedObj.locked) return;
    updateSceneObject(selectedObj.id, {
      data: {
        ...(selectedObj.data || {}),
        [field]: val,
      },
    });
  };

  const handleTextDirectionChange = (direction: "horizontal" | "vertical") => {
    if (selectedObj.type !== "text") return;
    const currentDirection = selectedObj.style?.textDirection || "horizontal";
    if (currentDirection === direction) return;

    updateSceneObject(selectedObj.id, {
      width: selectedObj.height,
      height: selectedObj.width,
      style: {
        ...(selectedObj.style || {}),
        textDirection: direction,
      },
    });
  };
  const isNameDirectionTarget =
    selectedObj.type === "material" ||
    basicNamedTypes.includes(selectedObj.type);

  const handleDirectionChange = (direction: "horizontal" | "vertical") => {
    if (selectedObj.type === "text") {
      handleTextDirectionChange(direction);
      return;
    }
    if (!isNameDirectionTarget) return;
    handleStyleChange("textDirection", direction);
  };

  const handleFontSizeChange = (fontSize: number) => {
    if (selectedObj.type === "text") {
      const currentFontSize = selectedObj.style?.fontSize || 18;
      const ratio = currentFontSize > 0 ? fontSize / currentFontSize : 1;
      updateSceneObject(selectedObj.id, {
        width: Math.max(1, selectedObj.width * ratio),
        height: Math.max(1, selectedObj.height * ratio),
        style: {
          ...(selectedObj.style || {}),
          fontSize,
        },
      });
      return;
    }
    handleStyleChange("fontSize", fontSize);
  };

  const handleDimensionChange = (field: "width" | "height", val: string) => {
    if (selectedObj.locked) return;
    let num = parseFloat(val);
    if (isNaN(num) || num < 1) num = 1;

    if (field === "width") {
      const newScaleX = selectedObj.width ? num / selectedObj.width : 1;
      const updates: Record<string, number> = { scaleX: newScaleX };
      if (isRatioLocked) updates.scaleY = newScaleX;
      updateSceneObject(selectedObj.id, updates);
    } else {
      const newScaleY = selectedObj.height ? num / selectedObj.height : 1;
      const updates: Record<string, number> = { scaleY: newScaleY };
      if (isRatioLocked) updates.scaleX = newScaleY;
      updateSceneObject(selectedObj.id, updates);
    }
  };

  // --- 自定义选择组件 ---
  const CustomSelect = ({
    value,
    options,
    onChange,
    width = "100%",
  }: {
    value: string;
    options: { value: string; label: string; preview: React.ReactNode }[];
    onChange: (val: string) => void;
    width?: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption =
      options.find((opt) => opt.value === value) || options[0];

    return (
      <div
        className="ip-custom-select-container"
        ref={containerRef}
        style={{ width }}
      >
        <div
          className={`ip-custom-select-trigger ${isOpen ? "ip-is-open" : ""}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="ip-trigger-main">
            <span className="ip-preview-wrap">{selectedOption.preview}</span>
          </div>
          <svg
            className="ip-chevron-icon"
            width="10"
            height="6"
            viewBox="0 0 10 6"
          >
            <path
              d="M1 1L5 5L9 1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {isOpen && (
          <div className="ip-custom-select-dropdown">
            {options.map((opt) => (
              <div
                key={opt.value}
                className={`ip-custom-select-item ${opt.value === value ? "ip-is-selected" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                <span className="ip-item-preview">{opt.preview}</span>
                {opt.value === value && (
                  <svg
                    className="ip-check-icon"
                    width="10"
                    height="8"
                    viewBox="0 0 10 8"
                  >
                    <path
                      d="M1 4L4 7L9 1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // --- 选项定义 ---
  const dashOptions = [
    {
      value: "solid",
      label: "实线",
      preview: (
        <svg width="100%" height="12" viewBox="0 0 100 12">
          <line
            x1="0"
            y1="6"
            x2="100"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      value: "dashed",
      label: "虚线",
      preview: (
        <svg width="100%" height="12" viewBox="0 0 100 12">
          <line
            x1="0"
            y1="6"
            x2="100"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="10 5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      value: "dotted",
      label: "点线",
      preview: (
        <svg width="100%" height="12" viewBox="0 0 100 12">
          <line
            x1="0"
            y1="6"
            x2="100"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2 5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  ];

  const arrowOptions = [
    {
      value: "single",
      label: "单向",
      preview: (
        <svg width="100%" height="12" viewBox="0 0 100 12" fill="currentColor">
          <path
            d="M0 6h93"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M100 6l-7-4v8z" />
        </svg>
      ),
    },
    {
      value: "double",
      label: "双向",
      preview: (
        <svg width="100%" height="12" viewBox="0 0 100 12" fill="currentColor">
          <path
            d="M7 6h86"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M0 6l7-4v8z M100 6l-7-4v8z" />
        </svg>
      ),
    },
    {
      value: "start",
      label: "反向",
      preview: (
        <svg width="100%" height="12" viewBox="0 0 100 12" fill="currentColor">
          <path
            d="M7 6h93"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M0 6l7-4v8z" />
        </svg>
      ),
    },
    {
      value: "none",
      label: "无",
      preview: (
        <svg width="100%" height="12" viewBox="0 0 100 12">
          <line
            x1="0"
            y1="6"
            x2="100"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  ];

  return (
    <aside className="ip-inspector-panel">
      <InspectorTabHeader activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "layers" ? (
        <LayerPanel />
      ) : (
        <>
          <div className="ip-inspector-content">
            <div className="ip-property-group">
              <h4
                className={`ip-group-title${collapsedSections["params"] ? " is-collapsed" : ""}`}
                onClick={() => toggleSection("params")}
              >
                基础参数
                {sectionChevron("params")}
              </h4>
              {!collapsedSections["params"] && (<>

              <div
                className="ip-property-field"
                style={{
                  marginBottom: "8px",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <label
                  style={{
                    width: "70px",
                    flexShrink: 0,
                    marginBottom: 0,
                    fontSize: "13px",
                  }}
                >
                  X轴 / Y轴：
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flex: 1,
                    alignItems: "center",
                    minWidth: 0,
                  }}
                >
                  <div
                    className="ip-input-group"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <input
                      className="ip-input-nospin"
                      type="number"
                      inputMode="numeric"
                      step={1}
                      value={getBasicParamValue("x")}
                      disabled={!!selectedObj.locked}
                      onChange={(e) => updateBasicParamDraft("x", e.target.value)}
                      onBlur={(e) => commitBasicParamDraft("x", e.currentTarget)}
                      onKeyDown={(e) => handleBasicParamKeyDown("x", e)}
                      onFocus={(e) => e.target.select()}
                      style={{ padding: "3px 4px", height: "24px" }}
                    />
                  </div>
                  <div
                    className="ip-input-group"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <input
                      className="ip-input-nospin"
                      type="number"
                      inputMode="numeric"
                      step={1}
                      value={getBasicParamValue("y")}
                      disabled={!!selectedObj.locked}
                      onChange={(e) => updateBasicParamDraft("y", e.target.value)}
                      onBlur={(e) => commitBasicParamDraft("y", e.currentTarget)}
                      onKeyDown={(e) => handleBasicParamKeyDown("y", e)}
                      onFocus={(e) => e.target.select()}
                      style={{ padding: "3px 4px", height: "24px" }}
                    />
                  </div>
                  {/* 占位符，使输入框与下方 宽/高 保持等宽 */}
                  <div style={{ width: "28px", flexShrink: 0 }} />
                </div>
              </div>

              <div
                className="ip-property-field"
                style={{
                  marginBottom: "8px",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <label
                  style={{
                    width: "70px",
                    flexShrink: 0,
                    marginBottom: 0,
                    fontSize: "13px",
                  }}
                >
                  宽/高(px)：
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flex: 1,
                    alignItems: "center",
                    minWidth: 0,
                  }}
                >
                  <div
                    className="ip-input-group"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <input
                      className="ip-input-nospin"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={getBasicParamValue("width")}
                      disabled={!!selectedObj.locked}
                      onChange={(e) =>
                        updateBasicParamDraft("width", e.target.value)
                      }
                      onBlur={(e) =>
                        commitBasicParamDraft("width", e.currentTarget)
                      }
                      onKeyDown={(e) => handleBasicParamKeyDown("width", e)}
                      onFocus={(e) => e.target.select()}
                      style={{ padding: "3px 4px", height: "24px" }}
                    />
                  </div>
                  <div
                    className="ip-input-group"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <input
                      className="ip-input-nospin"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={getBasicParamValue("height")}
                      disabled={!!selectedObj.locked}
                      onChange={(e) =>
                        updateBasicParamDraft("height", e.target.value)
                      }
                      onBlur={(e) =>
                        commitBasicParamDraft("height", e.currentTarget)
                      }
                      onKeyDown={(e) => handleBasicParamKeyDown("height", e)}
                      onFocus={(e) => e.target.select()}
                      style={{ padding: "3px 4px", height: "24px" }}
                    />
                  </div>
                  <button
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0",
                      width: "28px",
                      flexShrink: 0,
                      fontSize: "1rem",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      color: isRatioLocked
                        ? "var(--primary-color)"
                        : "var(--text-muted)",
                    }}
                    onClick={() => setIsRatioLocked(!isRatioLocked)}
                    data-tooltip={isRatioLocked ? "解锁宽高比" : "锁定宽高比"}
                  >
                    {isRatioLocked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>

              <div
                className="ip-property-field"
                style={{
                  marginBottom: "8px",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <label
                  style={{
                    width: "70px",
                    flexShrink: 0,
                    marginBottom: 0,
                    fontSize: "13px",
                  }}
                >
                  旋转角度：
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flex: 1,
                    alignItems: "center",
                    minWidth: 0,
                  }}
                >
                  <div
                    className="ip-input-group"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <input
                      className="ip-input-nospin"
                      type="number"
                      inputMode="numeric"
                      step={1}
                      value={getBasicParamValue("rotation")}
                      disabled={!!selectedObj.locked}
                      onChange={(e) =>
                        updateBasicParamDraft("rotation", e.target.value)
                      }
                      onBlur={(e) =>
                        commitBasicParamDraft("rotation", e.currentTarget)
                      }
                      onKeyDown={(e) => handleBasicParamKeyDown("rotation", e)}
                      onFocus={(e) => e.target.select()}
                      style={{ padding: "3px 4px", height: "24px" }}
                    />
                  </div>
                  <button
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0",
                      width: "28px",
                      flexShrink: 0,
                      fontSize: "1.1rem",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      color: "var(--text-main)",
                      opacity: 0.8,
                    }}
                    onClick={() =>
                      !selectedObj.locked &&
                      updateSceneObject(selectedObj.id, {
                        scaleX: 1,
                        scaleY: 1,
                        rotation: 0,
                      })
                    }
                    data-tooltip="重置尺寸与角度"
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.opacity = "0.8")
                    }
                  >
                    🔄
                  </button>
                </div>
              </div>

              <div
                className="ip-property-field"
                style={{
                  marginBottom: "8px",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <label
                  style={{
                    width: "70px",
                    flexShrink: 0,
                    marginBottom: 0,
                    fontSize: "13px",
                  }}
                >
                  图层顺序：
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flex: 1,
                    justifyContent: "space-between",
                  }}
                >
                  <button
                    onClick={() => moveObjectToBack(selectedObj.id)}
                    disabled={!!selectedObj.locked}
                    data-tooltip="置底"
                    style={{
                      flex: 1,
                      padding: "4px",
                      backgroundColor: "var(--bg-color)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      cursor: selectedObj.locked ? "not-allowed" : "pointer",
                      color: "var(--text-main)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "24px",
                      opacity: selectedObj.locked ? 0.4 : 1,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="3" x2="12" y2="17" />
                      <polyline points="19 10 12 17 5 10" />
                      <line x1="4" y1="21" x2="20" y2="21" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveObjectBackward(selectedObj.id)}
                    disabled={!!selectedObj.locked}
                    data-tooltip="下移一层"
                    style={{
                      flex: 1,
                      padding: "4px",
                      backgroundColor: "var(--bg-color)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      cursor: selectedObj.locked ? "not-allowed" : "pointer",
                      color: "var(--text-main)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "24px",
                      opacity: selectedObj.locked ? 0.4 : 1,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveObjectForward(selectedObj.id)}
                    disabled={!!selectedObj.locked}
                    data-tooltip="上移一层"
                    style={{
                      flex: 1,
                      padding: "4px",
                      backgroundColor: "var(--bg-color)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      cursor: selectedObj.locked ? "not-allowed" : "pointer",
                      color: "var(--text-main)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "24px",
                      opacity: selectedObj.locked ? 0.4 : 1,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveObjectToFront(selectedObj.id)}
                    disabled={!!selectedObj.locked}
                    data-tooltip="置顶"
                    style={{
                      flex: 1,
                      padding: "4px",
                      backgroundColor: "var(--bg-color)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      cursor: selectedObj.locked ? "not-allowed" : "pointer",
                      color: "var(--text-main)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "24px",
                      opacity: selectedObj.locked ? 0.4 : 1,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="21" x2="12" y2="7" />
                      <polyline points="5 14 12 7 19 14" />
                      <line x1="4" y1="3" x2="20" y2="3" />
                    </svg>
                  </button>
                </div>
              </div>
              </>)}
            </div>

            {/* 基础操作 */}
            <div className="ip-property-group">
              <h4
                className={`ip-group-title${collapsedSections["ops"] ? " is-collapsed" : ""}`}
                onClick={() => toggleSection("ops")}
              >
                基础操作
                {sectionChevron("ops")}
              </h4>
              {!collapsedSections["ops"] && (<>
              <div className="ip-property-row" style={{ gap: 4 }}>
                <button
                  data-tooltip={selectedObj.locked ? "解锁对象（可移动）" : "锁定对象（防止误移）"}
                  onClick={() => toggleObjectLock(selectedObj.id)}
                  style={{
                    flex: 1,
                    height: 24,
                    border: `1px solid ${selectedObj.locked ? "var(--primary-color)" : "var(--border-color)"}`,
                    background: selectedObj.locked ? "rgba(59,130,246,0.08)" : "transparent",
                    color: selectedObj.locked ? "var(--primary-color)" : "var(--text-muted)",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {selectedObj.locked ? "🔒 已锁定" : "🔓 锁定"}
                </button>
                <button
                  data-tooltip="复制对象 (Ctrl+D)"
                  onClick={() => duplicateObject(selectedObj.id)}
                  disabled={!!selectedObj.locked}
                  style={{
                    flex: 1,
                    height: 24,
                    border: "1px solid var(--border-color)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    borderRadius: 6,
                    cursor: selectedObj.locked ? "not-allowed" : "pointer",
                    fontSize: 13,
                    opacity: selectedObj.locked ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  复制
                </button>
                <button
                  data-tooltip="删除对象 (Delete)"
                  onClick={() => removeSceneObject(selectedObj.id)}
                  disabled={!!selectedObj.locked}
                  style={{
                    flex: 1,
                    height: 24,
                    border: "1px solid rgba(239,68,68,0.4)",
                    background: "transparent",
                    color: "#ef4444",
                    borderRadius: 6,
                    cursor: selectedObj.locked ? "not-allowed" : "pointer",
                    fontSize: 13,
                    opacity: selectedObj.locked ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  删除
                </button>
              </div>
              <div className="ip-property-row" style={{ gap: 4, marginTop: 4 }}>
                <button
                  data-tooltip="以元素自身纵轴为对称轴，原地左右镜像（位置不变）"
                  disabled={!!selectedObj.locked}
                  onClick={() => axisFlipSceneObject(selectedObj.id, 'x')}
                  style={{
                    flex: 1, height: 24, borderRadius: 6, fontSize: 13,
                    border: "1px solid var(--border-color)", background: "transparent",
                    color: "var(--text-muted)",
                    cursor: selectedObj.locked ? "not-allowed" : "pointer",
                    opacity: selectedObj.locked ? 0.4 : 1,
                  }}
                >
                  纵轴对称
                </button>
                <button
                  data-tooltip="以元素自身横轴为对称轴，原地上下镜像（位置不变）"
                  disabled={!!selectedObj.locked}
                  onClick={() => axisFlipSceneObject(selectedObj.id, 'y')}
                  style={{
                    flex: 1, height: 24, borderRadius: 6, fontSize: 13,
                    border: "1px solid var(--border-color)", background: "transparent",
                    color: "var(--text-muted)",
                    cursor: selectedObj.locked ? "not-allowed" : "pointer",
                    opacity: selectedObj.locked ? 0.4 : 1,
                  }}
                >
                  横轴对称
                </button>
                <button
                  data-tooltip="以元素自身几何中心为对称中心，原地旋转180°"
                  disabled={!!selectedObj.locked}
                  onClick={() => centerFlipSceneObject(selectedObj.id)}
                  style={{
                    flex: 1, height: 24, borderRadius: 6, fontSize: 13,
                    border: "1px solid var(--border-color)", background: "transparent",
                    color: "var(--text-muted)",
                    cursor: selectedObj.locked ? "not-allowed" : "pointer",
                    opacity: selectedObj.locked ? 0.4 : 1,
                  }}
                >
                  中心对称
                </button>
              </div>
              <div className="ip-property-row" style={{ gap: 4, marginTop: 4 }}>
                <button
                  data-tooltip="以画布垂直中线为轴水平翻转"
                  disabled={!!selectedObj.locked}
                  onClick={() => flipSceneObject(selectedObj.id, 'x')}
                  style={{
                    flex: '0 0 calc((100% - 8px) / 3)', height: 24, borderRadius: 6, fontSize: 13,
                    border: "1px solid var(--border-color)", background: "transparent",
                    color: "var(--text-muted)",
                    cursor: selectedObj.locked ? "not-allowed" : "pointer",
                    opacity: selectedObj.locked ? 0.4 : 1,
                  }}
                >
                  水平翻转
                </button>
                <button
                  data-tooltip="以画布水平中线为轴垂直翻转"
                  disabled={!!selectedObj.locked}
                  onClick={() => flipSceneObject(selectedObj.id, 'y')}
                  style={{
                    flex: '0 0 calc((100% - 8px) / 3)', height: 24, borderRadius: 6, fontSize: 13,
                    border: "1px solid var(--border-color)", background: "transparent",
                    color: "var(--text-muted)",
                    cursor: selectedObj.locked ? "not-allowed" : "pointer",
                    opacity: selectedObj.locked ? 0.4 : 1,
                  }}
                >
                  垂直翻转
                </button>
              </div>
              </>)}
            </div>

            {/* 对齐工具 */}
            <div className="ip-property-group">
              <h4
                className={`ip-group-title${collapsedSections["align"] ? " is-collapsed" : ""}`}
                onClick={() => toggleSection("align")}
              >
                对齐方式
                {sectionChevron("align")}
              </h4>
              {!collapsedSections["align"] && (<div style={selectedObj.locked ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>
              {/* 水平对齐：左对齐 / 水平居中 / 右对齐 */}
              <div
                className="ip-property-row"
                style={{ gap: 8, marginBottom: 8 }}
              >
                {(
                  [
                    {
                      title: "左边缘贴画布左边",
                      calc: () => {
                        const hw = Math.round(
                          (selectedObj!.width * (selectedObj!.scaleX ?? 1)) / 2,
                        );
                        return { x: hw };
                      },
                      icon: (
                        <svg viewBox="0 0 14 14" width="14" height="14">
                          <rect x="0" y="0" width="2" height="14" fill="var(--primary-color)" />
                          <rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6" />
                          <rect x="2" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35" />
                        </svg>
                      ),
                      label: "左对齐",
                    },
                    {
                      title: "水平方向居中于画布",
                      calc: () => ({ x: Math.round(canvasWidth / 2) }),
                      icon: (
                        <svg viewBox="0 0 14 14" width="14" height="14">
                          <rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6" />
                          <rect x="4" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35" />
                          <rect x="6" y="0" width="2" height="14" fill="var(--primary-color)" />
                        </svg>
                      ),
                      label: "水平居中",
                    },
                    {
                      title: "右边缘贴画布右边",
                      calc: () => {
                        const hw = Math.round(
                          (selectedObj!.width * (selectedObj!.scaleX ?? 1)) / 2,
                        );
                        return { x: canvasWidth - hw };
                      },
                      icon: (
                        <svg viewBox="0 0 14 14" width="14" height="14">
                          <rect x="2" y="2" width="10" height="3" fill="var(--primary-color)" opacity="0.6" />
                          <rect x="6" y="8" width="6" height="3" fill="var(--primary-color)" opacity="0.35" />
                          <rect x="12" y="0" width="2" height="14" fill="var(--primary-color)" />
                        </svg>
                      ),
                      label: "右对齐",
                    },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.label}
                    data-tooltip={btn.title}
                    onClick={() =>
                      selectedObj &&
                      !selectedObj.locked &&
                      updateSceneObject(selectedObj.id, btn.calc())
                    }
                    style={{
                      flex: 1,
                      height: 24,
                      padding: 0,
                      border: "1px solid var(--border-color)",
                      background: "transparent",
                      color: "var(--text-main)",
                      borderRadius: 6,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--primary-color)";
                      e.currentTarget.style.background =
                        "rgba(59,130,246,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {btn.icon}
                  </button>
                ))}
              </div>
              {/* 垂直对齐：顶对齐 / 垂直居中 / 底对齐 */}
              <div className="ip-property-row" style={{ gap: 8 }}>
                {(
                  [
                    {
                      title: "上边缘贴画布顶部",
                      calc: () => {
                        const hh = Math.round(
                          (selectedObj!.height * (selectedObj!.scaleY ?? 1)) /
                            2,
                        );
                        return { y: hh };
                      },
                      icon: (
                        <svg viewBox="0 0 14 14" width="14" height="14">
                          <rect x="0" y="0" width="14" height="2" fill="var(--primary-color)" />
                          <rect x="2" y="2" width="3" height="10" fill="var(--primary-color)" opacity="0.6" />
                          <rect x="8" y="2" width="3" height="6" fill="var(--primary-color)" opacity="0.35" />
                        </svg>
                      ),
                      label: "顶对齐",
                    },
                    {
                      title: "垂直方向居中于画布",
                      calc: () => ({ y: Math.round(canvasHeight / 2) }),
                      icon: (
                        <svg viewBox="0 0 14 14" width="14" height="14">
                          <rect x="2" y="2" width="3" height="10" fill="var(--primary-color)" opacity="0.6" />
                          <rect x="8" y="4" width="3" height="6" fill="var(--primary-color)" opacity="0.35" />
                          <rect x="0" y="6" width="14" height="2" fill="var(--primary-color)" />
                        </svg>
                      ),
                      label: "垂直居中",
                    },
                    {
                      title: "下边缘贴画布底部",
                      calc: () => {
                        const hh = Math.round(
                          (selectedObj!.height * (selectedObj!.scaleY ?? 1)) /
                            2,
                        );
                        return { y: canvasHeight - hh };
                      },
                      icon: (
                        <svg viewBox="0 0 14 14" width="14" height="14">
                          <rect x="2" y="1" width="3" height="11" fill="var(--primary-color)" opacity="0.6" />
                          <rect x="8" y="5" width="3" height="7" fill="var(--primary-color)" opacity="0.35" />
                          <rect x="0" y="12" width="14" height="2" fill="var(--primary-color)" />
                        </svg>
                      ),
                      label: "底对齐",
                    },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.label}
                    data-tooltip={btn.title}
                    onClick={() =>
                      selectedObj &&
                      !selectedObj.locked &&
                      updateSceneObject(selectedObj.id, btn.calc())
                    }
                    style={{
                      flex: 1,
                      height: 24,
                      padding: 0,
                      border: "1px solid var(--border-color)",
                      background: "transparent",
                      color: "var(--text-main)",
                      borderRadius: 6,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--primary-color)";
                      e.currentTarget.style.background =
                        "rgba(59,130,246,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-color)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {btn.icon}
                  </button>
                ))}
              </div>
              </div>)}
            </div>

            {/* 文字设置 */}
            <div className="ip-property-group">
              <h4
                className={`ip-group-title${collapsedSections["text"] ? " is-collapsed" : ""}`}
                onClick={() => toggleSection("text")}
              >
                文字设置
                {sectionChevron("text")}
              </h4>
              {!collapsedSections["text"] && (<div style={selectedObj.locked ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>

              {/* 文字颜色 | 字体大小 */}
              <div
                className="ip-property-field"
                style={{
                  flexDirection: "row",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: "8px",
                  }}
                >
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "13px",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    文字颜色：
                  </label>
                  <div className="ip-input-group" style={{ width: "45px" }}>
                    <input
                      type="color"
                      value={
                        selectedObj.type === "text" ||
                        selectedObj.type === "material"
                          ? selectedObj.style?.fill || "#000000"
                          : selectedObj.style?.textColor || "#334155"
                      }
                      onChange={(e) => {
                        if (selectedObj.type === "text" || selectedObj.type === "material") {
                          handleStyleChangeSilent("fill", e.target.value);
                        } else {
                          handleStyleChangeSilent("textColor", e.target.value);
                        }
                      }}
                      onBlur={(e) => {
                        if (selectedObj.type === "text" || selectedObj.type === "material") {
                          handleStyleChange("fill", e.target.value);
                        } else {
                          handleStyleChange("textColor", e.target.value);
                        }
                      }}
                      style={{
                        width: "100%",
                        height: "24px",
                        padding: 0,
                        cursor: "pointer",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius)",
                        backgroundColor: "white",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "13px",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    字体大小：
                  </label>
                  <div className="ip-input-group" style={{ width: "45px" }}>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={
                        selectedObj.style?.fontSize ||
                        (selectedObj.type === "text" ||
                        selectedObj.type === "material"
                          ? 18
                          : 14)
                      }
                      onChange={(e) => {
                        let val = parseInt(e.target.value);
                        if (isNaN(val)) val = 5;
                        if (val < 5) val = 5;
                        if (val > 120) val = 120;
                        handleFontSizeChange(val);
                      }}
                      style={{
                        textAlign: "center",
                        padding: "3px 4px",
                        height: "24px",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 对齐方式 */}
              <div
                className="ip-property-field"
                style={{
                  flexDirection: "row",
                  gap: "28px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: 1,
                  }}
                >
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "13px",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    对齐方式：
                  </label>
                  <div
                    style={{
                      display: "flex",
                      flex: 1,
                      gap: "1px",
                      backgroundColor: "rgba(0,0,0,0.05)",
                      padding: "2px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {[
                      {
                        id: "left",
                        icon: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="15" y2="12" />
                            <line x1="3" y1="18" x2="18" y2="18" />
                          </svg>
                        ),
                      },
                      {
                        id: "center",
                        icon: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="6" y1="12" x2="18" y2="12" />
                            <line x1="5" y1="18" x2="19" y2="18" />
                          </svg>
                        ),
                      },
                      {
                        id: "right",
                        icon: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="9" y1="12" x2="21" y2="12" />
                            <line x1="6" y1="18" x2="21" y2="18" />
                          </svg>
                        ),
                      },
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        onClick={() => handleStyleChange("textAlign", btn.id)}
                        style={{
                          flex: 1,
                          height: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          backgroundColor:
                            (selectedObj.style?.textAlign || "center") ===
                            btn.id
                              ? "white"
                              : "transparent",
                          color:
                            (selectedObj.style?.textAlign || "center") ===
                            btn.id
                              ? "var(--primary-color)"
                              : "var(--text-muted)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        {btn.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 文字方向 */}
              <div
                className="ip-property-field"
                style={{
                  flexDirection: "row",
                  gap: "28px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: 1,
                  }}
                >
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "13px",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    文字方向：
                  </label>
                  <div
                    style={{
                      display: "flex",
                      flex: 1,
                      gap: "1px",
                      backgroundColor: "rgba(0,0,0,0.05)",
                      padding: "2px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {[
                      { id: "horizontal", label: "横排" },
                      { id: "vertical", label: "纵排" },
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        onClick={() =>
                          handleDirectionChange(
                            btn.id as "horizontal" | "vertical",
                          )
                        }
                        style={{
                          flex: 1,
                          height: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          backgroundColor:
                            (selectedObj.style?.textDirection ||
                              "horizontal") === btn.id
                              ? "white"
                              : "transparent",
                          color:
                            (selectedObj.style?.textDirection ||
                              "horizontal") === btn.id
                              ? "var(--primary-color)"
                              : "var(--text-muted)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          fontSize: "13px",
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              </div>)}
            </div>

            {/* 样式设置 - 仅形状/路径类元素 */}
            {selectedObj.type !== "text" && selectedObj.type !== "material" && (
              <div className="ip-property-group">
                <h4
                  className={`ip-group-title${collapsedSections["style"] ? " is-collapsed" : ""}`}
                  onClick={() => toggleSection("style")}
                >
                  样式设置
                  {sectionChevron("style")}
                </h4>
                {!collapsedSections["style"] && (<div style={selectedObj.locked ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>

                {/* 描边颜色 | 填充颜色 or 描边粗细 */}
                <div
                  className="ip-property-field"
                  style={{
                    flexDirection: "row",
                    gap: "8px",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: "8px",
                    }}
                  >
                    <label
                      style={{
                        marginBottom: 0,
                        fontSize: "13px",
                        whiteSpace: "nowrap",
                        width: "65px",
                        flexShrink: 0,
                      }}
                    >
                      描边颜色：
                    </label>
                    <div className="ip-input-group" style={{ width: "45px" }}>
                      <input
                        type="color"
                        value={selectedObj.style?.stroke || "#000000"}
                        onChange={(e) => handleStyleChangeSilent("stroke", e.target.value)}
                        onBlur={(e) => handleStyleChange("stroke", e.target.value)}
                        style={{
                          width: "100%",
                          height: "24px",
                          padding: 0,
                          cursor: "pointer",
                          border: "1px solid var(--border-color)",
                          borderRadius: "var(--radius)",
                          backgroundColor: "white",
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    {["rect", "circle", "triangle", "trapezoid"].includes(
                      selectedObj.type,
                    ) && (
                      <>
                        <label
                          style={{
                            marginBottom: 0,
                            fontSize: "13px",
                            whiteSpace: "nowrap",
                            width: "40px",
                            flexShrink: 0,
                          }}
                        >
                          填充颜色：
                        </label>
                        <div
                          className="ip-input-group"
                          style={{ width: "45px" }}
                        >
                          <input
                            type="color"
                            value={selectedObj.style?.fill || "#000000"}
                            onChange={(e) => handleStyleChangeSilent("fill", e.target.value)}
                            onBlur={(e) => handleStyleChange("fill", e.target.value)}
                            style={{
                              width: "100%",
                              height: "24px",
                              padding: 0,
                              cursor: "pointer",
                              border: "1px solid var(--border-color)",
                              borderRadius: "var(--radius)",
                              backgroundColor: "white",
                            }}
                          />
                        </div>
                      </>
                    )}
                    {["line", "arrow", "curve"].includes(selectedObj.type) && (
                      <>
                        <label
                          style={{
                            marginBottom: 0,
                            fontSize: "13px",
                            whiteSpace: "nowrap",
                            width: "65px",
                            flexShrink: 0,
                          }}
                        >
                          描边粗细：
                        </label>
                        <div
                          className="ip-input-group"
                          style={{ width: "45px" }}
                        >
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={selectedObj.style?.strokeWidth || 1}
                            onChange={(e) => {
                              let val = parseInt(e.target.value);
                              if (isNaN(val)) val = 1;
                              if (val < 1) val = 1;
                              if (val > 20) val = 20;
                              handleStyleChange("strokeWidth", val);
                            }}
                            style={{
                              textAlign: "center",
                              padding: "3px 4px",
                              height: "24px",
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 描边粗细 | 圆角/半径 (仅形状) */}
                {["rect", "circle", "triangle", "trapezoid"].includes(
                  selectedObj.type,
                ) && (
                  <div
                    className="ip-property-field"
                    style={{
                      flexDirection: "row",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: "8px",
                      }}
                    >
                      <label
                        style={{
                          marginBottom: 0,
                          fontSize: "13px",
                          whiteSpace: "nowrap",
                          width: "65px",
                          flexShrink: 0,
                        }}
                      >
                        描边粗细：
                      </label>
                      <div className="ip-input-group" style={{ width: "45px" }}>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={selectedObj.style?.strokeWidth || 1}
                          onChange={(e) => {
                            let val = parseInt(e.target.value);
                            if (isNaN(val)) val = 1;
                            if (val < 1) val = 1;
                            if (val > 20) val = 20;
                            handleStyleChange("strokeWidth", val);
                          }}
                          style={{
                            textAlign: "center",
                            padding: "3px 4px",
                            height: "24px",
                          }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      {["rect", "triangle", "circle"].includes(
                        selectedObj.type,
                      ) && (
                        <>
                          <label
                            style={{
                              marginBottom: 0,
                              fontSize: "13px",
                              whiteSpace: "nowrap",
                              width: "65px",
                              flexShrink: 0,
                            }}
                          >
                            {selectedObj.type === "rect" ? (
                              <span style={{ letterSpacing: "2em" }}>圆</span>
                            ) : (
                              <span style={{ letterSpacing: "2em" }}>半</span>
                            )}
                            {selectedObj.type === "rect" ? "角：" : "径："}
                          </label>
                          <div
                            className="ip-input-group"
                            style={{ width: "45px" }}
                          >
                            <input
                              type="number"
                              min={selectedObj.type === "rect" ? 0 : 1}
                              max={selectedObj.type === "rect" ? 99 : 500}
                              value={
                                selectedObj.type === "rect"
                                  ? selectedObj.style?.cornerRadius || 0
                                  : Math.round(selectedObj.width / 2)
                              }
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (selectedObj.type === "rect") {
                                  handleStyleChange(
                                    "cornerRadius",
                                    Math.max(0, Math.min(99, val)),
                                  );
                                } else if (!selectedObj.locked) {
                                  updateSceneObject(selectedObj.id, {
                                    width: Math.max(1, val) * 2,
                                    height: Math.max(1, val) * 2,
                                  });
                                }
                              }}
                              style={{
                                textAlign: "center",
                                padding: "3px 4px",
                                height: "24px",
                              }}
                            />
                          </div>
                        </>
                      )}
                      {selectedObj.type === "trapezoid" && (
                        <div style={{ flex: 1 }} />
                      )}
                    </div>
                  </div>
                )}

                {/* 线型（仅路径类元素）*/}
                {["line", "arrow", "curve"].includes(selectedObj.type) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <label
                      style={{
                        marginBottom: 0,
                        fontSize: "13px",
                        width: "65px",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>线</span>
                        <span>型</span>
                      </span>
                      <span>：</span>
                    </label>
                    <CustomSelect
                      value={(selectedObj.data?.dashStyle as string) || "solid"}
                      onChange={(val) => handleDataChange("dashStyle", val)}
                      options={dashOptions}
                      width="100%"
                    />
                  </div>
                )}

                {/* 样式（仅箭头元素）*/}
                {selectedObj.type === "arrow" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <label
                      style={{
                        marginBottom: 0,
                        fontSize: "13px",
                        width: "65px",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>样</span>
                        <span>式</span>
                      </span>
                      <span>：</span>
                    </label>
                    <CustomSelect
                      value={
                        (selectedObj.data?.arrowStyle as string) || "single"
                      }
                      onChange={(val) => handleDataChange("arrowStyle", val)}
                      options={arrowOptions}
                      width="100%"
                    />
                  </div>
                )}
                </div>)}
              </div>
            )}

            {/* 对象状态 - 仅素材对象 */}
            {selectedObj.type === 'material' && (
              <div className="ip-property-group">
                <h4
                  className={`ip-group-title${collapsedSections["states"] ? " is-collapsed" : ""}`}
                  onClick={() => toggleSection("states")}
                >
                  对象状态 {sectionChevron("states")}
                </h4>
                {!collapsedSections["states"] && (
                  <div className="ip-property-body">
                    <div ref={statePickerContainerRef} style={{ position: 'relative' }}>
                      {(statePickerOpen || stateSearchQuery.trim()) && (() => {
                        const q = stateSearchQuery.trim().toLowerCase();
                        const visibleCats = q
                          ? allSvgCategories.filter(cat => allSvgOptions.some(o => o.category === cat && o.name.toLowerCase().includes(q)))
                          : allSvgCategories;
                        const rightItems = (statePickerCategory === null && !q)
                          ? []
                          : allSvgOptions.filter(o =>
                              (!statePickerCategory || o.category === statePickerCategory) &&
                              (!q || o.name.toLowerCase().includes(q))
                            );
                        const addItem = (opt: { url: string; name: string }) => {
                          const existingKeys = Object.keys(selectedObj.stateVariants || {});
                          const key = buildUniqueStateName(opt.name, existingKeys);
                          updateSceneObject(selectedObj.id, { stateVariants: { ...(selectedObj.stateVariants || {}), [key]: opt.url } });
                          setStatePickerOpen(false); setStatePickerCategory(null); setStateSearchQuery('');
                        };
                        return (
                          <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, zIndex: 20, background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', boxShadow: '0 -2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', height: 180 }}>
                              {/* 左列：大类 */}
                              <div style={{ width: '50%', borderRight: '1px solid var(--border-color)', overflowY: 'auto', overflowX: 'hidden', flexShrink: 0 }}>
                                {visibleCats.length === 0
                                  ? <div style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>无匹配</div>
                                  : visibleCats.map(cat => (
                                    <div
                                      key={cat}
                                      ref={el => {
                                        if (!el) return;
                                        // 文字被省略号截断时才挂 tooltip，渲染时就位，避免悬停时再派发 mouseover 造成递归
                                        if (el.scrollWidth > el.clientWidth) el.setAttribute('data-tooltip', cat);
                                        else el.removeAttribute('data-tooltip');
                                      }}
                                      onClick={() => setStatePickerCategory(cat)}
                                      style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', background: statePickerCategory === cat ? 'var(--bg-secondary)' : '', fontWeight: statePickerCategory === cat ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                      onMouseEnter={e => { if (statePickerCategory !== cat) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = statePickerCategory === cat ? 'var(--bg-secondary)' : ''; }}
                                    >{cat}</div>
                                  ))
                                }
                              </div>
                              {/* 右列：元素 */}
                              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                                {statePickerCategory === null && !q
                                  ? <div style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>← 选择大类</div>
                                  : rightItems.length === 0
                                    ? <div style={{ padding: '8px', fontSize: 12, color: 'var(--text-muted)' }}>无匹配</div>
                                    : rightItems.map(opt => (
                                      <div
                                        key={opt.url}
                                        onClick={() => addItem(opt)}
                                        style={{ padding: '5px 8px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                                      >
                                        <img src={opt.url} alt={opt.name} style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                                        <span
                                          ref={el => {
                                            if (!el) return;
                                            // 同上：截断才挂 tooltip，渲染时就位，避免悬停递归
                                            if (el.scrollWidth > el.clientWidth) el.setAttribute('data-tooltip', opt.name);
                                            else el.removeAttribute('data-tooltip');
                                          }}
                                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                                        >{opt.name}</span>
                                      </div>
                                    ))
                                }
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        {/* 左列：状态列表 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ height: 100, overflowY: 'hidden', overflowX: 'hidden', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {Object.entries(selectedObj.stateVariants || {}).length === 0 ? (
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', lineHeight: 1.5 }}>
                                点击「+ 添加」<br/>添加状态变体
                              </div>
                            ) : Object.entries(selectedObj.stateVariants || {}).map(([key, url]) => (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <img src={url} alt={key} style={{ width: 20, height: 20, boxSizing: 'border-box', objectFit: 'contain', border: '1px solid var(--border-color)', borderRadius: 2, background: '#fff', flexShrink: 0 }} />
                                  {editingStateKey === key ? (
                                    <input
                                      autoFocus
                                      value={editingStateName}
                                      maxLength={STATE_NAME_MAX_UNITS}
                                      onChange={(e) => setEditingStateName(trimStateName(e.target.value))}
                                      onBlur={() => {
                                        const newKey = trimStateName(editingStateName);
                                        const variants = selectedObj.stateVariants || {};
                                        if (newKey && newKey !== key && !(newKey in variants)) {
                                          const newVariants: Record<string, string> = {};
                                          for (const [k, v] of Object.entries(variants)) {
                                            newVariants[k === key ? newKey : k] = v;
                                          }
                                          updateSceneObject(selectedObj.id, { stateVariants: newVariants });
                                          const stateClipUpdates = animations
                                            .filter((c): c is StateChangeClip =>
                                              c.type === 'stateChange' &&
                                              c.objectId === selectedObj.id &&
                                              c.payload.steps.some(s => s.toStateKey === key)
                                            )
                                            .map((c) => ({
                                              id: c.id,
                                              patch: {
                                                payload: {
                                                  steps: c.payload.steps.map(s => s.toStateKey === key ? { ...s, toStateKey: newKey } : s),
                                                },
                                              } as Partial<AnimationClip>,
                                            }));
                                          batchUpdateAnimationClips(stateClipUpdates);
                                        }
                                        setEditingStateKey(null);
                                      }}
                                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingStateKey(null); }}
                                      style={{ flex: 1, fontSize: 12, padding: '1px 4px', border: '1px solid var(--primary-color)', borderRadius: 'var(--radius)', outline: 'none', minWidth: 0 }}
                                    />
                                  ) : (
                                    <span
                                      data-tooltip="点击编辑状态名称"
                                      onClick={() => { setEditingStateKey(key); setEditingStateName(key); }}
                                      style={{ flex: 1, fontSize: 12, cursor: 'text', borderRadius: 'var(--radius)', padding: '1px 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                                    >{key}</span>
                                  )}
                                  <button
                                    onClick={() => {
                                      const v = { ...(selectedObj.stateVariants || {}) };
                                      delete v[key];
                                      updateSceneObject(selectedObj.id, { stateVariants: Object.keys(v).length ? v : undefined });
                                      const stateClipsForObj = animations.filter((c): c is StateChangeClip =>
                                        c.type === 'stateChange' && c.objectId === selectedObj.id
                                      );
                                      const clipsToRemove: string[] = [];
                                      const clipsToUpdate: Array<{ id: string; patch: Partial<AnimationClip> }> = [];
                                      for (const c of stateClipsForObj) {
                                        const newSteps = c.payload.steps.filter(s => s.toStateKey !== key);
                                        if (newSteps.length === 0) {
                                          clipsToRemove.push(c.id);
                                        } else if (newSteps.length !== c.payload.steps.length) {
                                          const minMs = Math.min(...newSteps.map(s => s.atMs));
                                          const maxMs = Math.max(...newSteps.map(s => s.atMs));
                                          clipsToUpdate.push({ id: c.id, patch: { payload: { steps: newSteps }, startTimeMs: minMs, durationMs: Math.max(1, maxMs - minMs) } as Partial<AnimationClip> });
                                        }
                                      }
                                      if (clipsToRemove.length > 0) removeAnimationClips(clipsToRemove);
                                      if (clipsToUpdate.length > 0) batchUpdateAnimationClips(clipsToUpdate);
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                                  >×</button>
                                </div>
                              ))}
                          </div>
                        </div>
                        {/* 右列：添加状态 + 搜索 + 取消 */}
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0, width: 76, height: 100 }}>
                          {(() => {
                            const atMax = Object.keys(selectedObj.stateVariants || {}).length >= 4;
                            return (<>
                              <button
                                data-tooltip={atMax ? '最多添加 4 个状态' : undefined}
                                style={{ height: 24, fontSize: 13, padding: '0 6px', border: 'none', borderRadius: 6, cursor: atMax ? 'not-allowed' : 'pointer', background: 'var(--primary-color)', color: '#fff', width: '100%', whiteSpace: 'nowrap', opacity: atMax ? 0.45 : 1, flexShrink: 0 }}
                                onClick={() => { if (atMax) return; setStatePickerCategory(null); setStateSearchQuery(''); setStatePickerOpen(true); }}
                              >+ 添加</button>
                              <div
                                data-tooltip={atMax ? '最多添加 4 个状态' : undefined}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px 0 17px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-primary)', width: '100%', boxSizing: 'border-box', height: 24, opacity: atMax ? 0.45 : 1, cursor: atMax ? 'not-allowed' : 'default', flexShrink: 0 }}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                <input
                                  type="text"
                                  placeholder="搜索"
                                  value={stateSearchQuery}
                                  onChange={e => { if (atMax) return; setStateSearchQuery(e.target.value); setStatePickerOpen(false); if (!e.target.value.trim()) setStatePickerCategory(null); }}
                                  onFocus={() => { if (atMax) return; setStatePickerOpen(false); }}
                                  style={{ fontSize: 13, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-main)', flex: 1, minWidth: 0, padding: 0, cursor: atMax ? 'not-allowed' : 'text', pointerEvents: atMax ? 'none' : undefined }}
                                />
                              </div>
                              <button
                                style={{ height: 24, fontSize: 13, padding: '0 6px', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0 }}
                                onClick={() => { setStatePickerOpen(false); setStateSearchQuery(''); setStatePickerCategory(null); }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                                取消
                              </button>
                            </>);
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

// ── 共用 Tab 标题栏 ──────────────────────────────────────────────────────────
function InspectorTabHeader({
  activeTab,
  onTabChange,
}: {
  activeTab: "properties" | "layers";
  onTabChange: (tab: "properties" | "layers") => void;
}) {
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 40,
    padding: 0,
    border: "none",
    borderBottom: active
      ? "2px solid var(--primary-color)"
      : "2px solid transparent",
    background: "transparent",
    color: active ? "var(--primary-color)" : "var(--text-muted)",
    fontSize: 16,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "color 0.15s, border-color 0.15s",
  });
  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border-color)",
        flexShrink: 0,
      }}
    >
      <button
        style={tabStyle(activeTab === "properties")}
        onClick={() => onTabChange("properties")}
      >
        属性
      </button>
      <button
        style={tabStyle(activeTab === "layers")}
        onClick={() => onTabChange("layers")}
      >
        图层
      </button>
    </div>
  );
}
