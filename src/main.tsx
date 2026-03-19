import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Persist ?ref= code immediately on page load — before any auth or React rendering.
// localStorage survives OAuth popups, redirects, and page refreshes.
const _refParam = new URLSearchParams(window.location.search).get('ref');
if (_refParam) {
  localStorage.setItem('pendingRef', _refParam);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
