import './ToolbarPanel.css';

export function ToolbarPanel() {
  return (
    <header className="toolbar-panel">
      <div className="toolbar-left">
        <div className="logo">BioDraw</div>
        <div className="menu-items">
          <button className="menu-btn">新建</button>
          <button className="menu-btn">保存</button>
          <button className="menu-btn">导出</button>
        </div>
      </div>
      <div className="toolbar-center">
        <div className="play-controls">
          <button className="control-btn play">播放</button>
          <button className="control-btn pause">暂停</button>
          <button className="control-btn stop">停止</button>
        </div>
      </div>
      <div className="toolbar-right">
        <span className="status-text">就绪</span>
      </div>
    </header>
  );
}
