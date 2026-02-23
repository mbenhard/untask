import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';

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
