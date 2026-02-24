import { describe, expect, it } from 'vitest';

import {
  isSafeExternalHttpUrl,
  shouldOpenExternalLink,
} from './linkBehavior';

describe('shouldOpenExternalLink', () => {
  it('allows cmd/ctrl + primary click for valid http(s) URLs', () => {
    expect(
      shouldOpenExternalLink('https://example.com', {
        button: 0,
        metaKey: true,
        ctrlKey: false,
      }),
    ).toBe(true);

    expect(
      shouldOpenExternalLink('http://example.com/path', {
        button: 0,
        metaKey: false,
        ctrlKey: true,
      }),
    ).toBe(true);
  });

  it('denies plain primary click', () => {
    expect(
      shouldOpenExternalLink('https://example.com', {
        button: 0,
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBe(false);
  });

  it('denies right and middle clicks', () => {
    expect(
      shouldOpenExternalLink('https://example.com', {
        button: 1,
        metaKey: true,
        ctrlKey: false,
      }),
    ).toBe(false);

    expect(
      shouldOpenExternalLink('https://example.com', {
        button: 2,
        metaKey: false,
        ctrlKey: true,
      }),
    ).toBe(false);
  });
});

describe('isSafeExternalHttpUrl', () => {
  it('denies non-http(s) and malformed URLs', () => {
    expect(isSafeExternalHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalHttpUrl('file:///tmp/test.txt')).toBe(false);
    expect(isSafeExternalHttpUrl('notaurl')).toBe(false);
  });
});
