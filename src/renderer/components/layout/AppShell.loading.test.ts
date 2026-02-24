import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AppShell lazy fallbacks', () => {
  it('uses non-null skeleton fallbacks for lazy route surfaces', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'src/renderer/components/layout/AppShell.tsx'),
      'utf8',
    );

    expect(source).toContain('fallback={<TaskViewSkeleton />}');
    expect(source).toContain('fallback={<NotesViewSkeleton />}');
    expect(source).toContain('fallback={<SettingsViewSkeleton />}');
    expect(source).toContain('fallback={isSearchOpen ? <SearchModalSkeleton /> : null}');
  });
});
