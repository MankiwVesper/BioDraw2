import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import '@fontsource-variable/inter/index.css'
import './index.css'
import './styles/theme-v2.css'
import App from './App.tsx'

// v2 视觉刷新现为默认主题:给 <html> 挂 data-ui="v2" 令 token 层接管。
// 逃生开关:?ui=legacy 时不挂属性,回退到旧 UI(走 var 回退值)。
if (new URLSearchParams(window.location.search).get('ui') !== 'legacy') {
  document.documentElement.dataset.ui = 'v2'
}

Konva.pixelRatio = Math.max(2, window.devicePixelRatio)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
