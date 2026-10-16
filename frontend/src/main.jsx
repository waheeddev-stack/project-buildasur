import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { useTheme } from './store.js';

function ThemedBoot({ children }) {
  const apply = useTheme((s) => s.apply);
  useEffect(() => {
    apply();
  }, [apply]);
  return children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemedBoot>
      <App />
    </ThemedBoot>
  </StrictMode>
);
