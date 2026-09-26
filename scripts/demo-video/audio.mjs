// Trilha do vídeo demonstrativo, sintetizada com scripts/video-kit/synth.mjs e
// gravada em assets/audio.wav (a composição toca esse arquivo). Todos os tempos
// vêm de timeline.js, os mesmos que a animação usa.
//
// Direção: calma e premium como o Design System — piano elétrico em acordes
// com sétima, groove leve a 120 BPM e efeitos de interface discretos.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createSynth } from '../video-kit/synth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TL = createRequire(import.meta.url)('./timeline.js');
const { floor, round, min, max, tanh, exp } = Math;
const syn = createSynth(TL.duration, { noiseSeed: 20260926 });
const {
  SR, N, bus, kickTimes, drums, bass, pad, keys, sfx, send,
  kick, clap, hat, shaker, bassNote, epiano, padChord, bell, softTap, click, whoosh, sweep, reverb, writeWav
} = syn;

const S = TL.scenes;
const BEAT = 60 / TL.bpm, BAR = BEAT * 4;
// Fmaj7 – Em7 – Dm7 – Cmaj7 (um compasso cada), voicings abertos
const PROG = [
  { root: 41, notes: [57, 60, 64, 69] },
  { root: 40, notes: [55, 59, 62, 67] },
  { root: 38, notes: [53, 57, 60, 65] },
  { root: 36, notes: [52, 55, 59, 64] }
];
const chordAt = (t) => PROG[((floor(t / BAR + 1e-6) % 4) + 4) % 4];

// ---------- música ----------
const grooveFrom = S.venda[0] - 0.5; // entra com o celular
const grooveTo = S.zelinho[0];

// abertura: acordes soltos do piano, sem bateria
[0.3, 2.3].forEach((t) => chordAt(t).notes.forEach((m, i) => epiano(t + i * 0.025, m, 1.7, 0.75, -0.3 + i * 0.2)));
padChord(0.2, [53, 57, 60, 64], 3.6, 0.5, 1.2, 0.8);

for (let t = grooveFrom; t < TL.duration - 4 - 1e-6; t += BEAT) {
  const b = round(t / BEAT) % 4;
  const inGroove = t < grooveTo - 1e-6;
  const { root, notes } = chordAt(t);
  if (inGroove) {
    kick(t, 0.72);
    if (b === 1 || b === 3) clap(t, 0.45, 0.05);
    hat(t + BEAT / 2, false, 0.55);
    bassNote(t + BEAT / 2, root, BEAT * 0.42, 0.9);
    if (b === 0) bassNote(t, root, BEAT * 0.3, 0.55);
  } else {
    // Zelinho: sem bumbo, só o balanço do piano e do shaker
    bassNote(t, root, BEAT * 0.8, 0.45);
  }
  shaker(t + BEAT / 4, 0.7);
  shaker(t + (3 * BEAT) / 4, 0.5, 0.3);
  // comping do piano: no 1 e no "e" do 2
  if (b === 0) notes.forEach((m, i) => epiano(t + i * 0.018, m, 0.55, 0.62, -0.3 + i * 0.2));
  if (b === 1) notes.slice(1).forEach((m, i) => epiano(t + BEAT / 2 + i * 0.018, m, 0.3, 0.45, -0.2 + i * 0.2));
}

// relatórios: arpejo de sinos quando os números aparecem
{
  const r = TL.relatorios;
  [72, 76, 79, 84, 88].forEach((m, i) => bell(r.semana + 0.05 + i * 0.07, m, 0.28, -0.4 + i * 0.2, 1));
}

// ---------- efeitos de interface ----------
const taps = [
  TL.hook.press,
  ...TL.venda.taps, TL.venda.openSheet, TL.venda.receber, TL.venda.pix, TL.venda.confirm,
  TL.mesas.openMesa, ...TL.mesas.taps, TL.mesas.openSheet, TL.mesas.send, TL.mesas.fechar, ...TL.mesas.split, TL.mesas.pix, TL.mesas.close,
  TL.financeiro.novo, TL.financeiro.categoria, TL.financeiro.save, TL.financeiro.caixa, TL.financeiro.fechar,
  TL.relatorios.semana, TL.zelinho.chip, TL.zelinho.send, TL.zelinho.confirm, TL.end.press
];
taps.forEach((t, i) => softTap(t, 0.9, 1400 + (i % 3) * 120));

// MorphButton: um brilho sobe enquanto carrega, e o check fecha com um acorde de dois sinos
const morphs = [
  [TL.hook.loading, TL.hook.check],
  [TL.venda.loading, TL.venda.check],
  [TL.mesas.sendLoading, TL.mesas.sendCheck],
  [TL.mesas.closeLoading, TL.mesas.closeCheck],
  [TL.financeiro.saveLoading, TL.financeiro.saveCheck],
  [TL.financeiro.fecharLoading, TL.financeiro.fecharCheck],
  [TL.zelinho.loading, TL.zelinho.check]
];
morphs.forEach(([a, b]) => {
  sweep(a, b - a, 500, 950, 0.12);
  bell(b + 0.1, 88, 0.42, -0.15, 1.2);
  bell(b + 0.17, 95, 0.32, 0.15, 1.2);
});

// sheets sobem/descem com um sopro curto
[TL.venda.openSheet + 0.05, TL.mesas.openSheet + 0.05, TL.financeiro.sheet, TL.financeiro.caixaSheet]
  .forEach((t) => whoosh(t - 0.04, 0.34, { from: 500, to: 3200, g: 0.45, panFrom: 0, panTo: 0 }));
[TL.venda.closeSheet, TL.mesas.closeSheet, TL.financeiro.closeSheet, TL.relatorios.closeSheet]
  .forEach((t) => whoosh(t, 0.3, { from: 2600, to: 400, g: 0.35, panFrom: 0, panTo: 0 }));

// trocas de tela e capítulos: sopro lateral bem baixo
[TL.mesas.screen, TL.mesas.mesaScreen, TL.financeiro.screen, TL.relatorios.screen, TL.zelinho.screen]
  .forEach((t) => whoosh(t - 0.05, 0.4, { from: 300, to: 2400, g: 0.28 }));

// toasts
[TL.venda.toast, TL.mesas.toast].forEach((t) => { bell(t, 84, 0.3, 0, 1); bell(t + 0.08, 91, 0.22, 0, 1); });

// digitação
const typing = (t0, t1, n) => { for (let i = 0; i < n; i++) click(t0 + ((t1 - t0) * (i + 1)) / n - 0.01, 0.35); };
typing(...TL.financeiro.typeDesc, 'Gás de cozinha'.replace(/ /g, '').length);
typing(...TL.financeiro.typeValor, 5);
typing(...TL.financeiro.contado, 5);
typing(...TL.zelinho.typeCmd, 'sobe o X-Bacon pra 31,90'.replace(/ /g, '').length);

// Zelinho: mensagens chegam com um "blip" suave
[TL.zelinho.ask, TL.zelinho.ask2].forEach((t) => { epiano(t, 84, 0.2, 0.5, 0.3, sfx, 0.3); });
[TL.zelinho.answer[0], TL.zelinho.action].forEach((t) => { epiano(t, 79, 0.25, 0.55, -0.3, sfx, 0.3); epiano(t + 0.09, 86, 0.3, 0.5, -0.3, sfx, 0.3); });

// abertura: o botão aparece
bell(TL.hook.pill, 81, 0.25);

// ---------- final (superfície Brand) ----------
{
  const e = TL.end;
  whoosh(e.panel - 0.35, 0.5, { from: 300, to: 7000, shape: 'rise', g: 0.8 });
  kick(e.panel, 0.9);
  bassNote(e.panel, 29, 3.2, 0.9);
  padChord(e.panel, [41, 53, 57, 60, 64, 67], 3.2, 0.9, 0.08, 1.2);
  [53, 57, 60, 64, 67, 72].forEach((m, i) => epiano(e.panel + i * 0.03, m, 2.6, 0.6, -0.5 + i * 0.2));
  [79, 84, 88, 91].forEach((m, i) => bell(e.logo + i * 0.06, m + 12, 0.3, -0.4 + i * 0.25, 1.4));
  bell(e.title, 84, 0.25);
  bell(e.cta, 91, 0.22);
}

// ---------- mixagem ----------
const wet = reverb(send);
kickTimes.sort((a, b) => a - b);
const master = bus();
let kp = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  while (kp + 1 < kickTimes.length && kickTimes[kp + 1] <= t) kp++;
  const since = kickTimes.length && kickTimes[kp] <= t ? t - kickTimes[kp] : 9;
  const duck = 1 - 0.35 * exp(-since * 9);
  const fadeIn = min(1, t / 0.05);
  const fadeOut = 1 - min(1, max(0, (t - TL.end.fadeOut[0]) / (TL.end.fadeOut[1] - TL.end.fadeOut[0])));
  for (const ch of ['L', 'R']) {
    const v = drums[ch][i] * 0.8 + bass[ch][i] * 0.75 + (pad[ch][i] * 0.7 + keys[ch][i] * 0.8) * duck + sfx[ch][i] * 0.85 + wet[ch][i] * 0.8;
    master[ch][i] = tanh(v * 1.05) * fadeIn * fadeOut;
  }
}
const gain = writeWav(join(here, 'assets/audio.wav'), master);
console.log(`assets/audio.wav · ${TL.duration}s · ganho ${gain.toFixed(2)}`);
