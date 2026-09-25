// render-all.mjs — renderiza os 6 videos finais (venda/fiado/zelinho x
// mobile/desktop), gera .mp4 (H.264) + .webm (VP9) + poster .webp, e publica
// tudo em static/videos/landing/ na raiz do repo.
//
// Uso: node scripts/render-all.mjs [--only=venda-mobile,fiado-desktop]
//
// Requisitos: `npm install` ja rodado nesta pasta (tools/landing-video).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, '..', '..', 'static', 'videos', 'landing');
const OUT = path.join(ROOT, 'out');

fs.mkdirSync(path.join(OUT, 'mp4'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'webm'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'posters'), { recursive: true });
fs.mkdirSync(DEST, { recursive: true });

// Frame (0-based, no proprio video final) escolhido pra virar poster —
// escolhido visualmente (director's cut), nao o primeiro frame (que e so o
// fundo, sem device, pro loop fechar limpo).
const POSTER_FRAME = {
  'venda-mobile': 200,
  'venda-desktop': 100,
  'fiado-mobile': 30,
  'fiado-desktop': 30,
  'zelinho-mobile': 330,
  'zelinho-desktop': 330,
};

const ALL = Object.keys(POSTER_FRAME);

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : ALL;

function run(cmd, args) {
  console.log(`[render-all] ${cmd} ${args.join(' ')}`);
  // shell:true no Windows — sem isso, execFileSync('npx', ...) falha com
  // ENOENT porque `npx` é um shim `.cmd`/`.ps1`, não um executável direto, e
  // Node não tenta a extensão sozinho fora de um shell. Caminho do projeto
  // não tem espaços, então a concatenação de argv que `shell:true` faz no
  // Windows é segura aqui sem quoting extra.
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' });
}

for (const id of only) {
  if (!POSTER_FRAME[id]) {
    console.warn(`[render-all] composicao desconhecida: ${id}`);
    continue;
  }

  const mp4Raw = path.join(OUT, 'mp4', `${id}-crf24.mp4`);
  const webm = path.join(OUT, 'webm', `${id}.webm`);
  const posterPng = path.join(OUT, 'posters', `${id}.png`);

  // 1) MP4 mestre (H.264, crf24 — dentro do orcamento de tamanho com folga).
  run('npx', ['remotion', 'render', 'src/index.jsx', id, mp4Raw, '--codec=h264', '--pixel-format=yuv420p', '--crf=24', '--muted', '--overwrite']);

  // 2) WEBM (VP9).
  run('npx', ['remotion', 'render', 'src/index.jsx', id, webm, '--codec=vp9', '--pixel-format=yuv420p', '--crf=32', '--muted', '--overwrite']);

  // 3) Poster (frame especifico, nao o primeiro frame que e so fundo).
  run('npx', ['remotion', 'still', 'src/index.jsx', id, posterPng, `--frame=${POSTER_FRAME[id]}`]);

  // 4) MP4 final: forca yuv420p (range "tv", nao "yuvj420p") + faststart.
  //    O render do passo 1 sai como yuvj420p (full-range) porque a fonte e
  //    screenshot RGB do Chromium; reencodar com -color_range tv corrige
  //    sem custo perceptivel de qualidade (crf22 sobre um master ja crf24).
  execFileSync(ffmpegPath, [
    '-y', '-i', mp4Raw,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-movflags', '+faststart',
    path.join(DEST, `${id}.mp4`),
  ], { stdio: 'inherit' });

  // 5) WEBM final: so copia (ja sai correto do render do passo 2).
  fs.copyFileSync(webm, path.join(DEST, `${id}.webm`));

  // 6) Poster final: PNG -> WEBP.
  execFileSync(ffmpegPath, [
    '-y', '-i', posterPng, '-c:v', 'libwebp', '-quality', '82',
    path.join(DEST, `${id}.webp`),
  ], { stdio: 'inherit' });

  console.log(`[render-all] ${id}: OK`);
}

console.log(`[render-all] Concluido. Rode "node scripts/probe.mjs" pra conferir os arquivos finais.`);
