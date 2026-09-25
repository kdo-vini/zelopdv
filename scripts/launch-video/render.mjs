// Renderiza scene.html quadro a quadro com Playwright e codifica com ffmpeg.
//
//   node render.mjs                      → out/zelopdv-launch.mp4 (usa out/audio.wav se existir)
//   node render.mjs --stills 3.2,8.6     → out/still-3.20.png, … (pré-visualização)
//
// A animação é função pura de t (window.render(t)), então cada quadro é
// determinístico: não há relógio real, CSS transition ou requestAnimationFrame.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const TL = createRequire(import.meta.url)('./timeline.js');
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--font-render-hinting=none', '--disable-lcd-text']
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (err) => { console.error('page error:', err.message); process.exitCode = 1; });
await page.goto(pathToFileURL(join(here, 'scene.html')).href);
await page.evaluate(() => window.ready);

if (stillsArg) {
  for (const t of stillsArg.split(',').map(Number)) {
    await page.evaluate((tt) => window.render(tt), t);
    const file = join(outDir, `still-${t.toFixed(2)}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
  process.exit();
}

const total = Math.round(TL.duration * TL.fps);
const audio = join(outDir, 'audio.wav');
const output = join(outDir, 'zelopdv-launch.mp4');
const ffArgs = [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(TL.fps), '-i', '-',
  ...(existsSync(audio) ? ['-i', audio] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-r', String(TL.fps), '-movflags', '+faststart',
  ...(existsSync(audio) ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
  output
];
const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg saiu com ' + code)))));

const started = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((tt) => window.render(tt), i / TL.fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 60 === 0) process.stdout.write(`\rquadro ${i}/${total} · ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await ffDone;
await browser.close();
console.log(`\n${output}`);
