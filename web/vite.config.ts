import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins:
    [
      nodePolyfills({
        include: ['buffer', 'zlib', 'stream', 'util']
      }),
      react({ tsDecorators: true }),

    ],
  build: {
    sourcemap: true,
  }
});
