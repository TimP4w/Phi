import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins:
    [
      tailwindcss(),
      nodePolyfills({
        include: ['buffer', 'zlib', 'stream', 'util']
      }),
      react({ tsDecorators: true }),

    ],
  build: {
    sourcemap: mode !== 'production',
  },
}));
