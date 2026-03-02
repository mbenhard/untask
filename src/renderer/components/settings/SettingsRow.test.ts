// @vitest-environment jsdom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SettingsRow } from './SettingsRow';

describe('SettingsRow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    document.body.removeChild(container);
  });

  it('renders children even when loading=true (skeleton removed)', () => {
    flushSync(() => {
      root.render(
        createElement(
          SettingsRow,
          { label: 'AI provider', loading: true },
          createElement('span', null, 'OpenAI'),
        ),
      );
    });

    expect(container.querySelector('[data-testid="settings-row-loading-skeleton"]')).toBeNull();
    expect(container.textContent?.includes('OpenAI')).toBe(true);
  });

  it('renders children when loading=false', () => {
    flushSync(() => {
      root.render(
        createElement(
          SettingsRow,
          { label: 'AI provider', loading: false },
          createElement('span', null, 'OpenAI'),
        ),
      );
    });

    expect(container.textContent?.includes('OpenAI')).toBe(true);
  });
});
