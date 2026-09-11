import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';

// `cbsbd` serves itself under a UUID for obscurity and reads it from
// config/site.json. `cbsbd3d` decided against that; this follows the later call,
// so the base path is a literal and there is no config file to keep in sync.
const base = '/numberwang/';

// Dev-only: serve repo-root puzzles/ at <base>puzzles/ (in production the
// deploy workflow copies puzzles/ into the artifact at the same path).
function servePuzzles(): Plugin {
  return {
    name: 'serve-puzzles',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = `${base}puzzles/`;
        if (!req.url || !req.url.startsWith(prefix)) return next();
        const name = req.url.slice(prefix.length).split('?')[0];
        if (!/^[\w.-]+\.json$/.test(name)) return next();
        const file = path.resolve(process.cwd(), 'puzzles', name);
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: 'site',
  base,
  plugins: [react(), servePuzzles()],
});
