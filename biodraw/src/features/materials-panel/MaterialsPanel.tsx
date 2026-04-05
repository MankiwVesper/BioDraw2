import { useState, useMemo } from 'react';
import './MaterialsPanel.css';

// 动态使用 Vite 批量导入 src/assets/svgs 下的所有 svg 文件
const svgModules = import.meta.glob<{ default: string }>('/src/assets/svgs/**/*.svg', { eager: true });

export function MaterialsPanel() {
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 保存每个分类是否被展开的状态
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // 解析并分类素材信息
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

    const cats = Array.from(new Set(rawMaterials.map(m => m.category))).sort();
    return { categories: cats, materials: rawMaterials };
  }, []);

  // 切换折叠面板状态
  const toggleCat = (cat: string) => {
    const currentlyExpanded = isExpanded(cat);
    setExpandedCats(prev => ({ ...prev, [cat]: !currentlyExpanded }));
  };

  // 判断是否应该处于展开状态
  const isExpanded = (cat: string) => {
    if (expandedCats[cat] !== undefined) return expandedCats[cat];
    if (searchQuery) return true; // 有搜索文本且用户未手动干预时，默认展开
    return false; // 初始装载时默认全部收起
  };

  // 过滤出需要渲染的分类层级
  const visibleCategories = useMemo(() => {
    let cats = categories;
    if (filterCategory) {
      cats = cats.filter(c => c === filterCategory);
    }
    if (searchQuery) {
      const matchingCats = new Set(
        materials
          .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(m => m.category)
      );
      cats = cats.filter(c => matchingCats.has(c));
    }
    return cats;
  }, [categories, filterCategory, searchQuery, materials]);

  return (
    <aside className="materials-panel">
      <div className="panel-header">
        <h3>素材库</h3>
      </div>
      
      {/* 顶部：横向排列的筛选与搜索控制区 */}
      <div className="panel-controls">
        <select 
          className="category-dropdown" 
          value={filterCategory} 
          onChange={(e) => setFilterCategory(e.target.value)}
          title="筛选分类"
        >
          <option value="">全部分类</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        
        <input 
          type="text" 
          placeholder="搜索素材..." 
          className="search-input"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setExpandedCats({}); // 搜索词变动时清空干预状态，让结果回归自动全开
          }}
        />
      </div>
      
      {/* 下方：垂直排列折叠列表区 */}
      <div className="accordion-list">
        {visibleCategories.map(cat => {
          const expanded = isExpanded(cat);
          const catMaterials = materials.filter(m => 
            m.category === cat && 
            (!searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()))
          );
          
          if (catMaterials.length === 0) return null;
          
          return (
            <div className="accordion-section" key={cat}>
              <div className="accordion-header" onClick={() => toggleCat(cat)}>
                <span className={`accordion-icon ${expanded ? 'expanded' : ''}`}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                          // 约束初次拖拽入画布的最大尺寸，防止过大，保持高宽比
                          const maxDim = 160;
                          if (w > maxDim || h > maxDim) {
                            const ratio = Math.min(maxDim / w, maxDim / h);
                            w *= ratio;
                            h *= ratio;
                          }
                        }
                        
                        // 使用内部的 img 元素作为原生的拖拽幽灵图像，避免整个 div 被拉伸截图导致变形
                        if (img) {
                          e.dataTransfer.setDragImage(img, img.clientWidth / 2, img.clientHeight / 2);
                        }
                        
                        e.dataTransfer.setData('application/biodraw-material', JSON.stringify({
                          materialId: item.id,
                          url: item.url,
                          name: item.name,
                          width: w,
                          height: h
                        }));
                      }}
                    >
                      <div className="material-preview">
                        <img src={item.url} alt={item.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                      <span className="material-name" title={item.name}>
                        {item.name.length > 8 ? item.name.substring(0, 8) + '...' : item.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {visibleCategories.length === 0 && (
          <div className="empty-message">暂无匹配的素材</div>
        )}
      </div>
    </aside>
  );
}
