import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import '@fontsource-variable/inter/index.css'
import './index.css'
import './styles/theme-v2.css'
import App from './App.tsx'

// v2 视觉刷新开关:?ui=v2 时给 <html> 挂 data-ui="v2",令 token 层接管;
// 不命中则不设属性,默认 UI 完全不受影响。
if (new URLSearchParams(window.location.search).get('ui') === 'v2') {
  document.documentElement.dataset.ui = 'v2'
}

Konva.pixelRatio = Math.max(2, window.devicePixelRatio)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
