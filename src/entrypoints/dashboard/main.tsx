import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from '@/lib/theme';
import { App } from './App';
import '@/assets/tailwind.css';

// 先设好 data-theme 再渲染，避免首屏闪一下错误的深浅色
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
