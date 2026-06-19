import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Test config kept separate from vite.config.ts so the build pipeline stays untouched. Decorator support is needed because the inversify-based models are pulled in transitively by the units under test.
export default defineConfig({
  plugins: [
    nodePolyfills({ include: ['buffer', 'zlib', 'stream', 'util'] }),
    react({ tsDecorators: true }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Excluded: files with no testable logic — pure hardcoded markup, type declarations, DI wiring and trivial env shims. Testing these would only assert against hardcoded constants, which the project deliberately avoids.
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/ui/assets/**', // pure SVG icon components
        'src/**/*.d.ts',
        'src/vite-env.d.ts',
        'src/main.tsx', // React root bootstrap
        'src/**/dtos/**', // type-only DTOs
        'src/core/shared/inversify.config.ts', // DI container wiring
        'src/core/shared/types.ts', // DI symbol table
        'src/core/shared/usecase.ts', // abstract base interface
        'src/core/shared/env.ts', // env var shim
        'src/core/shared/logger.ts', // console wrapper
        'src/core/realtime/models/message.ts', // type-only
        'src/core/realtime/constants/realtime.const.ts', // pure constants
        'src/ui/routes/routes.enum.ts', // route path enum
        'src/ui/shared/icons.ts', // icon constant map
        'src/ui/shared/colors.ts', // colour constant map
      ],
      thresholds: {
        branches: 90,
        lines: 75,
      },
    },
  },
});
