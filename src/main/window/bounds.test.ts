import { describe, it, expect } from 'vitest';

import { parseBoundsJson } from './bounds';

describe('parseBoundsJson', () => {
  it('returns null for null input', () => {
    expect(parseBoundsJson(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseBoundsJson('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseBoundsJson('{invalid')).toBeNull();
  });

  it('returns null for JSON missing required fields', () => {
    expect(parseBoundsJson('{"x": 0, "y": 0}')).toBeNull();
  });

  it('returns null for JSON with non-number fields', () => {
    expect(
      parseBoundsJson('{"x": "0", "y": 0, "width": 100, "height": 100}'),
    ).toBeNull();
  });

  it('parses valid bounds JSON', () => {
    const json = '{"x": 100, "y": 200, "width": 680, "height": 720}';
    expect(parseBoundsJson(json)).toEqual({
      x: 100,
      y: 200,
      width: 680,
      height: 720,
    });
  });
});
