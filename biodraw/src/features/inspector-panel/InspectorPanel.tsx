
import { useEditorStore } from '../../state/editorStore';
import './InspectorPanel.css';

export function InspectorPanel() {
  const isRatioLocked = useEditorStore(state => state.isRatioLocked);
  const setIsRatioLocked = useEditorStore(state => state.setIsRatioLocked);
  const selectedIds = useEditorStore(state => state.selectedIds);
  const objects = useEditorStore(state => state.objects);
  const updateSceneObject = useEditorStore(state => state.updateSceneObject);
  
  const moveObjectForward = useEditorStore(state => state.moveObjectForward);
  const moveObjectBackward = useEditorStore(state => state.moveObjectBackward);
  const moveObjectToFront = useEditorStore(state => state.moveObjectToFront);
  const moveObjectToBack = useEditorStore(state => state.moveObjectToBack);

  const selectedObj = selectedIds.length > 0 
    ? objects.find(o => o.id === selectedIds[0]) 
    : null;

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

  const handleDimensionChange = (field: 'width' | 'height', val: string) => {
    let num = parseFloat(val);
    if (isNaN(num) || num < 1) num = 1;
    
    if (field === 'width') {
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

  return (
    <aside className="inspector-panel">
      <div className="panel-header">
        <h3>属性控制</h3>
      </div>
      
      <div className="inspector-content">
        <div className="property-group">
          <h4 className="group-title">基础参数</h4>
          
          <div className="property-field" style={{ marginBottom: '16px', flexDirection: 'row', alignItems: 'center' }}>
            <label style={{ width: '100px', flexShrink: 0, marginBottom: 0 }}>X轴 / Y轴：</label>
            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
              <div className="input-group">
                <input 
                  type="number" 
                  value={Math.round(selectedObj.x)} 
                  onChange={e => handleChange('x', e.target.value)} 
                  title="X坐标"
                />
              </div>
              <div className="input-group">
                <input 
                  type="number" 
                  value={Math.round(selectedObj.y)}
                  onChange={e => handleChange('y', e.target.value)}
                  title="Y坐标"
                />
              </div>
            </div>
          </div>
          
          <div className="property-field" style={{ marginBottom: '16px', flexDirection: 'row', alignItems: 'center' }}>
            <label style={{ width: '100px', flexShrink: 0, marginBottom: 0 }}>宽/高(px)：</label>
            <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
              <div className="input-group">
                <input 
                  type="number" 
                  value={Math.round(selectedObj.width * selectedObj.scaleX)}
                  onChange={e => handleDimensionChange('width', e.target.value)}
                  title="宽度 (px)"
                />
              </div>
              <div className="input-group">
                <input 
                  type="number" 
                  value={Math.round(selectedObj.height * selectedObj.scaleY)}
                  onChange={e => handleDimensionChange('height', e.target.value)}
                  title="高度 (px)"
                />
              </div>
              <button 
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
                  fontSize: '1rem', color: isRatioLocked ? 'var(--primary-color)' : 'var(--text-muted)'
                }}
                onClick={() => setIsRatioLocked(!isRatioLocked)}
                title="锁定/解锁 长宽比例"
              >
                {isRatioLocked ? '🔒' : '🔓'}
              </button>
            </div>
          </div>

          <div className="property-field" style={{ marginBottom: '16px', flexDirection: 'row', alignItems: 'center' }}>
            <label style={{ width: '100px', flexShrink: 0, marginBottom: 0 }}>旋转角度：</label>
            <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
              <div className="input-group" style={{ flex: 1 }}>
                <input 
                  type="number" 
                  value={Math.round(selectedObj.rotation || 0)}
                  onChange={e => handleChange('rotation', e.target.value)}
                />
              </div>
              <button 
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
                  fontSize: '1.1rem', color: 'var(--text-main)', opacity: 0.8
                }}
                onClick={() => updateSceneObject(selectedObj.id, { scaleX: 1, scaleY: 1, rotation: 0 })}
                title="一键重置尺寸与旋转"
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.8'}
              >
                🔄
              </button>
            </div>
          </div>
          
          <div className="property-field" style={{ marginBottom: '16px', flexDirection: 'row', alignItems: 'center' }}>
            <label style={{ width: '100px', flexShrink: 0, marginBottom: 0 }}>图层顺序：</label>
            <div style={{ display: 'flex', gap: '8px', flex: 1, justifyContent: 'space-between' }}>
              <button 
                onClick={() => moveObjectToBack(selectedObj.id)} 
                title="置底" 
                style={{ flex: 1, padding: '4px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '28px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="3" x2="12" y2="17" />
                  <polyline points="19 10 12 17 5 10" />
                  <line x1="4" y1="21" x2="20" y2="21" />
                </svg>
              </button>
              <button 
                onClick={() => moveObjectBackward(selectedObj.id)} 
                title="下移一层" 
                style={{ flex: 1, padding: '4px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '28px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </button>
              <button 
                onClick={() => moveObjectForward(selectedObj.id)} 
                title="上移一层" 
                style={{ flex: 1, padding: '4px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '28px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
              <button 
                onClick={() => moveObjectToFront(selectedObj.id)} 
                title="置顶" 
                style={{ flex: 1, padding: '4px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '28px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="21" x2="12" y2="7" />
                  <polyline points="5 14 12 7 19 14" />
                  <line x1="4" y1="3" x2="20" y2="3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <div className="property-group">
          <h4 className="group-title">动画设置 (即将推出)</h4>
          <div className="property-row">
             <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
               由于当前核心模块为绘图操作，高级动画与关键帧插值参数表将在 M5 阶段陆续释出。
             </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
