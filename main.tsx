import '@fontsource-variable/fraunces/wght-italic.css'
import '@fontsource-variable/fraunces/wght.css'
import '@fontsource-variable/figtree/wght.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
