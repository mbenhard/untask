import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';

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
