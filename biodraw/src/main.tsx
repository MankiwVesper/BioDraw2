import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import './index.css'
import App from './App.tsx'

Konva.pixelRatio = Math.max(2, window.devicePixelRatio)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
