import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';

import App from './App';
import { ThemeProvider } from './components/providers/ThemeProvider';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Renderer root element (#root) is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
