import { mkdir, copyFile, cp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const html = readFileSync('乘法猫猫乐园.html', 'utf8');
await copyFile('乘法猫猫乐园.html', 'dist/index.html');
await copyFile('乘法猫猫乐园.html', 'dist/乘法猫猫乐园.html');
for (const file of ['cat-home.js', 'cat-world.js', 'cat-navigation.js', 'cloud-game.js', 'cloud-game.css']) {
  await copyFile(file, `dist/${file}`);
}
await cp('vendor', 'dist/vendor', { recursive: true });
await writeFile('dist/_headers', '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  X-Frame-Options: DENY\n');

// Keep the backend's breed catalogue and food rules aligned with the existing game.
const rules = html.slice(html.indexOf('const BREEDS ='), html.indexOf('const FOOD_BOWL ='));
const context = vm.createContext({});
vm.runInContext(`${rules}\nglobalThis.rules = { breeds: BREED_ORDER, foods: FEED_ITEMS, stages: STAGE_XP };`, context);
await mkdir('server/generated', { recursive: true });
await writeFile('server/generated/rules.json', JSON.stringify(context.rules, null, 2) + '\n');
