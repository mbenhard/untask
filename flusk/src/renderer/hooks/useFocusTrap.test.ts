// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFocusableElements, FOCUSABLE_SELECTOR } from './useFocusTrap';

describe('getFocusableElements', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('returns buttons and inputs inside container', () => {
    container.innerHTML = `
      <button>One</button>
      <input type="text" />
      <button disabled>Disabled</button>
      <div tabindex="0">Focusable div</div>
      <div tabindex="-1">Not focusable via tab</div>
    `;

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(3); // button, input, tabindex=0 div
  });

  it('returns empty array for container with no focusable elements', () => {
    container.innerHTML = '<p>No focusable elements</p>';
    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(0);
  });
});
