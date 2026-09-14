import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@/assets/tailwind.css';

console.log('[v0] main.tsx executing, root=', document.getElementById('root'));
try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log('[v0] render called');
} catch (e) {
  console.log('[v0] render threw', e);
}
