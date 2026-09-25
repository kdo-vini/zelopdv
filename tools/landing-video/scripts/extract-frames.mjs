// extract-frames.mjs — extrai frames de QC dos MP4 finais (static/videos/
// landing/*.mp4) pra conferir visualmente se a compressao final estragou
// texto. Saida em out/qc/<id>-N.png. Uso: node scripts/extract-frames.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, '..', '..', 'static', 'videos', 'landing');
const QC = path.join(ROOT, 'out', 'qc');
fs.mkdirSync(QC, { recursive: true });

// 4 instantes (em segundos) por composicao, escolhidos pra cobrir
// intro/meio/fim/encerramento de cada fluxo.
const TIMES = {
  'venda-mobile': [1.0, 4.5, 7.0, 10.5],
  'venda-desktop': [0.7, 2.5, 4.5, 8.5],
  'fiado-mobile': [1.2, 3.0, 5.5, 8.5],
  'fiado-desktop': [1.0, 2.5, 4.0, 8.5],
  'zelinho-mobile': [2.5, 7.5, 11.0, 11.8],
  'zelinho-desktop': [1.0, 7.5, 11.0, 11.8],
};

for (const [id, times] of Object.entries(TIMES)) {
  const mp4 = path.join(DEST, `${id}.mp4`);
  if (!fs.existsSync(mp4)) {
    console.warn(`[extract-frames] falta ${mp4}, pulando`);
    continue;
  }
  times.forEach((t, i) => {
    const out = path.join(QC, `${id}-${i + 1}.png`);
    execFileSync(ffmpegPath, ['-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', out], { stdio: 'ignore' });
  });
  console.log(`[extract-frames] ${id}: ${times.length} frames -> ${QC}`);
}
