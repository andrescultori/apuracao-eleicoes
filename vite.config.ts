/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// GitHub Pages de projeto serve o site em /<repo>/, não na raiz do domínio —
// diferente do Netlify, que serve na raiz. BASE_PATH permite ajustar isso só
// no build do GitHub Pages (ver .github/workflows/deploy-pages.yml) sem afetar
// o build padrão (Netlify, `npm run dev`/`preview` locais).
const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
