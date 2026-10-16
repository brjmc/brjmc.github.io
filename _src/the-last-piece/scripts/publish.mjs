// Copy the built game (dist/) into the site's served folder: <repo>/the-last-piece/.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const target = join(here, '..', '..', '..', 'the-last-piece');
if (!existsSync(join(dist, 'index.html'))) throw new Error('run `npm run build` first');
if (existsSync(target)) for (const f of readdirSync(target)) rmSync(join(target, f), { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
console.log('published', dist, '->', target);
