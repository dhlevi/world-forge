import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Development only: lets the tileset template page (src/dev/tileset-template.ts, opened by
 * `npm run tileset:template`) write its three files beside the tileset in public/tileset. Only
 * those three names can be written.
 */
function tilesetTemplate(): Plugin {
  const files = new Set(['tileset-template.png', 'tileset-template-key.png', 'tileset-template.json']);
  return {
    name: 'tileset-template',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__tileset-template/', (req, res) => {
        const name = (req.url ?? '').replace(/^\//, '');
        if (req.method !== 'POST' || !files.has(name)) {
          res.statusCode = 404;
          res.end('Not a tileset template file.');
          return;
        }
        const parts: Buffer[] = [];
        req.on('data', (c: Buffer) => parts.push(c));
        req.on('end', () => {
          writeFile(fileURLToPath(new URL(`./public/tileset/${name}`, import.meta.url)), Buffer.concat(parts))
            .then(() => {
              server.config.logger.info(`tileset template: wrote public/tileset/${name}`);
              res.end('ok');
            })
            .catch((e: unknown) => {
              res.statusCode = 500;
              res.end(String(e));
            });
        });
      });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue(), tilesetTemplate()],
  worker: { format: 'es' },
  server: { port: 5180 },
});
