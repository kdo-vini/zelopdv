// Trilha e efeitos do vídeo, sintetizados em JS puro e gravados como WAV
// (44,1 kHz, estéreo, 16 bits). Os tempos saem de timeline.js, o mesmo
// arquivo que a cena usa. O único sample externo é o som de pedido do próprio
// app (static/sounds/ifood-arrival.mp3), decodificado pelo ffmpeg.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const TL = createRequire(import.meta.url)('./timeline.js');
const SR = 44100;
const N = Math.ceil(TL.duration * SR);
const { PI, sin, cos, exp, min, max, tanh, floor, round, pow } = Math;
const TAU = 2 * PI;

// Ruído determinístico: a mesma trilha a cada execução.
let seed = 1234567;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
const mtof = (m) => 440 * pow(2, (m - 69) / 12);

const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
const drums = bus(), bass = bus(), pad = bus(), keys = bus(), sfx = bus(), send = bus();

// Escreve uma voz num barramento. gen(dt) devolve a amostra; pan em [-1, 1].
function voice(b, t0, dur, gen, gain = 1, pan = 0, sendAmt = 0) {
  const i0 = round(t0 * SR), n = round(dur * SR);
  const gl = gain * cos(((pan + 1) * PI) / 4), gr = gain * sin(((pan + 1) * PI) / 4);
  for (let i = 0; i < n; i++) {
    const j = i0 + i;
    if (j < 0) continue;
    if (j >= N) break;
    const v = gen(i / SR);
    b.L[j] += v * gl; b.R[j] += v * gr;
    if (sendAmt) { send.L[j] += v * gl * sendAmt; send.R[j] += v * gr * sendAmt; }
  }
}

const lowpass = (fc) => { const a = 1 - exp((-TAU * fc) / SR); let y = 0; return (x) => (y += a * (x - y)); };
const highpass = (fc) => { const lp = lowpass(fc); return (x) => x - lp(x); };

// ---------- instrumentos ----------
const kickTimes = [];
function kick(t, g = 1) {
  kickTimes.push(t);
  let ph = 0;
  voice(drums, t, 0.5, (dt) => {
    ph += (TAU * (44 + 120 * exp(-dt * 30))) / SR;
    return (sin(ph) * exp(-dt * 6.5) + noise() * 0.25 * exp(-dt * 250)) * g;
  }, 0.95);
}
function clap(t, g = 1, pan = 0) {
  const hp = highpass(900);
  voice(drums, t, 0.35, (dt) => {
    const burst = dt < 0.03 ? exp(-((dt % 0.01) * 300)) : exp(-(dt - 0.03) * 16);
    return hp(noise()) * burst * g;
  }, 0.45, pan, 0.25);
}
function snare(t, g = 1) {
  const hp = highpass(1200);
  let ph = 0;
  voice(drums, t, 0.2, (dt) => {
    ph += (TAU * 190) / SR;
    return (hp(noise()) * 0.8 + sin(ph) * 0.5) * exp(-dt * 22) * g;
  }, 0.4, 0, 0.2);
}
function hat(t, open = false, g = 1, pan = 0.25) {
  const hp = highpass(7000);
  voice(drums, t, open ? 0.3 : 0.06, (dt) => hp(noise()) * exp(-dt * (open ? 14 : 70)) * g, 0.28, pan);
}
function crash(t, g = 1) {
  const hp = highpass(4000);
  voice(drums, t, 2.2, (dt) => hp(noise()) * exp(-dt * 2.2) * g, 0.22, 0, 0.3);
}
function bassNote(t, m, dur, g = 1) {
  const f = mtof(m);
  const amps = [1, 0.45, 0.28, 0.14, 0.07];
  voice(bass, t, dur, (dt) => {
    let v = 0;
    for (let h = 0; h < amps.length; h++) v += amps[h] * sin(TAU * f * (h + 1) * dt);
    const env = min(1, dt / 0.005) * (0.65 + 0.35 * exp(-dt * 12)) * min(1, (dur - dt) / 0.03);
    return v * env * g;
  }, 0.42);
}
// Karplus-Strong: corda dedilhada.
function pluck(t, m, dur = 0.5, g = 1, pan = 0, target = keys, sendAmt = 0.35, bright = 0.5) {
  const f = mtof(m), len = max(2, round(SR / f));
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = noise();
  let idx = 0;
  const decay = 0.996;
  // bright = 0 → média clássica (som mais abafado); 1 → sem filtragem (mais metálico)
  voice(target, t, dur, (dt) => {
    const cur = buf[idx], nxt = buf[(idx + 1) % len];
    buf[idx] = decay * (bright * cur + (1 - bright) * 0.5 * (cur + nxt));
    idx = (idx + 1) % len;
    return cur * min(1, (dur - dt) / 0.05);
  }, 0.5 * g, pan, sendAmt);
}
function padChord(t, notes, dur, g = 1, attack = 0.3, release = 0.5) {
  notes.forEach((m, k) => {
    const f = mtof(m);
    [-0.12, 0, 0.12].forEach((det, d) => {
      const ff = f * pow(2, det / 12), pan = (d - 1) * 0.5;
      const ph0 = (k * 0.37 + d * 0.21) * TAU;
      voice(pad, t, dur + release, (dt) => {
        let v = 0;
        for (let h = 1; h <= 7; h++) v += sin(TAU * ff * h * dt + ph0 * h) * (exp(-h * 0.35) / h);
        const env = min(1, dt / attack) * (dt > dur ? exp(-(dt - dur) * (5 / release)) : 1);
        return v * env * g;
      }, 0.1, pan, 0.4);
    });
  });
}
function bell(t, m, g = 1, pan = 0, dur = 1.4) {
  const f = mtof(m);
  const parts = [[1, 1, 3], [2.0, 0.5, 5], [3.01, 0.28, 8], [4.2, 0.16, 11]];
  voice(sfx, t, dur, (dt) => parts.reduce((s, [r, a, d]) => s + a * sin(TAU * f * r * dt) * exp(-dt * d), 0) * min(1, dt / 0.002) * g, 0.22, pan, 0.5);
}
function pop(t, g = 1, f0 = 900) {
  let ph = 0;
  voice(sfx, t, 0.12, (dt) => { ph += (TAU * (f0 * 0.35 + f0 * exp(-dt * 45))) / SR; return sin(ph) * exp(-dt * 38) * g; }, 0.5, 0, 0.15);
}
function tick(t, g = 1, f = 3200) {
  voice(sfx, t, 0.03, (dt) => sin(TAU * f * dt) * exp(-dt * 260) * g, 0.25);
}
function click(t, g = 1) {
  const hp = highpass(2000);
  voice(sfx, t, 0.04, (dt) => (hp(noise()) * 0.7 + sin(TAU * 1800 * dt) * 0.3) * exp(-dt * 180) * g, 0.35, (noise() * 0.3));
}
function square(f, dt, n = 7) { let v = 0; for (let h = 1; h <= n; h += 2) v += sin(TAU * f * h * dt) / h; return v; }
function coin(t, g = 1) {
  voice(sfx, t, 0.08, (dt) => square(mtof(83), dt) * g, 0.22, 0, 0.3);
  voice(sfx, t + 0.08, 0.5, (dt) => square(mtof(88), dt) * exp(-dt * 7) * g, 0.22, 0, 0.3);
}
function blip(t, m1, m2, g = 1) {
  voice(sfx, t, 0.07, (dt) => square(mtof(m1), dt, 3) * g, 0.2, -0.2, 0.3);
  voice(sfx, t + 0.07, 0.18, (dt) => square(mtof(m2), dt, 3) * exp(-dt * 16) * g, 0.2, 0.2, 0.3);
}
function whoosh(t, dur, { from = 300, to = 6000, g = 1, panFrom = -0.6, panTo = 0.6, shape = 'hump' } = {}) {
  let y = 0;
  const n = round(dur * SR), i0 = round(t * SR);
  for (let i = 0; i < n && i0 + i < N; i++) {
    const k = i / n;
    const fc = from * pow(to / from, k);
    y += (1 - exp((-TAU * fc) / SR)) * (noise() - y);
    const env = shape === 'rise' ? pow(k, 2.2) : sin(PI * k) ** 2;
    const p = panFrom + (panTo - panFrom) * k;
    const v = y * env * 0.5 * g;
    sfx.L[i0 + i] += v * cos(((p + 1) * PI) / 4);
    sfx.R[i0 + i] += v * sin(((p + 1) * PI) / 4);
  }
}
function sweep(t, dur, f0, f1, g = 1, wave = 'sine') {
  let ph = 0;
  voice(sfx, t, dur, (dt) => {
    const k = dt / dur;
    ph += (TAU * f0 * pow(f1 / f0, k)) / SR;
    const v = wave === 'saw' ? [1, 2, 3, 4, 5].reduce((s, h) => s + sin(ph * h) / h, 0) : sin(ph);
    return v * sin(PI * min(1, k * 1.2)) * g;
  }, 0.3, 0, 0.2);
}
function impact(t, g = 1) {
  kick(t, 1.2);
  let ph = 0;
  voice(sfx, t, 2.5, (dt) => { ph += (TAU * (32 + 30 * exp(-dt * 3))) / SR; return sin(ph) * exp(-dt * 1.8) * g; }, 0.8);
  const lp = lowpass(2500);
  voice(sfx, t, 1.8, (dt) => lp(noise()) * exp(-dt * 3.5) * g, 0.5, 0, 0.6);
  crash(t, 0.8 * g);
}
// "Womp womp" de trombone triste para o "E fé.".
function womp(t, g = 1) {
  const notes = [[62, 0.28], [61, 0.28], [60, 0.28], [59, 0.7]];
  let at = t;
  for (const [m, d] of notes) {
    let ph = 0;
    const lp = lowpass(1400);
    voice(sfx, at, d, (dt) => {
      const vib = d > 0.5 ? 1 + 0.012 * sin(TAU * 6 * dt) * min(1, dt / 0.2) : 1;
      ph += (TAU * mtof(m - 12) * vib) / SR;
      const v = [1, 2, 3, 4, 5, 6, 7, 8].reduce((s, h) => s + sin(ph * h) / h, 0);
      return lp(v) * min(1, dt / 0.03) * min(1, (d - dt) / 0.06) * g;
    }, 0.32, 0, 0.3);
    at += d;
  }
}
function boing(t, g = 1) {
  let ph = 0;
  voice(sfx, t, 0.6, (dt) => {
    ph += (TAU * (260 + 160 * sin(dt * 34) * exp(-dt * 5) + dt * 200)) / SR;
    return sin(ph) * exp(-dt * 4.5) * g;
  }, 0.35, 0, 0.2);
}
function scribble(t, dur, g = 1) {
  const hp = highpass(2500);
  voice(sfx, t, dur, (dt) => hp(noise()) * (0.5 + 0.5 * sin(TAU * 14 * dt)) ** 2 * sin(PI * dt / dur) * g, 0.25, 0.2);
}

// Sample do app, decodificado pelo ffmpeg para PCM float estéreo.
function loadSample(path) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error('ffmpeg falhou ao decodificar ' + path);
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
  const L = new Float32Array(f.length / 2), R = new Float32Array(f.length / 2);
  for (let i = 0; i < L.length; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return { L, R };
}
function playSample(s, t, g = 1) {
  const i0 = round(t * SR);
  for (let i = 0; i < s.L.length && i0 + i < N; i++) { sfx.L[i0 + i] += s.L[i] * g; sfx.R[i0 + i] += s.R[i] * g; }
}

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

// Freeverb enxuto no retorno.
function reverb(inp) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491], aps = [556, 441, 341];
  const out = bus();
  for (const [ch, spread] of [['L', 0], ['R', 23]]) {
    const cb = combs.map((c) => ({ buf: new Float32Array(c + spread), i: 0, lp: 0 }));
    const ab = aps.map((a) => ({ buf: new Float32Array(a + spread), i: 0 }));
    const x = inp[ch], y = out[ch];
    for (let n = 0; n < N; n++) {
      let s = 0;
      for (const c of cb) {
        const o = c.buf[c.i];
        c.lp = o * 0.75 + c.lp * 0.25;
        c.buf[c.i] = x[n] * 0.015 + c.lp * 0.84;
        c.i = (c.i + 1) % c.buf.length;
        s += o;
      }
      for (const a of ab) {
        const o = a.buf[a.i];
        a.buf[a.i] = s + o * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = o - s * 0.5;
      }
      y[n] = s;
    }
  }
  return out;
}
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
let peak = 0;
for (let i = 0; i < N; i++) peak = max(peak, Math.abs(master.L[i]), Math.abs(master.R[i]));
const gain = 0.89 / peak;

const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  out.writeInt16LE(round(max(-1, min(1, master.L[i] * gain)) * 32767), 44 + i * 4);
  out.writeInt16LE(round(max(-1, min(1, master.R[i] * gain)) * 32767), 46 + i * 4);
}
mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out/audio.wav'), out);
console.log(`out/audio.wav · ${TL.duration}s · pico normalizado (ganho ${gain.toFixed(2)})`);
