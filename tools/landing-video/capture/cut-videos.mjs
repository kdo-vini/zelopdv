// cut-videos.mjs — corta o .webm gravado por capture.mjs em clipes por fluxo,
// usando SCRATCH/timeline.json (startMs/endMs desde a criação do context).
//
// Saída por fluxo <nome> em SCRATCH/video/:
//   <nome>.mp4  (H.264, sem áudio, yuv420p, faststart, crf ~28, largura 1280)
//   <nome>.webm (VP9, sem áudio)
//   <nome>.webp (poster do primeiro frame útil do clipe)
//
// Uso:
//   node cut-videos.mjs                      -> usa timeline.json + video-raw/*.webm padrão
//   node cut-videos.mjs --timeline X --input Y --outdir Z   -> overrides p/ teste

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = __dirname;

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1];
}

const TIMELINE_PATH = argValue('--timeline', path.join(SCRATCH, 'timeline.json'));
const VIDEO_RAW_DIR = argValue('--video-raw-dir', path.join(SCRATCH, 'video-raw'));
const EXPLICIT_INPUT = argValue('--input', null);
const OUT_DIR = argValue('--outdir', path.join(SCRATCH, 'video'));

fs.mkdirSync(OUT_DIR, { recursive: true });

function log(msg) {
  console.log(`[cut-videos] ${msg}`);
}

function findRawWebm() {
  if (EXPLICIT_INPUT) return EXPLICIT_INPUT;
  if (!fs.existsSync(VIDEO_RAW_DIR)) {
    throw new Error(`Diretório de vídeo bruto não existe: ${VIDEO_RAW_DIR}`);
  }
  const files = fs
    .readdirSync(VIDEO_RAW_DIR)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(VIDEO_RAW_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) {
    throw new Error(`Nenhum .webm encontrado em ${VIDEO_RAW_DIR}`);
  }
  if (files.length > 1) {
    log(`Aviso: ${files.length} arquivos .webm encontrados; usando o mais recente (${files[0].f}).`);
  }
  return path.join(VIDEO_RAW_DIR, files[0].f);
}

async function runFfmpeg(args) {
  log(`ffmpeg ${args.join(' ')}`);
  await execFileAsync(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 64 });
}

async function cutFlow(inputPath, name, startMs, endMs) {
  const startSec = Math.max(0, startMs / 1000);
  const durationSec = Math.max(0.3, (endMs - startMs) / 1000);

  const mp4Path = path.join(OUT_DIR, `${name}.mp4`);
  const webmPath = path.join(OUT_DIR, `${name}.webm`);
  const posterPath = path.join(OUT_DIR, `${name}.webp`);

  // MP4 (H.264) — mira em < 2MB por clipe.
  await runFfmpeg([
    '-y',
    '-ss', startSec.toFixed(3),
    '-i', inputPath,
    '-t', durationSec.toFixed(3),
    '-an',
    '-vf', 'scale=1280:-2:flags=lanczos',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    mp4Path,
  ]);

  // WEBM (VP9) — sem áudio.
  await runFfmpeg([
    '-y',
    '-ss', startSec.toFixed(3),
    '-i', inputPath,
    '-t', durationSec.toFixed(3),
    '-an',
    '-vf', 'scale=1280:-2:flags=lanczos',
    '-c:v', 'libvpx-vp9',
    '-crf', '32',
    '-b:v', '0',
    webmPath,
  ]);

  // Poster: primeiro frame "útil" — pula ~300ms pra evitar frame em branco/transição.
  const posterOffset = startSec + 0.3;
  await runFfmpeg([
    '-y',
    '-ss', posterOffset.toFixed(3),
    '-i', inputPath,
    '-frames:v', '1',
    '-vf', 'scale=1280:-2:flags=lanczos',
    posterPath,
  ]);

  const mp4Size = fs.statSync(mp4Path).size;
  const mp4MB = (mp4Size / (1024 * 1024)).toFixed(2);
  log(`${name}: mp4=${mp4MB}MB webm=${(fs.statSync(webmPath).size / 1024 / 1024).toFixed(2)}MB poster=${(fs.statSync(posterPath).size / 1024).toFixed(1)}KB`);
  if (mp4Size > 2 * 1024 * 1024) {
    log(`AVISO: ${name}.mp4 passou de 2MB (${mp4MB}MB). Considere crf mais alto ou clipe mais curto.`);
  }
}

async function main() {
  log(`timeline: ${TIMELINE_PATH}`);
  if (!fs.existsSync(TIMELINE_PATH)) {
    throw new Error(`timeline.json não encontrado: ${TIMELINE_PATH}`);
  }
  const timeline = JSON.parse(fs.readFileSync(TIMELINE_PATH, 'utf8'));
  const flows = timeline.flows || {};
  const flowNames = Object.keys(flows);
  if (!flowNames.length) {
    throw new Error('timeline.json não tem nenhum fluxo em "flows".');
  }

  const inputPath = findRawWebm();
  log(`input: ${inputPath}`);

  for (const name of flowNames) {
    const { startMs, endMs, failed } = flows[name];
    if (failed) {
      log(`Pulando fluxo "${name}": marcado como failed (ex.: resposta do Zelinho com erro).`);
      continue;
    }
    if (typeof startMs !== 'number' || typeof endMs !== 'number' || endMs <= startMs) {
      log(`Pulando fluxo "${name}": startMs/endMs inválidos (${startMs}, ${endMs}).`);
      continue;
    }
    await cutFlow(inputPath, name, startMs, endMs);
  }

  log('Concluído.');
}

main().catch((err) => {
  console.error(`[cut-videos] ERRO: ${err?.stack || err}`);
  process.exitCode = 1;
});
