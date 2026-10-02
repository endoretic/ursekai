import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('./public/', import.meta.url));
if (resolve(output) !== resolve(root, 'worker/public')) throw new Error('Invalid asset output directory');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

// Only public UI assets enter the deployment; local payloads and settings stay outside it.
const files = execFileSync('git', ['ls-files', '-z', '--', 'index.html', 'paint_local.html', 'css', 'js', 'img', 'icon'],
    { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const assets = files.filter(file => !file.endsWith('.py'));
for (const file of assets) {
    mkdirSync(dirname(resolve(output, file)), { recursive: true });
    cpSync(resolve(root, file), resolve(output, file));
}
console.log(`Staged ${assets.length} public files.`);
