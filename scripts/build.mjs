import { cp, mkdir, rm } from 'node:fs/promises';
await rm('web-dist', { recursive: true, force: true });
await cp('web', 'web-dist', { recursive: true });
await mkdir('web-dist/assets', { recursive: true });
await cp('src/res/powerupImages', 'web-dist/assets', {
  recursive: true,
  filter: (p) => !p.endsWith('.psd') && !p.endsWith('Thumbs.db'),
});
console.log('Built static browser game in web-dist/');
