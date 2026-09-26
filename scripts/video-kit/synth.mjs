// Kit de síntese dos vídeos do ZeloPDV: instrumentos em JS puro, sem samples
// externos (só os que o chamador carregar com loadSample, via ffmpeg).
// Tudo é determinístico: o ruído usa um PRNG com semente fixa, então a mesma
// partitura gera sempre o mesmo WAV.
//
// Uso: const s = createSynth(duracaoEmSegundos); s.kick(0.5); …
//      const master = s.bus(); (mixe os barramentos s.drums, s.bass… nele)
//      s.writeWav('saida.wav', master);
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const { PI, sin, cos, exp, min, max, round, pow } = Math;
const TAU = 2 * PI;

export function createSynth(duration, { sr = 44100, noiseSeed = 1234567 } = {}) {
  const SR = sr;
  const N = Math.ceil(duration * SR);
  const { PI, sin, cos, exp, min, max, tanh, floor, round, pow } = Math;
  const TAU = 2 * PI;

  // Ruído determinístico: a mesma trilha a cada execução.
  let seed = noiseSeed;
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

  // Piano elétrico (FM de 2 operadores, razão 1:1) com o "tine" metálico do ataque.
  function epiano(t, m, dur = 1, g = 1, pan = 0, target = keys, sendAmt = 0.35) {
    const f = mtof(m);
    voice(target, t, dur + 0.25, (dt) => {
      const idx = 1.6 * exp(-dt * 7) + 0.25;
      const body = sin(TAU * f * dt + idx * sin(TAU * f * dt));
      const tine = 0.18 * sin(TAU * f * 14 * dt) * exp(-dt * 40);
      const env = min(1, dt / 0.004) * exp(-dt * 1.1) * (dt > dur ? exp(-(dt - dur) * 18) : 1);
      return (body + tine) * env * g;
    }, 0.3, pan, sendAmt);
  }
  function shaker(t, g = 1, pan = -0.3) {
    const hp = highpass(6000);
    voice(drums, t, 0.09, (dt) => hp(noise()) * min(1, dt / 0.012) * exp(-dt * 45) * g, 0.2, pan);
  }
  // Toque de interface: clique curto e macio (tile, botão, aba).
  function softTap(t, g = 1, f0 = 1500) {
    let ph = 0;
    voice(sfx, t, 0.06, (dt) => {
      ph += (TAU * (f0 * 0.45 + f0 * exp(-dt * 90))) / SR;
      return (sin(ph) * 0.8 + noise() * 0.12) * exp(-dt * 95) * g;
    }, 0.4, 0, 0.1);
  }

  // Normaliza o pico para ~-1 dBFS e grava PCM 16 bits estéreo. Devolve o ganho aplicado.
  function writeWav(path, master, peakTarget = 0.89) {
    let peak = 0;
    for (let i = 0; i < N; i++) peak = max(peak, Math.abs(master.L[i]), Math.abs(master.R[i]));
    const gain = peakTarget / peak;
    const out = Buffer.alloc(44 + N * 4);
    out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8);
    out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
    out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
    out.write('data', 36); out.writeUInt32LE(N * 4, 40);
    for (let i = 0; i < N; i++) {
      out.writeInt16LE(round(max(-1, min(1, master.L[i] * gain)) * 32767), 44 + i * 4);
      out.writeInt16LE(round(max(-1, min(1, master.R[i] * gain)) * 32767), 46 + i * 4);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, out);
    return gain;
  }

  return {
    SR, N, noise, mtof, bus, voice, lowpass, highpass, kickTimes,
    drums, bass, pad, keys, sfx, send,
    kick, clap, snare, hat, crash, bassNote, pluck, padChord, bell, pop, tick, click, square, coin, blip,
    whoosh, sweep, impact, womp, boing, scribble, epiano, shaker, softTap, loadSample, playSample, reverb, writeWav
  };
}
