import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app'),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

// Provide process.resourcesPath for test environment
Object.defineProperty(process, 'resourcesPath', {
  value: '/mock/resources',
  writable: true,
});

import fs from 'node:fs';
import { getTrayIconPath } from './trayIcon';

const mockExistsSync = vi.mocked(fs.existsSync);

describe('getTrayIconPath', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
  });

  it('prefers packaged path when it exists', () => {
    mockExistsSync.mockImplementation((p) => {
      return String(p).includes('/mock/resources');
    });

    const result = getTrayIconPath();
    expect(result).toContain('/mock/resources');
    expect(result).toContain('trayTemplate.png');
  });

  it('falls back to dev path when packaged path is missing', () => {
    mockExistsSync.mockImplementation((p) => {
      return String(p).includes('/mock/app/assets');
    });

    const result = getTrayIconPath();
    expect(result).toContain('/mock/app');
    expect(result).toContain('trayTemplate.png');
  });

  it('returns dev path when no icon found anywhere', () => {
    mockExistsSync.mockReturnValue(false);

    const result = getTrayIconPath();
    expect(result).toContain('trayTemplate.png');
  });
});
