import { useMemo, useState } from 'react';
import './MaterialsPanel.css';

const svgModules = import.meta.glob<{ default: string }>('/src/assets/svgs/**/*.svg', { eager: true });

const basicShapes = [
  { type: 'rect', name: '矩形', icon: '■', style: { fill: '#3b82f6', stroke: '#1d4ed8', strokeWidth: 1 } },
  { type: 'circle', name: '圆形', icon: '●', style: { fill: '#ef4444', stroke: '#b91c1c', strokeWidth: 1 } },
  { type: 'triangle', name: '三角形', icon: '▲', style: { fill: '#10b981', stroke: '#047857', strokeWidth: 1 } },
  { type: 'trapezoid', name: '梯形', icon: '⏢', style: { fill: '#f59e0b', stroke: '#b45309', strokeWidth: 1 } },
  { type: 'arrow', name: '箭头', icon: '↗', data: { points: [0, 100, 100, 0] }, style: { stroke: '#334155', strokeWidth: 2 } },
  { type: 'line', name: '直线', icon: '╱', data: { points: [0, 100, 100, 0] }, style: { stroke: '#334155', strokeWidth: 2 } },
  { type: 'curve', name: '曲线', icon: '〜', data: { points: [0, 50, 50, 0, 100, 50] }, style: { stroke: '#4f46e5', strokeWidth: 3 } },
  { type: 'text', name: '文本', icon: 'T', style: { fill: '#1e293b', fontSize: 18 } },
];

export function MaterialsPanel() {
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  const { categories, materials } = useMemo(() => {
    const rawMaterials = Object.entries(svgModules).map(([path, module]) => {
      const parts = path.split('/');
      const category = parts[4] || '未分类';
      const filename = parts[parts.length - 1];
      const name = filename.replace(/\.svg$/, '');

      return {
        id: path,
        category,
        name,
        url: module.default,
      };
    });

    const cats = Array.from(new Set(rawMaterials.map((material) => material.category))).sort();
    return { categories: cats, materials: rawMaterials };
  }, []);

  const isExpanded = (cat: string) => {
    if (expandedCats[cat] !== undefined) return expandedCats[cat];
    if (searchQuery) return true;
    return false;
  };

  const toggleCat = (cat: string) => {
    const currentlyExpanded = isExpanded(cat);
    setExpandedCats((prev) => ({ ...prev, [cat]: !currentlyExpanded }));
  };

  const visibleCategories = useMemo(() => {
    let cats = categories;

    if (filterCategory) {
      cats = cats.filter((cat) => cat === filterCategory);
    }

    if (searchQuery) {
      const matchingCats = new Set(
        materials
          .filter((material) => material.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((material) => material.category),
      );
      cats = cats.filter((cat) => matchingCats.has(cat));
    }

    return cats;
  }, [categories, filterCategory, searchQuery, materials]);

  return (
    <aside className="materials-panel">
      <div className="panel-header">
        <h3>素材库</h3>
      </div>

      <div className="panel-controls">
        <select
          className="category-dropdown"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          title="筛选分类"
        >
          <option value="">全部分类</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="搜索素材..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setExpandedCats({});
          }}
        />
      </div>

      <div className="accordion-list">
        <div className="accordion-section" key="basic-tools">
          <div className="accordion-header" onClick={() => toggleCat('basic-tools')}>
            <span className={`accordion-icon ${isExpanded('basic-tools') ? 'expanded' : ''}`}>
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
            <span className="accordion-title">基础工具</span>
          </div>
          {isExpanded('basic-tools') && (
            <div className="materials-grid">
              {basicShapes.map((shape) => (
                <div
                  className="material-item"
                  key={shape.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/biodraw-material',
                      JSON.stringify({
                        type: shape.type,
                        name: shape.name,
                        width: shape.type === 'text' ? 120 : 100,
                        height: shape.type === 'text' ? 40 : 100,
                        data: shape.data,
                        style: shape.style,
                      }),
                    );
                  }}
                >
                  <div className="material-preview shape-preview">
                    {shape.type === 'trapezoid' ? (
                      <span
                        className="shape-icon"
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: '24px',
                          height: '18px',
                          backgroundColor: 'currentColor',
                          clipPath: 'polygon(22% 0%, 78% 0%, 100% 100%, 0% 100%)',
                        }}
                      />
                    ) : (
                      <span className="shape-icon">{shape.icon}</span>
                    )}
                  </div>
                  <span className="material-name">{shape.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {visibleCategories.map((cat) => {
          const expanded = isExpanded(cat);
          const catMaterials = materials.filter(
            (material) =>
              material.category === cat &&
              (!searchQuery || material.name.toLowerCase().includes(searchQuery.toLowerCase())),
          );

          if (catMaterials.length === 0) return null;

          return (
            <div className="accordion-section" key={cat}>
              <div className="accordion-header" onClick={() => toggleCat(cat)}>
                <span className={`accordion-icon ${expanded ? 'expanded' : ''}`}>
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </span>
                <span className="accordion-title">{cat}</span>
              </div>

              {expanded && (
                <div className="materials-grid">
                  {catMaterials.map((item) => (
                    <div
                      className="material-item"
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        const img = e.currentTarget.querySelector('img');
                        let w = 80;
                        let h = 80;

                        if (img && img.naturalWidth) {
                          w = img.naturalWidth;
                          h = img.naturalHeight;

                          const maxDim = 160;
                          if (w > maxDim || h > maxDim) {
                            const ratio = Math.min(maxDim / w, maxDim / h);
                            w *= ratio;
                            h *= ratio;
                          }
                        }

                        if (img) {
                          e.dataTransfer.setDragImage(img, img.clientWidth / 2, img.clientHeight / 2);
                        }

                        e.dataTransfer.setData(
                          'application/biodraw-material',
                          JSON.stringify({
                            materialId: item.id,
                            url: item.url,
                            name: item.name,
                            width: w,
                            height: h,
                          }),
                        );
                      }}
                    >
                      <div className="material-preview">
                        <img
                          src={item.url}
                          alt={item.name}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      </div>
                      <span className="material-name" title={item.name}>
                        {item.name.length > 8 ? `${item.name.substring(0, 8)}...` : item.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {visibleCategories.length === 0 && <div className="empty-message">暂无匹配的素材</div>}
      </div>
    </aside>
  );
}
