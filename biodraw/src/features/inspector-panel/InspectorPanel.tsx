
import { useEditorStore } from '../../state/editorStore';
import './InspectorPanel.css';

export function InspectorPanel() {
  const isRatioLocked = useEditorStore(state => state.isRatioLocked);
  const setIsRatioLocked = useEditorStore(state => state.setIsRatioLocked);
  const selectedIds = useEditorStore(state => state.selectedIds);
  const objects = useEditorStore(state => state.objects);
  const updateSceneObject = useEditorStore(state => state.updateSceneObject);

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
