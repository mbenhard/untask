import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: vi.fn(),
    getPrimaryDisplay: vi.fn(),
  },
}));

import { screen } from 'electron';
import { resolveTargetBounds, type WindowBounds } from './bounds';

const mockGetAllDisplays = vi.mocked(screen.getAllDisplays);
const mockGetPrimaryDisplay = vi.mocked(screen.getPrimaryDisplay);

const PRIMARY_WORK_AREA = { x: 0, y: 0, width: 1440, height: 900 };

describe('resolveTargetBounds', () => {
  beforeEach(() => {
    mockGetAllDisplays.mockReset();
    mockGetPrimaryDisplay.mockReset();
    mockGetAllDisplays.mockReturnValue([{ workArea: PRIMARY_WORK_AREA }] as never);
    mockGetPrimaryDisplay.mockReturnValue({ workArea: PRIMARY_WORK_AREA } as never);
  });

  it('returns stored bounds when they are on-screen', () => {
    const stored: WindowBounds = { x: 100, y: 120, width: 680, height: 720 };
    const result = resolveTargetBounds(stored, 680, 720);
    expect(result).toEqual(stored);
  });

  it('recenters when stored bounds are off-screen', () => {
    const stored: WindowBounds = { x: 5000, y: 5000, width: 680, height: 720 };
    const result = resolveTargetBounds(stored, 680, 720);

    expect(result).toEqual({
      x: 380,
      y: 90,
      width: 680,
      height: 720,
    });
  });

  it('centers when there are no stored bounds', () => {
    const result = resolveTargetBounds(null, 680, 720);

    expect(result).toEqual({
      x: 380,
      y: 90,
      width: 680,
      height: 720,
    });
  });
});
