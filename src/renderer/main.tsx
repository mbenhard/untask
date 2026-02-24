import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-ext-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-ext-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist/latin-ext-600.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-ext-400.css';
import '@fontsource/geist-mono/latin-500.css';
import '@fontsource/geist-mono/latin-ext-500.css';

import App from './App';
import { ThemeProvider } from './components/providers/ThemeProvider';
import { TypographyProvider } from './components/providers/TypographyProvider';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Renderer root element (#root) is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <TypographyProvider>
        <App />
      </TypographyProvider>
    </ThemeProvider>
  </StrictMode>,
);
