import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-ext-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-ext-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist/latin-ext-600.css';

import { QuickAddApp } from './components/quick-add/QuickAddApp';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Quick add root element (#root) is missing from quick-add.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <QuickAddApp />
  </StrictMode>,
);
