// capture-desktop-events.mjs — reroda SÓ os fluxos de vídeo desktop fiado e
// zelinho (NUNCA venda, pra não gravar outra venda real) e grava, junto do
// vídeo, uma trilha de interação SCRATCH/video/<fluxo>.events.json com
// { t_ms, type, x, y, label } pra importar no editor Recordly (auto-zoom +
// efeito de cursor). Reaproveita a mesma sessão salva de capture.mjs
// (SCRATCH/.auth/state.json) e o mesmo cut-videos.mjs pra gerar os
// mp4/webm/webp finais (sobrescrevendo os fiado.mp4/zelinho.mp4 já
// existentes — pedido explícito).
//
// Uso:
//   node capture-desktop-events.mjs

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const REPO_ROOT = 'C:\\Users\\Vinicius\\orca\\zelopdv';
const { chromium } = require(path.join(REPO_ROOT, 'node_modules', 'playwright'));
const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = __dirname;
const VIDEO_RAW_DIR = path.join(SCRATCH, 'video-raw');
const VIDEO_OUT_DIR = path.join(SCRATCH, 'video');
const ERRORS_DIR = path.join(SCRATCH, 'errors');
const AUTH_STATE_PATH = path.join(SCRATCH, '.auth', 'state.json');
const TIMELINE_EVENTS_PATH = path.join(SCRATCH, 'timeline-events-desktop.json');
const LOG_FILE = path.join(SCRATCH, 'capture-desktop-events.log');

const BASE_URL = process.env.ZELOPDV_BASE_URL || 'http://localhost:5173';
const HEADED = process.argv.includes('--headed');
const READY_TIMEOUT = 40000;

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const DESKTOP_DSF = 2;

for (const dir of [VIDEO_RAW_DIR, VIDEO_OUT_DIR, ERRORS_DIR]) fs.mkdirSync(dir, { recursive: true });

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function humanPause() { return sleep(300 + Math.floor(Math.random() * 400)); }
function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

// Lê a conta demo de DEMO_EMAIL / DEMO_PASSWORD no ambiente — nunca de
// arquivo do repo (ver README.md).
function readCredentials() {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    throw new Error('Defina DEMO_EMAIL e DEMO_PASSWORD no ambiente antes de rodar este script (ver README.md).');
  }
  return { email, password };
}

async function autoLogin(page) {
  const { email, password } = readCredentials();
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('button[type="submit"].auth-btn').click();
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    if (!page.url().includes('/login')) return true;
    const errVisible = await page.locator('.auth-error').isVisible({ timeout: 300 }).catch(() => false);
    if (errVisible) return false;
    await sleep(500);
  }
  return false;
}

async function closeOverlays(page, { allowEscape = true } = {}) {
  try {
    const panelOpen = await page.locator('.assistant-panel.open').isVisible({ timeout: 200 }).catch(() => false);
    if (allowEscape && !panelOpen) {
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(150);
    }
    const closeSelectors = ['[data-close-button]', '[aria-label="Fechar dica"]', '[aria-label="Dispensar"]', '.modal-close', 'button:has-text("Entendi")', 'button:has-text("Dispensar")', 'button:has-text("Agora não")', 'button:has-text("Pular")'];
    for (const sel of closeSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 400 }).catch(() => false)) {
        await el.click({ timeout: 1000 }).catch(() => {});
        await sleep(150);
      }
    }
    await sleep(300);
  } catch {}
}

async function waitReady(page, name, fn) {
  try { await fn(); return true; }
  catch (err) {
    log(`   condição de pronto não atingida para "${name}": ${err?.message || err}`);
    try {
      const errPath = path.join(ERRORS_DIR, `desktop-events-${slug(name)}.png`);
      await page.screenshot({ path: errPath, fullPage: false }).catch(() => {});
    } catch {}
    return false;
  }
}

// --- trilha de eventos -------------------------------------------------
function makeEventTracker(contextCreatedAt, flowStartMsRef) {
  const events = [];
  return {
    events,
    async record(type, { locator = null, label = '' } = {}) {
      let x = null, y = null;
      if (locator) {
        const box = await locator.boundingBox().catch(() => null);
        if (box) { x = Math.round(box.x + box.width / 2); y = Math.round(box.y + box.height / 2); }
      }
      const nowRel = Date.now() - contextCreatedAt;
      const t_ms = nowRel - flowStartMsRef.value;
      events.push({ t_ms, type, x, y, label });
    },
  };
}

async function selecionarPessoaMaiorSaldo(page, tracker) {
  const bestIndex = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.person-card'));
    let bestIdx = -1, bestVal = -Infinity;
    cards.forEach((card, idx) => {
      const balEl = card.querySelector('.person-balance.devedor');
      if (!balEl) return;
      const num = parseFloat((balEl.textContent || '').replace(/[^\d,.-]/g, '').replace(',', '.'));
      if (Number.isFinite(num) && num > bestVal) { bestVal = num; bestIdx = idx; }
    });
    return bestIdx;
  });
  if (bestIndex < 0) return false;
  const card = page.locator('.person-card').nth(bestIndex);
  if (tracker) {
    const nome = await card.locator('.person-name, h3, strong').first().innerText().catch(() => 'Cliente');
    await tracker.record('tap', { locator: card, label: `Cliente: ${nome.trim()}` });
  }
  await card.click({ timeout: 8000 });
  return true;
}

async function esperarFabZelinho(page) {
  await page.locator('.zelinho-fab').waitFor({ state: 'visible', timeout: READY_TIMEOUT });
}
async function abrirChatZelinho(page, tracker) {
  const fab = page.locator('.zelinho-fab');
  if (tracker) await tracker.record('tap', { locator: fab, label: 'Abrir chat do Zelinho' });
  await fab.click();
  await page.locator('.assistant-panel.open').waitFor({ state: 'visible', timeout: 8000 });
}
async function enviarMensagemZelinho(page, texto, tracker) {
  const textarea = page.locator('.assistant-panel.open #zelinho-message');
  await textarea.waitFor({ state: 'visible', timeout: 8000 });
  if (tracker) await tracker.record('tap', { locator: textarea, label: 'Campo de mensagem' });
  await textarea.click();
  if (tracker) await tracker.record('type', { locator: textarea, label: texto });
  await page.keyboard.type(texto, { delay: 35 });
  await humanPause();
  const sendBtn = page.locator('.assistant-panel.open button.send[aria-label="Enviar"]');
  if (tracker) await tracker.record('tap', { locator: sendBtn, label: 'Enviar' });
  await sendBtn.click();
  await page.locator('.assistant-panel.open #zelinho-message[disabled]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  const finished = await waitReady(page, 'zelinho-streaming', async () => {
    await page.locator('.assistant-panel.open #zelinho-message:not([disabled])').waitFor({ timeout: READY_TIMEOUT });
    await page.locator('.assistant-panel.open .status').filter({ hasText: 'Pronto para ajudar' }).waitFor({ timeout: 8000 });
  });
  const hasError = await page.locator('.assistant-panel.open .p-assistant.error').first().isVisible({ timeout: 1000 }).catch(() => false);
  return finished && !hasError;
}

async function main() {
  log('==== capture-desktop-events.mjs iniciado ====');
  const browser = await chromium.launch({ headless: !HEADED });
  const contextOptions = {
    viewport: DESKTOP_VIEWPORT,
    deviceScaleFactor: DESKTOP_DSF,
    recordVideo: { dir: VIDEO_RAW_DIR, size: DESKTOP_VIEWPORT },
  };
  if (fs.existsSync(AUTH_STATE_PATH)) contextOptions.storageState = AUTH_STATE_PATH;

  const context = await browser.newContext(contextOptions);
  const contextCreatedAt = Date.now();
  const page = await context.newPage();
  page.on('pageerror', (err) => log(`   [pageerror] ${err?.message || err}`));

  const timeline = { contextCreatedAt, flows: {} };
  const eventsByFlow = {};

  try {
    await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' });
    await sleep(800);
    let loggedIn = !page.url().includes('/login');
    if (!loggedIn) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await sleep(1500);
      loggedIn = await autoLogin(page);
      if (!loggedIn) throw new Error('Login falhou.');
    }
    await sleep(1200);
    await closeOverlays(page);

    // --- fiado ---
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`${BASE_URL}/gestao/fichario`, { waitUntil: 'domcontentloaded' });
    await closeOverlays(page);
    await waitReady(page, 'fiado-ready', async () => {
      await page.locator('.person-card').first().waitFor({ state: 'visible', timeout: READY_TIMEOUT });
    });
    const fiadoStartRef = { value: Date.now() - contextCreatedAt };
    const fiadoTracker = makeEventTracker(contextCreatedAt, fiadoStartRef);

    const picked = await selecionarPessoaMaiorSaldo(page, fiadoTracker);
    if (!picked) await page.locator('.person-card').first().click({ timeout: 8000 }).catch(() => {});
    await humanPause();

    await waitReady(page, 'fiado-hero', async () => { await page.locator('.hero-card').waitFor({ state: 'visible', timeout: 15000 }); });
    await fiadoTracker.record('wait', { locator: page.locator('.hero-card'), label: 'Saldo do cliente' });
    await sleep(900);

    await waitReady(page, 'fiado-historico', async () => {
      await page.locator('.statement-loading').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      await page.locator('.history-card').waitFor({ state: 'visible', timeout: 15000 });
    });
    await page.locator('.history-card').scrollIntoViewIfNeeded().catch(() => {});
    await sleep(400);
    for (let i = 0; i < 5; i++) {
      await fiadoTracker.record('scroll', { locator: page.locator('.history-card'), label: `Rolar extrato (${i + 1}/5)` });
      await page.mouse.wheel(0, 240);
      await sleep(380 + Math.floor(Math.random() * 140));
    }
    await fiadoTracker.record('wait', { label: 'Respiro final' });
    await sleep(1000);

    timeline.flows.fiado = { startMs: fiadoStartRef.value, endMs: Date.now() - contextCreatedAt };
    eventsByFlow.fiado = fiadoTracker.events;
    log(`fiado: ${fiadoTracker.events.length} eventos registrados`);

    // --- zelinho ---
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`${BASE_URL}/gestao/gerente`, { waitUntil: 'domcontentloaded' });
    await closeOverlays(page);
    const fabOk = await waitReady(page, 'zelinho-fab', () => esperarFabZelinho(page));
    if (fabOk) {
      const zelinhoStartRef = { value: Date.now() - contextCreatedAt };
      const zelinhoTracker = makeEventTracker(contextCreatedAt, zelinhoStartRef);

      const ok = await abrirChatZelinho(page, zelinhoTracker).then(() => true).catch(() => false);
      await humanPause();
      const sent = ok && await enviarMensagemZelinho(page, 'Quanto sobrou este mês?', zelinhoTracker);
      await zelinhoTracker.record('wait', { label: 'Resposta completa' });
      await sleep(1200);

      timeline.flows.zelinho = { startMs: zelinhoStartRef.value, endMs: Date.now() - contextCreatedAt, failed: !sent };
      eventsByFlow.zelinho = zelinhoTracker.events;
      log(`zelinho: ${zelinhoTracker.events.length} eventos registrados, sucesso=${sent}`);
    } else {
      log('zelinho: FAB não apareceu, pulando.');
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  fs.writeFileSync(TIMELINE_EVENTS_PATH, JSON.stringify(timeline, null, 2));
  log(`timeline salvo em ${TIMELINE_EVENTS_PATH}`);

  // Corta os clipes finais reaproveitando cut-videos.mjs (mesmo pipeline
  // ffmpeg do resto do projeto), sobrescrevendo fiado/zelinho em SCRATCH/video/.
  await execFileAsync(process.execPath, [
    path.join(SCRATCH, 'cut-videos.mjs'),
    '--timeline', TIMELINE_EVENTS_PATH,
    '--video-raw-dir', VIDEO_RAW_DIR,
    '--outdir', VIDEO_OUT_DIR,
  ], { cwd: SCRATCH }).then(({ stdout }) => log(stdout));

  // Grava os .events.json ao lado dos vídeos.
  for (const [name, events] of Object.entries(eventsByFlow)) {
    const eventsPath = path.join(VIDEO_OUT_DIR, `${name}.events.json`);
    fs.writeFileSync(eventsPath, JSON.stringify({
      viewport: DESKTOP_VIEWPORT,
      deviceScaleFactor: DESKTOP_DSF,
      videoSize: DESKTOP_VIEWPORT,
      events,
    }, null, 2));
    log(`events salvo: ${eventsPath}`);
  }

  log('==== capture-desktop-events.mjs finalizado ====');
  logStream.end();
}

main().catch((err) => {
  log(`ERRO FATAL: ${err?.stack || err}`);
  process.exitCode = 1;
});
