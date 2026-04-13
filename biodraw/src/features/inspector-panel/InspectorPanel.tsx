import { useState, useRef, useEffect, useMemo } from "react";
import { useEditorStore } from "../../state/editorStore";
import "./InspectorPanel.css";

const CLIP_TYPE_LABELS: Record<string, string> = {
  move: '移动',
  moveAlongPath: '曲线移动',
  fade: '淡入淡出',
  scale: '缩放',
  rotate: '旋转',
  shake: '抖动',
  stateChange: '状态切换',
};

const CLIP_TYPE_COLORS: Record<string, string> = {
  move: '#3b82f6',
  moveAlongPath: '#06b6d4',
  fade: '#8b5cf6',
  scale: '#10b981',
  rotate: '#f59e0b',
  shake: '#ef4444',
  stateChange: '#64748b',
};

export function InspectorPanel() {
  const isRatioLocked = useEditorStore((state) => state.isRatioLocked);
  const setIsRatioLocked = useEditorStore((state) => state.setIsRatioLocked);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const objects = useEditorStore((state) => state.objects);
  const updateSceneObject = useEditorStore((state) => state.updateSceneObject);

  const moveObjectForward = useEditorStore((state) => state.moveObjectForward);
  const moveObjectBackward = useEditorStore(
    (state) => state.moveObjectBackward,
  );
  const moveObjectToFront = useEditorStore((state) => state.moveObjectToFront);
  const moveObjectToBack = useEditorStore((state) => state.moveObjectToBack);

  const animations = useEditorStore((state) => state.animations);
  const setExpandedAnimationClipId = useEditorStore((state) => state.setExpandedAnimationClipId);
  const canvasWidth  = useEditorStore((state) => state.canvasWidth);
  const canvasHeight = useEditorStore((state) => state.canvasHeight);
  const duplicateObject = useEditorStore((state) => state.duplicateObject);
  const removeSceneObject = useEditorStore((state) => state.removeSceneObject);

  const selectedObj =
    selectedIds.length > 0
      ? objects.find((o) => o.id === selectedIds[0])
      : null;
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
    return (
      <aside className="inspector-panel">
        <div className="panel-header">
          <h3>属性控制</h3>
        </div>
        <div className="inspector-content">
          <div className="empty-state">
            未选中任何对象
            <span className="hint">请在画板中点击对象以加载其属性</span>
          </div>
        </div>
      </aside>
    );
  }

  const handleChange = (field: string, val: string) => {
    let num = parseFloat(val);
    if (isNaN(num)) num = 0;
    updateSceneObject(selectedObj.id, { [field]: num });
  };

  const handleStyleChange = (field: string, val: string | number) => {
    updateSceneObject(selectedObj.id, {
      style: {
        ...(selectedObj.style || {}),
        [field]: val,
      },
    });
  };

  const handleDataChange = (field: string, val: string | number) => {
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
    selectedObj.type === "material" || basicNamedTypes.includes(selectedObj.type);

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
        className="custom-select-container"
        ref={containerRef}
        style={{ width }}
      >
        <div
          className={`custom-select-trigger ${isOpen ? "is-open" : ""}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="trigger-main">
            <span className="preview-wrap">{selectedOption.preview}</span>
          </div>
          <svg
            className="chevron-icon"
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
          <div className="custom-select-dropdown">
            {options.map((opt) => (
              <div
                key={opt.value}
                className={`custom-select-item ${opt.value === value ? "is-selected" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                <span className="item-preview">{opt.preview}</span>
                {opt.value === value && (
                  <svg
                    className="check-icon"
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
        <div
          style={{ width: "24px", height: "2px", background: "currentColor" }}
        />
      ),
    },
    {
      value: "dashed",
      label: "虚线",
      preview: (
        <div
          style={{
            width: "24px",
            height: "2px",
            borderTop: "2px dashed currentColor",
          }}
        />
      ),
    },
    {
      value: "dotted",
      label: "点线",
      preview: (
        <div
          style={{
            width: "24px",
            height: "2px",
            borderTop: "2px dotted currentColor",
          }}
        />
      ),
    },
  ];

  const arrowOptions = [
    {
      value: "single",
      label: "单向",
      preview: (
        <svg width="24" height="12" viewBox="0 0 24 12" fill="currentColor">
          <path
            d="M0 6h18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M24 6l-7-4v8z" />
        </svg>
      ),
    },
    {
      value: "double",
      label: "双向",
      preview: (
        <svg width="24" height="12" viewBox="0 0 24 12" fill="currentColor">
          <path
            d="M6 6h12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path d="M0 6l7-4v8z M24 6l-7-4v8z" />
        </svg>
      ),
    },
    {
      value: "start",
      label: "反向",
      preview: (
        <svg width="24" height="12" viewBox="0 0 24 12" fill="currentColor">
          <path
            d="M6 6h18"
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
        <div
          style={{ width: "24px", height: "2px", background: "currentColor" }}
        />
      ),
    },
  ];

  return (
    <aside className="inspector-panel">
      <div className="panel-header">
        <h3>属性控制</h3>
      </div>

      <div className="inspector-content">
        <div className="property-group">
          <h4 className="group-title">基础参数</h4>

          <div
            className="property-field"
            style={{
              marginBottom: "16px",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <label
              style={{
                width: "70px",
                flexShrink: 0,
                marginBottom: 0,
                fontSize: "0.85rem",
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
              <div className="input-group" style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="number"
                  value={Math.round(selectedObj.x)}
                  onChange={(e) => handleChange("x", e.target.value)}
                  title="X坐标"
                  style={{ padding: "3px 4px", height: "24px" }}
                />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="number"
                  value={Math.round(selectedObj.y)}
                  onChange={(e) => handleChange("y", e.target.value)}
                  title="Y坐标"
                  style={{ padding: "3px 4px", height: "24px" }}
                />
              </div>
              {/* 占位符，使输入框与下方 宽/高 保持等宽 */}
              <div style={{ width: "28px", flexShrink: 0 }} />
            </div>
          </div>

          <div
            className="property-field"
            style={{
              marginBottom: "16px",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <label
              style={{
                width: "70px",
                flexShrink: 0,
                marginBottom: 0,
                fontSize: "0.85rem",
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
              <div className="input-group" style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="number"
                  value={Math.round(selectedObj.width * selectedObj.scaleX)}
                  onChange={(e) =>
                    handleDimensionChange("width", e.target.value)
                  }
                  title="宽度 (px)"
                  style={{ padding: "3px 4px", height: "24px" }}
                />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="number"
                  value={Math.round(selectedObj.height * selectedObj.scaleY)}
                  onChange={(e) =>
                    handleDimensionChange("height", e.target.value)
                  }
                  title="高度 (px)"
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
                title="锁定/解锁 长宽比例"
              >
                {isRatioLocked ? "🔒" : "🔓"}
              </button>
            </div>
          </div>

          <div
            className="property-field"
            style={{
              marginBottom: "16px",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <label
              style={{
                width: "70px",
                flexShrink: 0,
                marginBottom: 0,
                fontSize: "0.85rem",
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
              <div className="input-group" style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="number"
                  value={Math.round(selectedObj.rotation || 0)}
                  onChange={(e) => handleChange("rotation", e.target.value)}
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
                  updateSceneObject(selectedObj.id, {
                    scaleX: 1,
                    scaleY: 1,
                    rotation: 0,
                  })
                }
                title="一键重置尺寸与旋转"
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
              >
                🔄
              </button>
            </div>
          </div>

          <div
            className="property-field"
            style={{
              marginBottom: "16px",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <label
              style={{
                width: "70px",
                flexShrink: 0,
                marginBottom: 0,
                fontSize: "0.85rem",
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
                title="置底"
                style={{
                  flex: 1,
                  padding: "4px",
                  backgroundColor: "var(--bg-color)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "var(--text-main)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "28px",
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
                title="下移一层"
                style={{
                  flex: 1,
                  padding: "4px",
                  backgroundColor: "var(--bg-color)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "var(--text-main)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "28px",
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
                title="上移一层"
                style={{
                  flex: 1,
                  padding: "4px",
                  backgroundColor: "var(--bg-color)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "var(--text-main)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "28px",
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
                title="置顶"
                style={{
                  flex: 1,
                  padding: "4px",
                  backgroundColor: "var(--bg-color)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "var(--text-main)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "28px",
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
        </div>

        {/* 对齐工具 */}
        <div className="property-group">
          <h4 className="group-title">对齐到画布</h4>
          {/* 水平对齐：左对齐 / 水平居中 / 右对齐 */}
          <div className="property-row" style={{ gap: 4, marginBottom: 4 }}>
            {([
              {
                title: '左对齐（左边缘贴画布左边）',
                calc: () => {
                  const hw = Math.round((selectedObj!.width * (selectedObj!.scaleX ?? 1)) / 2);
                  return { x: hw };
                },
                icon: (
                  <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor">
                    <rect x="0" y="0" width="2" height="14" />
                    <rect x="2" y="4" width="7" height="6" opacity="0.45" />
                  </svg>
                ),
                label: '左对齐',
              },
              {
                title: '水平居中（水平方向居中于画布）',
                calc: () => ({ x: Math.round(canvasWidth / 2) }),
                icon: (
                  <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor">
                    <rect x="6" y="0" width="2" height="14" opacity="0.35" />
                    <rect x="3.5" y="4" width="7" height="6" opacity="0.45" />
                    <rect x="6.5" y="0" width="1" height="14" />
                  </svg>
                ),
                label: '水平居中',
              },
              {
                title: '右对齐（右边缘贴画布右边）',
                calc: () => {
                  const hw = Math.round((selectedObj!.width * (selectedObj!.scaleX ?? 1)) / 2);
                  return { x: canvasWidth - hw };
                },
                icon: (
                  <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor">
                    <rect x="12" y="0" width="2" height="14" />
                    <rect x="5" y="4" width="7" height="6" opacity="0.45" />
                  </svg>
                ),
                label: '右对齐',
              },
            ] as const).map((btn) => (
              <button
                key={btn.label}
                title={btn.title}
                onClick={() => selectedObj && updateSceneObject(selectedObj.id, btn.calc())}
                style={{
                  flex: 1, height: 32, border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-main)',
                  borderRadius: 5, cursor: 'pointer', fontSize: 10,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary-color)'; e.currentTarget.style.background = 'rgba(59,130,246,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)';   e.currentTarget.style.background = 'transparent'; }}
              >
                {btn.icon}
                <span style={{ color: 'var(--text-muted)', fontSize: 9, lineHeight: 1 }}>{btn.label}</span>
              </button>
            ))}
          </div>
          {/* 垂直对齐：顶对齐 / 垂直居中 / 底对齐 */}
          <div className="property-row" style={{ gap: 4 }}>
            {([
              {
                title: '顶对齐（上边缘贴画布顶部）',
                calc: () => {
                  const hh = Math.round((selectedObj!.height * (selectedObj!.scaleY ?? 1)) / 2);
                  return { y: hh };
                },
                icon: (
                  <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor">
                    <rect x="0" y="0" width="14" height="2" />
                    <rect x="4" y="2" width="6" height="7" opacity="0.45" />
                  </svg>
                ),
                label: '顶对齐',
              },
              {
                title: '垂直居中（垂直方向居中于画布）',
                calc: () => ({ y: Math.round(canvasHeight / 2) }),
                icon: (
                  <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor">
                    <rect x="0" y="6" width="14" height="2" opacity="0.35" />
                    <rect x="4" y="3.5" width="6" height="7" opacity="0.45" />
                    <rect x="0" y="6.5" width="14" height="1" />
                  </svg>
                ),
                label: '垂直居中',
              },
              {
                title: '底对齐（下边缘贴画布底部）',
                calc: () => {
                  const hh = Math.round((selectedObj!.height * (selectedObj!.scaleY ?? 1)) / 2);
                  return { y: canvasHeight - hh };
                },
                icon: (
                  <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor">
                    <rect x="0" y="12" width="14" height="2" />
                    <rect x="4" y="5" width="6" height="7" opacity="0.45" />
                  </svg>
                ),
                label: '底对齐',
              },
            ] as const).map((btn) => (
              <button
                key={btn.label}
                title={btn.title}
                onClick={() => selectedObj && updateSceneObject(selectedObj.id, btn.calc())}
                style={{
                  flex: 1, height: 32, border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-main)',
                  borderRadius: 5, cursor: 'pointer', fontSize: 10,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary-color)'; e.currentTarget.style.background = 'rgba(59,130,246,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)';   e.currentTarget.style.background = 'transparent'; }}
              >
                {btn.icon}
                <span style={{ color: 'var(--text-muted)', fontSize: 9, lineHeight: 1 }}>{btn.label}</span>
              </button>
            ))}
          </div>
          <div className="property-row" style={{ gap: 4, marginTop: 0 }}>
            <button
              title="复制对象 (Ctrl+D)"
              onClick={() => selectedObj && duplicateObject(selectedObj.id)}
              style={{
                flex: 1, height: 26, border: '1px solid var(--border-color)',
                background: 'transparent', color: 'var(--text-muted)',
                borderRadius: 5, cursor: 'pointer', fontSize: 11,
              }}
            >
              复制
            </button>
            <button
              title="删除对象 (Delete)"
              onClick={() => selectedObj && removeSceneObject(selectedObj.id)}
              style={{
                flex: 1, height: 26, border: '1px solid rgba(239,68,68,0.4)',
                background: 'transparent', color: '#ef4444',
                borderRadius: 5, cursor: 'pointer', fontSize: 11,
              }}
            >
              删除
            </button>
          </div>
        </div>

        {/* 样式设置 - 根据类型动态显示 */}
        <div className="property-group">
          <h4 className="group-title">样式设置</h4>

          {/* 第 1 行：核心颜色与基础属性 (描边颜色/文字颜色 | 填充颜色/线型/字号) */}
          <div
            className="property-field"
            style={{ flexDirection: "row", gap: "28px", marginBottom: "12px" }}
          >
            {/* 左侧：描边颜色 (形状/路径) 或 文字颜色 (文本) */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: "8px",
              }}
            >
              {[
                "rect",
                "circle",
                "triangle",
                "trapezoid",
                "line",
                "arrow",
                "curve",
              ].includes(selectedObj.type) && (
                <>
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    描边颜色：
                  </label>
                  <div className="input-group" style={{ width: "38px" }}>
                    <input
                      type="color"
                      value={selectedObj.style?.stroke || "#000000"}
                      onChange={(e) =>
                        handleStyleChange("stroke", e.target.value)
                      }
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
              {(selectedObj.type === "text" ||
                selectedObj.type === "material") && (
                <>
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    文字颜色：
                  </label>
                  <div className="input-group" style={{ width: "38px" }}>
                    <input
                      type="color"
                      value={selectedObj.style?.fill || "#000000"}
                      onChange={(e) =>
                        handleStyleChange("fill", e.target.value)
                      }
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
            </div>

            {/* 右侧：填充颜色 (形状) 或 线型 (路径) 或 字号 (文本) */}
            <div
              style={{
                flex: 1,
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
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      width: "40px",
                      flexShrink: 0,
                    }}
                  >
                    填充颜色：
                  </label>
                  <div className="input-group" style={{ width: "38px" }}>
                    <input
                      type="color"
                      value={selectedObj.style?.fill || "#000000"}
                      onChange={(e) =>
                        handleStyleChange("fill", e.target.value)
                      }
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
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      width: "40px",
                      flexShrink: 0,
                    }}
                  >
                    线型：
                  </label>
                  <CustomSelect
                    value={(selectedObj.data?.dashStyle as string) || "solid"}
                    onChange={(val) => handleDataChange("dashStyle", val)}
                    options={dashOptions}
                    width="65px"
                  />
                </>
              )}
              {(selectedObj.type === "text" ||
                selectedObj.type === "material") && (
                <>
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    文字大小：
                  </label>
                  <div className="input-group" style={{ width: "44px" }}>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={selectedObj.style?.fontSize || 18}
                      onChange={(e) => {
                        let val = parseInt(e.target.value);
                        if (isNaN(val)) val = 5;
                        if (val < 5) val = 5;
                        if (val > 120) val = 120;
                        handleFontSizeChange(val);
                      }}
                      title="字号 (5-120px)"
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

          {/* 第 2 行：数值与高级样式 (描边粗细/对齐方式 | 圆角/样式) */}
          <div
            className="property-field"
            style={{ flexDirection: "row", gap: "28px", marginBottom: "12px" }}
          >
            {/* 左侧：描边粗细 (形状/路径) 或 对齐方式 (文本-独占) */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: "8px",
              }}
            >
              {[
                "rect",
                "circle",
                "triangle",
                "trapezoid",
                "line",
                "arrow",
                "curve",
              ].includes(selectedObj.type) && (
                <>
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    描边粗细：
                  </label>
                  <div className="input-group" style={{ width: "38px" }}>
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
              {(selectedObj.type === "text" ||
                selectedObj.type === "material") && (
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
                      fontSize: "0.85rem",
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
                          height: "22px",
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
                          borderRadius: "4px",
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        {btn.icon}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 右侧：圆角/半径/样式 (形状/路径) - 文字类不显示此列 */}
            {selectedObj.type !== "text" && selectedObj.type !== "material" && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                {["rect", "triangle", "circle"].includes(selectedObj.type) && (
                  <>
                    <label
                      style={{
                        marginBottom: 0,
                        fontSize: "0.85rem",
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
                    <div className="input-group" style={{ width: "38px" }}>
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
                          } else {
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
                {selectedObj.type === "arrow" && (
                  <>
                    <label
                      style={{
                        marginBottom: 0,
                        fontSize: "0.85rem",
                        whiteSpace: "nowrap",
                        width: "40px",
                        flexShrink: 0,
                      }}
                    >
                      样式：
                    </label>
                    <CustomSelect
                      value={
                        (selectedObj.data?.arrowStyle as string) || "single"
                      }
                      onChange={(val) => handleDataChange("arrowStyle", val)}
                      options={arrowOptions}
                      width="65px"
                    />
                  </>
                )}
                {/* 占位符避免空列导致的抖动 */}
                {!["rect", "triangle", "circle", "arrow"].includes(
                  selectedObj.type,
                ) && <div style={{ flex: 1 }} />}
              </div>
            )}
          </div>

          {basicNamedTypes.includes(selectedObj.type) && (
            <>
              <div
                className="property-field"
                style={{
                  flexDirection: "row",
                  gap: "28px",
                  marginBottom: "12px",
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
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    文字颜色：
                  </label>
                  <div className="input-group" style={{ width: "38px" }}>
                    <input
                      type="color"
                      value={selectedObj.style?.textColor || "#334155"}
                      onChange={(e) =>
                        handleStyleChange("textColor", e.target.value)
                      }
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
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <label
                    style={{
                      marginBottom: 0,
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                      width: "65px",
                      flexShrink: 0,
                    }}
                  >
                    字体大小：
                  </label>
                  <div className="input-group" style={{ width: "44px" }}>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={selectedObj.style?.fontSize || 14}
                      onChange={(e) => {
                        let val = parseInt(e.target.value);
                        if (isNaN(val)) val = 5;
                        if (val < 5) val = 5;
                        if (val > 120) val = 120;
                        handleStyleChange("fontSize", val);
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

              <div
                className="property-field"
                style={{
                  flexDirection: "row",
                  gap: "28px",
                  marginBottom: "12px",
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
                      fontSize: "0.85rem",
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
                          height: "22px",
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
                          borderRadius: "4px",
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
            </>
          )}

          {(selectedObj.type === "text" || isNameDirectionTarget) && (
            <div
              className="property-field"
              style={{
                flexDirection: "row",
                gap: "28px",
                marginBottom: "12px",
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
                    fontSize: "0.85rem",
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
                        height: "22px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "none",
                        backgroundColor:
                          (selectedObj.style?.textDirection || "horizontal") ===
                          btn.id
                            ? "white"
                            : "transparent",
                        color:
                          (selectedObj.style?.textDirection || "horizontal") ===
                          btn.id
                            ? "var(--primary-color)"
                            : "var(--text-muted)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        fontSize: "0.9rem",
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="property-group">
          <h4 className="group-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>动画片段</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
              {(selectedObj?.animationIds || []).length > 0
                ? `共 ${(selectedObj?.animationIds || []).length} 个`
                : '无'}
            </span>
          </h4>
          {(() => {
            const clips = animations
              .filter((a) => selectedObj?.animationIds?.includes(a.id))
              .sort((a, b) => a.startTimeMs - b.startTimeMs);
            if (clips.length === 0) {
              return (
                <div className="property-row">
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    在下方时间线面板中添加动画片段
                  </span>
                </div>
              );
            }
            return clips.map((clip) => {
              const startS = (clip.startTimeMs / 1000).toFixed(1);
              const endS = ((clip.startTimeMs + clip.durationMs) / 1000).toFixed(1);
              const canActivate = clip.type === 'move' || clip.type === 'moveAlongPath';
              const dotColor = CLIP_TYPE_COLORS[clip.type] || '#64748b';
              return (
                <div
                  key={clip.id}
                  className="property-row"
                  onClick={() => canActivate && setExpandedAnimationClipId(clip.id)}
                  style={{
                    cursor: canActivate ? 'pointer' : 'default',
                    borderRadius: '4px',
                    padding: '3px 4px',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (canActivate) e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  title={canActivate ? '点击在画布上显示路径手柄' : undefined}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {CLIP_TYPE_LABELS[clip.type] ?? clip.type}
                    </span>
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {startS}s → {endS}s
                  </span>
                  {clip.enabled === false && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 4 }}>已禁用</span>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </aside>
  );
}
