import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './assets/icons/icon',
    extraResource: ['./drizzle', './assets/tray', './assets/icons/Assets.car', './resources/bin/untask-helper'],
    extendInfo: {
      CFBundleIconName: 'icon',
      NSRemindersFullAccessUsageDescription:
        'Untask syncs your tasks with due dates to Reminders so you can check them off on your phone.',
      NSRemindersUsageDescription:
        'Untask syncs your tasks with due dates to Reminders so you can check them off on your phone.',
    },
    // Override the Vite plugin's default ignore to include native modules.
    // The Vite plugin excludes everything except /.vite, but better-sqlite3
    // is a native module that can't be bundled by Vite (marked as external).
    ignore: (file: string) => {
      if (!file) return false;
      if (file.startsWith('/.vite')) return false;
      // Allow descending into node_modules to pick up native deps
      if (file === '/node_modules') return false;
      if (file.startsWith('/node_modules/better-sqlite3')) return false;
      if (file.startsWith('/node_modules/bindings')) return false;
      if (file.startsWith('/node_modules/file-uri-to-path')) return false;
      return true;
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          // Use a named input so preload emits `preload.js` instead of colliding with main `index.js`.
          entry: {
            preload: 'src/preload/index.ts',
          },
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
