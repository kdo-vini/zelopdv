// Trilha e efeitos do vídeo, sintetizados em JS puro (scripts/video-kit/synth.mjs)
// e gravados como WAV (44,1 kHz, estéreo, 16 bits). Os tempos saem de timeline.js,
// o mesmo arquivo que a cena usa. O único sample externo é o som de pedido do próprio
// app (static/sounds/ifood-arrival.mp3), decodificado pelo ffmpeg.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createSynth } from '../video-kit/synth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TL = createRequire(import.meta.url)('./timeline.js');
const { PI, sin, cos, exp, min, max, tanh, floor, round, pow } = Math;
const TAU = 2 * PI;
const {
  SR, N, noise, bus, kickTimes, drums, bass, pad, keys, sfx, send,
  kick, clap, snare, hat, crash, bassNote, pluck, padChord, bell, pop, tick, click, coin, blip,
  whoosh, sweep, impact, womp, boing, scribble, loadSample, playSample, reverb, writeWav
} = createSynth(TL.duration);

// ---------- arranjo ----------
const S = TL.scenes;
const BEAT = 60 / TL.bpm, BAR = BEAT * 4;
const CHORDS = { C: [48, [0, 4, 7]], G: [43, [0, 4, 7]], Am: [45, [0, 3, 7]], F: [41, [0, 4, 7]] };
const PROG = ['C', 'G', 'Am', 'F'];
const chordAt = (t) => PROG[floor((t - S.venda[0]) / BAR + 1e-6) % PROG.length];
const off = TL.offline;
const inBreak = (t) => t >= off.drop && t < off.back;

// 1) Cold open: drone baixo, tique-taque de relógio e máquina de escrever.
padChord(0, [45, 52, 57], S.coldOpen[1] - 0.2, 0.9, 1.2, 0.4);
for (let t = 0.5; t < S.coldOpen[1]; t += BEAT) tick(t, t % 1 < 0.01 ? 0.9 : 0.55, t % 1 < 0.01 ? 2600 : 3400);
for (const { text, from, to } of Object.values(TL.coldOpen)) {
  for (let i = 1; i <= text.length; i++) if (text[i - 1] !== ' ') click(from + ((to - from) * i) / text.length - 0.01, 0.8 + 0.2 * noise());
}

// 2) Caos: bumbo seco, notas desafinadas nos post-its, stabs nas palavras e o "womp".
for (let t = S.chaos[0]; t < TL.chaos.suck[0]; t += BEAT) kick(t, 0.85);
const chaosNotes = [78, 72, 70, 75, 79, 73];
TL.chaos.items.forEach((t, i) => { pluck(t, chaosNotes[i], 0.5, 1.1, i % 2 ? 0.5 : -0.5, sfx, 0.3, 0.9); pop(t, 0.5, 600 + i * 90); });
TL.chaos.words.slice(0, 3).forEach((t, i) => { clap(t, 1); padChord(t, [57 + i, 60 + i, 63 + i], 0.18, 1.4, 0.005, 0.15); });
womp(TL.chaos.words[3], 1);
whoosh(TL.chaos.suck[0] - 0.25, 0.75, { from: 5000, to: 200, shape: 'rise', g: 1.3, panFrom: 0.8, panTo: 0 });
sweep(TL.chaos.suck[0], 0.5, 900, 80, 0.5);

// 3) Revelação: impacto, brilho por letra, pad largo e riser até o groove.
const R = TL.reveal;
bell(R.label, 96, 0.35);
impact(R.icon, 1);
padChord(R.icon, [41, 53, 57, 60, 64], S.reveal[1] - R.icon - 0.1, 1.1, 0.6, 0.3);
[72, 76, 79, 84, 88, 91, 96].forEach((m, i) => bell(R.wordmark + i * 0.045, m, 0.5, -0.6 + i * 0.2, 1.2));
bell(R.tagline, 84, 0.35);
whoosh(S.reveal[1] - 1.0, 1.0, { from: 300, to: 9000, shape: 'rise', g: 1.1 });
sweep(S.reveal[1] - 1.0, 1.0, 180, 1400, 0.35, 'saw');

// 4) Groove principal (120 BPM): C – G – Am – F.
const grooveEnd = S.zelinho[0];
for (let t = S.venda[0]; t < grooveEnd - 1e-6; t += BEAT) {
  if (inBreak(t)) continue;
  const b = round((t - S.venda[0]) / BEAT) % 4;
  kick(t, 1);
  if (b === 1 || b === 3) clap(t, 0.9, 0.05);
  hat(t + BEAT / 2, b === 3, 0.9);
  hat(t + BEAT / 4, false, 0.35, -0.3);
  hat(t + (3 * BEAT) / 4, false, 0.35, -0.3);
  const [root] = CHORDS[chordAt(t)];
  bassNote(t + BEAT / 2, root - 12, BEAT * 0.45, 1);
  if (b === 0) bassNote(t, root - 12, BEAT * 0.3, 0.6);
}
crash(S.venda[0], 1);
crash(off.back, 0.9);
// Pad e arpejo por compasso (continuam abafados durante a queda de internet).
for (let t = S.venda[0]; t < S.end[0] - 1e-6; t += BAR) {
  const [root, iv] = CHORDS[chordAt(t)];
  padChord(t, iv.map((x) => root + 12 + x), min(BAR, S.end[0] - t) - 0.05, 0.9, 0.08, 0.3);
}
const ARP = [0, 1, 2, 3, 2, 1, 3, 2];
for (let t = S.venda[0], i = 0; t < S.end[0] - 1e-6; t += BEAT / 4, i++) {
  const [root, iv] = CHORDS[chordAt(t)];
  const tones = [...iv, 12].map((x) => root + 24 + x);
  const zel = t >= S.zelinho[0];
  pluck(t, tones[ARP[i % 8]] + (zel && i % 8 >= 4 ? 12 : 0), 0.32, i % 4 === 0 ? 0.95 : 0.65, i % 2 ? 0.35 : -0.35);
}

// Efeitos de cada feature.
const V = TL.venda;
V.taps.forEach((t, i) => pop(t, 0.9, 700 + i * 150));
pop(V.pay, 0.9, 1100);
coin(V.success, 1);
bell(V.success + 0.05, 91, 0.5);
whoosh(V.success + 0.12, 0.35, { from: 2000, to: 9000, g: 0.7, panFrom: -0.3, panTo: 0.3 });

const F = TL.fiado;
for (let t = F.count[0]; t < F.count[1]; t += 0.06) tick(t, 0.35, 2400 + (t - F.count[0]) * 1500);
F.rows.forEach((t) => pop(t, 0.5, 650));
coin(F.pay, 0.9);
scribble(F.note, 0.45, 0.9);

sweep(off.drop, 0.55, 520, 40, 0.9, 'saw'); // "tape stop" quando a internet cai
off.queued.forEach((t, i) => pluck(t, 64 + i * 3, 0.4, 0.9, 0, sfx, 0.5, 0.2));
for (let t = off.back - 0.5, i = 0; t < off.back - 1e-6; t += BEAT / 8, i++) snare(t, 0.3 + i * 0.1);
sweep(off.back - 0.45, 0.5, 90, 900, 0.6);
off.synced.forEach((t, i) => blip(t, 79 + i * 4, 84 + i * 4, 0.8));

const ding = loadSample(join(here, '../../static/sounds/ifood-arrival.mp3'));
TL.pedidos.cards.forEach((t) => { playSample(ding, t, 0.55); whoosh(t - 0.08, 0.3, { from: 1500, to: 300, g: 0.5, panFrom: 0, panTo: 0 }); });
bell(TL.pedidos.ready, 88, 0.5);

const L8 = TL.lucro;
[60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79].forEach((m, i) => bell(L8.bars[0] + ((L8.bars[1] - L8.bars[0]) * i) / 11, m + 12, 0.3, -0.5 + i / 11, 0.6));
for (let t = L8.count[0]; t < L8.count[1]; t += 0.05) tick(t, 0.3, 2800 + (t - L8.count[0]) * 1800);
coin(L8.count[1] - 0.05, 1);

// 5) Zelinho: sem bumbo, palmas e chimbal leves; balões de chat.
for (let t = S.zelinho[0]; t < S.end[0] - BEAT - 1e-6; t += BEAT) {
  const b = round((t - S.zelinho[0]) / BEAT) % 4;
  if (b === 1 || b === 3) clap(t, 0.6);
  hat(t + BEAT / 2, false, 0.6);
  const [root] = CHORDS[chordAt(t)];
  bassNote(t, root - 12, BEAT * 0.8, 0.5);
}
whoosh(TL.zelinho.enter - 0.1, 0.5, { from: 400, to: 4000, g: 0.8, panFrom: 0.9, panTo: -0.2 });
boing(TL.zelinho.enter + 0.45, 1);
TL.zelinho.bubbles.forEach((t, i) => blip(t, 76 + i * 2, 83 + i * 2, 0.9));
for (let t = S.end[0] - BEAT, i = 0; t < S.end[0] - 1e-6; t += BEAT / 8, i++) snare(t, 0.3 + i * 0.12);
whoosh(S.end[0] - 0.6, 0.6, { from: 300, to: 8000, shape: 'rise', g: 1 });

// 6) Cartão final: impacto, acorde aberto e brilhos.
const E = TL.end;
impact(E.icon, 1.1);
padChord(E.icon, [36, 48, 55, 62, 64, 67, 72], 2.6, 1.1, 0.05, 1.2);
[48, 55, 60, 64, 67, 72, 76].forEach((m, i) => pluck(E.icon + i * 0.03, m + 12, 2.5, 0.9, -0.6 + i * 0.2));
bassNote(E.icon, 36, 2.8, 0.9);
bell(E.title, 84, 0.5); bell(E.title + 0.06, 88, 0.4);
bell(E.sub, 79, 0.25);
[91, 96, 100].forEach((m, i) => bell(E.url + 0.5 + i * 0.09, m, 0.3, -0.4 + i * 0.4));

// ---------- mixagem ----------
// Abafa pad e arpejo durante a queda de internet (filtro passa-baixa que varia no tempo).
function muffle(b) {
  for (const ch of ['L', 'R']) {
    let y = 0;
    const x = b[ch];
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const k = t < off.drop ? 0 : t < off.drop + 0.3 ? (t - off.drop) / 0.3 : t < off.back ? 1 : max(0, 1 - (t - off.back) / 0.15);
      const fc = 18000 * pow(350 / 18000, k);
      y += (1 - exp((-TAU * fc) / SR)) * (x[i] - y);
      x[i] = y * (1 - 0.35 * k);
    }
  }
}
muffle(pad); muffle(keys);

const wet = reverb(send);

// Sidechain: pad e arpejo "respiram" com o bumbo.
kickTimes.sort((a, b) => a - b);
const master = bus();
let kp = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  while (kp + 1 < kickTimes.length && kickTimes[kp + 1] <= t) kp++;
  const since = kickTimes.length && kickTimes[kp] <= t ? t - kickTimes[kp] : 9;
  const duck = 1 - 0.5 * exp(-since * 9);
  const fadeIn = min(1, t / 0.08);
  const fadeOut = 1 - min(1, max(0, (t - TL.end.fadeOut[0]) / (TL.end.fadeOut[1] - TL.end.fadeOut[0])));
  for (const ch of ['L', 'R']) {
    const v = drums[ch][i] * 0.9 + bass[ch][i] * 0.8 + (pad[ch][i] * 0.8 + keys[ch][i] * 0.55) * duck + sfx[ch][i] * 0.9 + wet[ch][i] * 0.9;
    master[ch][i] = tanh(v * 1.1) * fadeIn * fadeOut;
  }
}
const gain = writeWav(join(here, 'out/audio.wav'), master);
console.log(`out/audio.wav · ${TL.duration}s · pico normalizado (ganho ${gain.toFixed(2)})`);
