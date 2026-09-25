// probe.mjs — confere duracao/resolucao/codec/tamanho dos videos finais em
// static/videos/landing/. Uso: node scripts/probe.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffprobePkg from 'ffprobe-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(__dirname, '..', '..', '..', 'static', 'videos', 'landing');

const flows = ['venda', 'fiado', 'zelinho'];
const formats = ['mobile', 'desktop'];

const BUDGETS_MB = { mobile: 1.5, desktop: 2.5 };

for (const flow of flows) {
  for (const format of formats) {
    const id = `${flow}-${format}`;
    const mp4 = path.join(DEST, `${id}.mp4`);
    const webm = path.join(DEST, `${id}.webm`);
    const webp = path.join(DEST, `${id}.webp`);
    if (!fs.existsSync(mp4)) {
      console.log(`${id}: FALTA ${mp4}`);
      continue;
    }
    const info = JSON.parse(
      execFileSync(ffprobePkg.path, [
        '-v', 'error', '-print_format', 'json',
        '-show_entries', 'stream=codec_name,width,height,pix_fmt,color_range,avg_frame_rate,nb_frames',
        '-show_entries', 'format=duration,size',
        mp4,
      ]).toString(),
    );
    const stream = info.streams[0];
    const sizeMB = Number(info.format.size) / (1024 * 1024);
    const budget = BUDGETS_MB[format];
    const durationS = Number(info.format.duration);
    const okSize = sizeMB <= budget;
    const okDuration = durationS >= 8 && durationS <= 12;
    console.log(
      `${id.padEnd(16)} ${stream.width}x${stream.height} ${stream.codec_name} ${stream.pix_fmt}/${stream.color_range} ` +
        `${durationS.toFixed(2)}s ${sizeMB.toFixed(2)}MB (orcamento ${budget}MB) ` +
        `${okSize ? 'OK' : '!! ACIMA DO ORCAMENTO'} ${okDuration ? '' : '!! DURACAO FORA DE 8-12s'} ` +
        `webm=${fs.existsSync(webm) ? (fs.statSync(webm).size / 1024 / 1024).toFixed(2) + 'MB' : 'FALTA'} ` +
        `poster=${fs.existsSync(webp) ? 'ok' : 'FALTA'}`,
    );
  }
}
