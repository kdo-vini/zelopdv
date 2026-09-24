// print-capture-events.mjs — ajuda a trocar a captura de um fluxo (arquivo
// .mp4 + .events.json em public/captures/{mobile,desktop}/<flow>.*) sem
// re-transcrever timestamps a mao. Le a duracao real (ffprobe) + os eventos
// gravados (quando existe *.events.json) e imprime um bloco JS pronto pra
// colar em src/data/flows.js (renomeando t_ms -> tMs, no formato que
// data/flows.js usa).
//
// Uso: node scripts/print-capture-events.mjs <flow>
//   node scripts/print-capture-events.mjs venda
//
// Depois de colar o bloco impresso (events + sourceDurationMs) no
// FLOWS.<flow>.<formato> de src/data/flows.js:
//   1. Confira se as legendas (`*Captions`) ainda fazem sentido com os novos
//      tempos de evento (normalmente só ajustar startMs/endMs pra beat certo
//      — a redação pode ficar igual).
//   2. Confira se o `deadZones` (trecho parado no fim/meio) ainda aponta pro
//      intervalo certo — normalmente startMs = tMs do ultimo evento real + um
//      pequeno respiro, endMs = sourceDurationMs.
//   3. Rode `npm run build-all -- --only=<flow>-mobile,<flow>-desktop` pra
//      re-renderizar só esse fluxo.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffprobePkg from 'ffprobe-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CAPTURES = path.join(ROOT, 'public', 'captures');

const flow = process.argv[2];
if (!flow) {
  console.error('Uso: node scripts/print-capture-events.mjs <flow>');
  process.exit(1);
}

function probeDurationMs(file) {
  const out = execFileSync(ffprobePkg.path, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]).toString().trim();
  return Math.round(parseFloat(out) * 1000);
}

for (const format of ['mobile', 'desktop']) {
  const mp4 = path.join(CAPTURES, format, `${flow}.mp4`);
  const eventsJson = path.join(CAPTURES, format, `${flow}.events.json`);
  if (!fs.existsSync(mp4)) {
    console.log(`\n=== ${flow} ${format}: FALTA ${path.relative(ROOT, mp4)} ===`);
    continue;
  }
  const sourceDurationMs = probeDurationMs(mp4);
  console.log(`\n=== ${flow} ${format} ===`);
  console.log(`sourceDurationMs: ${sourceDurationMs},`);
  if (fs.existsSync(eventsJson)) {
    const raw = JSON.parse(fs.readFileSync(eventsJson, 'utf8'));
    console.log(`viewport: ${JSON.stringify(raw.viewport)},`);
    if (raw.videoSize) console.log(`videoSize: ${JSON.stringify(raw.videoSize)},`);
    console.log('events: [');
    for (const e of raw.events) {
      console.log(
        `  { tMs: ${e.t_ms}, type: '${e.type}', x: ${e.x ?? 'null'}, y: ${e.y ?? 'null'}, label: ${JSON.stringify(e.label ?? '')} },`,
      );
    }
    console.log('],');
  } else {
    console.log(`(sem ${path.relative(ROOT, eventsJson)} — mantenha os eventos manuais existentes ou grave com capture-desktop-events.mjs)`);
  }
}
