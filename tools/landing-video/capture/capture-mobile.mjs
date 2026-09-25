// capture-mobile.mjs — grava os 3 fluxos (venda, fiado, zelinho) da landing
// page do ZeloPDV em formato RETRATO (celular), reaproveitando login/seletores
// de capture.mjs.
//
// TÉCNICA DE VÍDEO: o recordVideo nativo do Playwright grava sempre no
// tamanho CSS do viewport (confirmado por teste: 390x844 mesmo com
// deviceScaleFactor 2/3 e recordVideo.size maior — o canvas só fica com
// letterbox cinza, sem upscale). Page.startScreencast (CDP) tem a MESMA
// limitação (frames voltam em 390x844 mesmo pedindo maxWidth/maxHeight
// maiores). page.screenshot(), por outro lado, RESPEITA deviceScaleFactor
// (confirmado: dsf=2 => 780x1688). Por isso este script grava "vídeo" como
// uma sequência de screenshots JPEG em alta resolução (loop assíncrono,
// paralelo às interações), e monta o vídeo final com ffmpeg usando a duração
// real entre cada frame (concat demuxer) — nitidez de screenshot real, sem
// downscale.
//
// Uso:
//   node capture-mobile.mjs                    -> grava os 3 fluxos
//   node capture-mobile.mjs --only=venda        -> só um fluxo
//   node capture-mobile.mjs --headed            -> Chromium visível
//
// SEGURANÇA: mesmas regras de capture.mjs (login automático autorizado na
// conta demo, nunca loga senha, headless por padrão, sem debug remoto, um
// único Chromium/context por execução).

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const REPO_ROOT = 'C:\\Users\\Vinicius\\orca\\zelopdv';
const { chromium } = require(path.join(REPO_ROOT, 'node_modules', 'playwright'));
const ffmpegPath = require('ffmpeg-static');
const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = __dirname;
const ERRORS_DIR = path.join(SCRATCH, 'errors');
const OUT_DIR = path.join(SCRATCH, 'video-mobile');
const RAW_OUT_DIR = path.join(SCRATCH, 'video-mobile', 'raw');
const FRAMES_ROOT = path.join(SCRATCH, 'video-mobile-frames');
const LOG_FILE = path.join(SCRATCH, 'capture-mobile.log');
const AUTH_DIR = path.join(SCRATCH, '.auth');
const AUTH_STATE_PATH = path.join(AUTH_DIR, 'state.json');

const BASE_URL = process.env.ZELOPDV_BASE_URL || 'http://localhost:5173';
const HEADED = process.argv.includes('--headed');
const FRESH_LOGIN = process.argv.includes('--fresh-login');
const DRY_VENDA = process.argv.includes('--dry-venda');
const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='));
const ONLY_GROUPS = ONLY_ARG ? ONLY_ARG.slice('--only='.length).split(',').map((s) => s.trim().toLowerCase()) : null;
const READY_TIMEOUT = 40000;
const LOGIN_WAIT_MS = 10 * 60 * 1000;

// Produtos usados no fluxo de venda — IDs explícitos (evita ambiguidade de
// ordem do grid) e categorias diferentes. NUNCA usar 1821 (Hambúrguer
// Artesanal, estoque=6) nem 1832 (Pastel de Carne, estoque=0) — instrução
// explícita da tarefa.
export const VENDA_PRODUTOS = [
  { tab: 'Lanches', id: 1817, nome: 'X-Salada', preco: 16 },
  { tab: 'Porções', id: 1822, nome: 'Batata Frita Média', preco: 18 },
  { tab: 'Bebidas', id: 1812, nome: 'Refrigerante Lata 350ml', preco: 6 },
  { tab: 'Doces & Sobremesas', id: 1836, nome: 'Brigadeiro', preco: 4 },
];

for (const dir of [OUT_DIR, RAW_OUT_DIR, FRAMES_ROOT, ERRORS_DIR]) fs.mkdirSync(dir, { recursive: true });

// Viewport/DPR/tamanho de frame fixos desta gravação — usados no header de
// cada <fluxo>.events.json (schema pedido p/ importar no Recordly).
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const MOBILE_DSF = 2;
const MOBILE_VIDEO_SIZE = { width: MOBILE_VIEWPORT.width * MOBILE_DSF, height: MOBILE_VIEWPORT.height * MOBILE_DSF };

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pausa "humana" 400-800ms entre toques, conforme pedido pra mobile.
function humanPauseMobile() {
  const ms = 400 + Math.floor(Math.random() * 400);
  return sleep(ms);
}

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

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
  log(`Login automático: preenchendo formulário com a conta demo (${email})...`);
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('button[type="submit"].auth-btn').click();
  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!url.includes('/login')) {
      log(`Login automático concluído. URL atual: ${url}`);
      return true;
    }
    const errVisible = await page.locator('.auth-error').isVisible({ timeout: 300 }).catch(() => false);
    if (errVisible) {
      log(`   erro de login exibido na tela.`);
      return false;
    }
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
    const closeSelectors = [
      '[data-close-button]',
      '[aria-label="Fechar dica"]',
      '[aria-label="Dispensar"]',
      '.modal-close',
      'button:has-text("Entendi")',
      'button:has-text("Dispensar")',
      'button:has-text("Agora não")',
      'button:has-text("Pular")',
    ];
    for (const sel of closeSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 400 }).catch(() => false)) {
        await el.click({ timeout: 1000 }).catch(() => {});
        await sleep(150);
      }
    }
    await sleep(300);
  } catch {
    // best-effort
  }
}

async function waitReady(page, name, fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    log(`   condição de pronto não atingida para "${name}": ${err?.message || err}`);
    try {
      const errPath = path.join(ERRORS_DIR, `mobile-${slug(name)}-ready-timeout.png`);
      await page.screenshot({ path: errPath, fullPage: false }).catch(() => {});
      log(`   screenshot salvo em ${errPath}`);
    } catch {}
    return false;
  }
}

async function readyFrenteDeCaixa(page) {
  await page.waitForFunction(() => {
    const btn = document.querySelector('[data-testid="product-grid"] button[data-prod]');
    return !!btn && /R\$/.test(btn.textContent || '');
  }, { timeout: READY_TIMEOUT });
}

async function ensureComandaVazia(page) {
  const vazio = await page.getByText('VAZIO', { exact: true }).isVisible({ timeout: 1500 }).catch(() => false);
  if (vazio) return;
  const limparBtn = page.locator('button[aria-label="Limpar comanda"]');
  if (!(await limparBtn.isVisible({ timeout: 1500 }).catch(() => false))) return;
  await limparBtn.click().catch(() => {});
  const confirmBtn = page.locator('.confirm-dialog-confirm');
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click().catch(() => {});
  }
  await sleep(500);
}

// ---------------------------------------------------------------------------
// Gravador "de vídeo" via screenshots JPEG em loop (ver nota de nitidez no topo).
// ---------------------------------------------------------------------------
function startRecorder(page, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  let stopped = false;
  let idx = 0;
  const t0 = Date.now();
  const INTERVAL_MS = 110;

  const loopPromise = (async () => {
    while (!stopped) {
      const shotStart = Date.now();
      let buf = null;
      try {
        buf = await page.screenshot({ type: 'jpeg', quality: 88, timeout: 3000 });
      } catch {
        await sleep(30);
        continue;
      }
      if (stopped) break; // não grava o frame pós-stop
      const wallMs = Date.now() - t0;
      const fp = path.join(dir, `f${String(idx).padStart(6, '0')}.jpg`);
      fs.writeFileSync(fp, buf);
      frames.push({ idx, wallMs, fp });
      idx += 1;
      const elapsed = Date.now() - shotStart;
      await sleep(Math.max(10, INTERVAL_MS - elapsed));
    }
  })();

  const events = [];

  return {
    frames,
    events,
    t0,
    async stop() {
      stopped = true;
      await loopPromise;
      return frames;
    },
  };
}

/**
 * Registra um evento de interação na trilha do rec (pra montar
 * <fluxo>.events.json depois — consumido pelo editor Recordly p/ auto-zoom e
 * efeito de cursor). x/y são o CENTRO do elemento em px CSS do viewport
 * (boundingBox do Playwright já é sempre CSS px, independente de
 * deviceScaleFactor). t_ms é relativo ao início do recorder (= início do
 * vídeo final, já que não cortamos nada depois — o recorder só liga quando a
 * tela já está pronta).
 */
async function recordEvent(rec, type, { locator = null, label = '', extra = {} } = {}) {
  let x = null;
  let y = null;
  if (locator) {
    const box = await locator.boundingBox().catch(() => null);
    if (box) {
      x = Math.round(box.x + box.width / 2);
      y = Math.round(box.y + box.height / 2);
    }
  }
  rec.events.push({ t_ms: Date.now() - rec.t0, type, x, y, label, ...extra });
}

async function runFfmpeg(args) {
  log(`ffmpeg ${args.join(' ')}`);
  await execFileAsync(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 64 });
}

function buildConcatList(frames, name) {
  const listPath = path.join(FRAMES_ROOT, `${name}-list.txt`);
  let list = 'ffconcat version 1.0\n';
  for (let i = 0; i < frames.length; i++) {
    const dur = i < frames.length - 1
      ? Math.max(0.03, (frames[i + 1].wallMs - frames[i].wallMs) / 1000)
      : 0.6;
    list += `file '${frames[i].fp.replace(/\\/g, '/')}'\n`;
    list += `duration ${dur.toFixed(3)}\n`;
  }
  list += `file '${frames[frames.length - 1].fp.replace(/\\/g, '/')}'\n`;
  fs.writeFileSync(listPath, list);
  return listPath;
}

async function encodeFlow(frames, name, { events = null } = {}) {
  if (frames.length < 2) throw new Error(`"${name}": frames insuficientes (${frames.length}) para montar vídeo.`);

  const listPath = buildConcatList(frames, name);

  const mp4Path = path.join(OUT_DIR, `${name}.mp4`);
  const webmPath = path.join(OUT_DIR, `${name}.webm`);
  const posterPath = path.join(OUT_DIR, `${name}.webp`);
  const rawMp4Path = path.join(RAW_OUT_DIR, `${name}.mp4`);

  // "Bruto" em alta resolução / qualidade quase sem perdas, ANTES da
  // compressão final (pedido explícito: material fonte pro editor Recordly
  // fazer auto-zoom/cursor sem herdar os artefatos do crf28 de entrega).
  await runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-fps_mode', 'cfr', '-r', '14',
    '-an', '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
    '-movflags', '+faststart',
    rawMp4Path,
  ]);

  await runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-fps_mode', 'cfr', '-r', '14',
    '-an', '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '28',
    '-movflags', '+faststart',
    mp4Path,
  ]);

  await runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-fps_mode', 'cfr', '-r', '14',
    '-an',
    '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0',
    webmPath,
  ]);

  // Poster: primeiro frame útil (pula alguns frames iniciais).
  const posterFrame = frames[Math.min(3, frames.length - 1)].fp;
  await runFfmpeg(['-y', '-i', posterFrame, posterPath]);

  if (events) {
    const eventsPath = path.join(OUT_DIR, `${name}.events.json`);
    fs.writeFileSync(eventsPath, JSON.stringify({
      viewport: MOBILE_VIEWPORT,
      deviceScaleFactor: MOBILE_DSF,
      videoSize: MOBILE_VIDEO_SIZE,
      events,
    }, null, 2));
    log(`   events: ${eventsPath} (${events.length} eventos)`);
  }

  const mp4MB = (fs.statSync(mp4Path).size / (1024 * 1024)).toFixed(2);
  const webmMB = (fs.statSync(webmPath).size / (1024 * 1024)).toFixed(2);
  const posterKB = (fs.statSync(posterPath).size / 1024).toFixed(1);
  const rawMB = (fs.statSync(rawMp4Path).size / (1024 * 1024)).toFixed(2);
  const durationSec = (frames[frames.length - 1].wallMs / 1000).toFixed(1);
  log(`${name}: mp4=${mp4MB}MB webm=${webmMB}MB poster=${posterKB}KB raw=${rawMB}MB duração≈${durationSec}s frames=${frames.length}`);
  if (fs.statSync(mp4Path).size > 2 * 1024 * 1024) {
    log(`AVISO: ${name}.mp4 passou de 2MB (${mp4MB}MB).`);
  }
}

// ---------------------------------------------------------------------------
// Fluxos
// ---------------------------------------------------------------------------

async function tapCategoryTab(page, tabName, rec = null) {
  const tab = page.getByRole('tab', { name: tabName, exact: true });
  await tab.waitFor({ state: 'visible', timeout: 10000 });
  if (rec) await recordEvent(rec, 'tap', { locator: tab, label: `Categoria: ${tabName}` });
  await tab.tap();
  await sleep(350);
}

async function tapProduct(page, prodId, label = '', rec = null) {
  const btn = page.locator(`button[data-prod="${prodId}"]`);
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  if (rec) await recordEvent(rec, 'tap', { locator: btn, label: label || `Produto ${prodId}` });
  await btn.tap();
}

/**
 * Fluxo completo de venda mobile via toque: 4 produtos de categorias
 * diferentes -> Ver Comanda -> Receber -> Pix -> Confirmar -> Venda
 * Realizada! -> Novo Pedido. Retorna { ok, produtos } com os produtos usados
 * (pra restaurar estoque depois).
 */
async function fluxoVendaMobile(page, { dryRun = false } = {}) {
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' });
  await closeOverlays(page);
  await ensureComandaVazia(page);
  await waitReady(page, 'mobile-venda-ready', () => readyFrenteDeCaixa(page));
  await page.getByText('Comanda limpa', { exact: true }).waitFor({ state: 'hidden', timeout: 3500 }).catch(() => {});
  await closeOverlays(page);

  const rec = startRecorder(page, path.join(FRAMES_ROOT, 'venda'));

  let lastTab = null;
  for (const prod of VENDA_PRODUTOS) {
    if (prod.tab !== lastTab) {
      await tapCategoryTab(page, prod.tab, rec);
      lastTab = prod.tab;
    }
    await tapProduct(page, prod.id, prod.nome, rec);
    await humanPauseMobile();
  }
  await humanPauseMobile();

  const verComandaBtn = page.getByRole('button', { name: 'Ver Comanda' });
  await verComandaBtn.waitFor({ state: 'visible', timeout: 8000 });
  await recordEvent(rec, 'tap', { locator: verComandaBtn, label: 'Ver Comanda' });
  await verComandaBtn.tap();
  await page.locator('[data-testid="cart"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await humanPauseMobile();

  if (dryRun) {
    await sleep(1000);
    const frames = await rec.stop();
    return { ok: true, frames, events: rec.events, dryRun: true };
  }

  const cobrar = page.locator('[data-testid="btn-cobrar"]');
  await cobrar.waitFor({ state: 'visible', timeout: 10000 });
  await recordEvent(rec, 'tap', { locator: cobrar, label: 'Receber' });
  await cobrar.tap();
  await humanPauseMobile();

  const pixBtn = page.locator('.payment-method-button', { hasText: 'Pix' }).first();
  await pixBtn.waitFor({ state: 'visible', timeout: 8000 });
  await recordEvent(rec, 'tap', { locator: pixBtn, label: 'Pix' });
  await pixBtn.tap();
  await humanPauseMobile();

  const confirmBtn = page.locator('button.btn-confirm');
  await confirmBtn.waitFor({ state: 'visible', timeout: 8000 });
  await recordEvent(rec, 'tap', { locator: confirmBtn, label: 'Confirmar pagamento' });
  await confirmBtn.tap();

  const sucessoOk = await waitReady(page, 'mobile-venda-sucesso', async () => {
    await page.getByText('Venda Realizada!', { exact: false }).waitFor({ timeout: 15000 });
  });

  if (sucessoOk) {
    const novoPedido = page.getByRole('button', { name: 'Novo Pedido' });
    if (await novoPedido.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recordEvent(rec, 'tap', { locator: novoPedido, label: 'Novo Pedido' });
      await novoPedido.tap();
      await page.getByText('Venda Realizada!', { exact: false }).waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    }
  }
  await recordEvent(rec, 'wait', { label: 'Respiro final' });
  await sleep(1000); // respiro final

  const frames = await rec.stop();
  return { ok: sucessoOk, frames, events: rec.events };
}

/** Escolhe, dentre .person-card visíveis, o de MAIOR saldo devedor. */
async function selecionarPessoaMaiorSaldo(page, rec = null) {
  const bestIndex = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.person-card'));
    let bestIdx = -1;
    let bestVal = -Infinity;
    cards.forEach((card, idx) => {
      const balEl = card.querySelector('.person-balance.devedor');
      if (!balEl) return;
      const num = parseFloat((balEl.textContent || '').replace(/[^\d,.-]/g, '').replace(',', '.'));
      if (Number.isFinite(num) && num > bestVal) {
        bestVal = num;
        bestIdx = idx;
      }
    });
    return bestIdx;
  });
  if (bestIndex < 0) return false;
  const card = page.locator('.person-card').nth(bestIndex);
  if (rec) {
    const nome = await card.locator('.person-name, h3, strong').first().innerText().catch(() => 'Cliente');
    await recordEvent(rec, 'tap', { locator: card, label: `Cliente: ${nome.trim()}` });
  }
  await card.tap({ timeout: 8000 });
  return true;
}

async function fluxoFiadoMobile(page) {
  await page.goto(`${BASE_URL}/gestao/fichario`, { waitUntil: 'domcontentloaded' });
  await closeOverlays(page);
  await waitReady(page, 'mobile-fiado-ready', async () => {
    await page.locator('.person-card').first().waitFor({ state: 'visible', timeout: READY_TIMEOUT });
  });

  const rec = startRecorder(page, path.join(FRAMES_ROOT, 'fiado'));

  const picked = await selecionarPessoaMaiorSaldo(page, rec);
  if (!picked) await page.locator('.person-card').first().tap({ timeout: 8000 }).catch(() => {});
  await humanPauseMobile();

  await waitReady(page, 'mobile-fiado-hero', async () => {
    await page.locator('.hero-card').waitFor({ state: 'visible', timeout: 15000 });
  });
  await recordEvent(rec, 'wait', { locator: page.locator('.hero-card'), label: 'Saldo do cliente' });
  await sleep(900);

  await waitReady(page, 'mobile-fiado-historico', async () => {
    await page.locator('.statement-loading').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.locator('.history-card').waitFor({ state: 'visible', timeout: 15000 });
  });

  await page.locator('.history-card').scrollIntoViewIfNeeded().catch(() => {});
  await sleep(400);
  for (let i = 0; i < 5; i++) {
    await recordEvent(rec, 'scroll', { locator: page.locator('.history-card'), label: `Rolar extrato (${i + 1}/5)` });
    await page.mouse.wheel(0, 240);
    await sleep(400 + Math.floor(Math.random() * 200));
  }
  await recordEvent(rec, 'wait', { label: 'Respiro final' });
  await sleep(1000);

  const frames = await rec.stop();
  return { ok: true, frames, events: rec.events };
}

async function esperarFabZelinho(page) {
  await page.locator('.zelinho-fab').waitFor({ state: 'visible', timeout: READY_TIMEOUT });
}

/**
 * Espera o briefing REAL carregar (não o esqueleto/placeholder). O h1 de
 * saudação e o FAB do Zelinho aparecem ANTES do onMount->load() terminar
 * (loading ainda true), renderizando "Boa tarde." + "Ainda estou reunindo seu
 * histórico..." (placeholder de buildGreeting quando dayStrip é nulo) com 3
 * caixas cinza de skeleton por baixo — exatamente o print quebrado que
 * motivou este helper. Só dá por pronto quando o skeleton some E o heading
 * "O que pede sua atenção" (seção real do ZelinhoBriefing, só renderizada com
 * loading=false) aparece.
 */
async function esperarBriefingCarregado(page) {
  await page.waitForFunction(() => {
    if (document.querySelector('.skeleton.strip')) return false;
    const h2s = Array.from(document.querySelectorAll('h2'));
    return h2s.some((el) => (el.textContent || '').includes('pede sua atenção'));
  }, { timeout: READY_TIMEOUT });
  await sleep(400); // respiro pra eventual animação de entrada dos cards assentar
}

async function fluxoZelinhoMobile(page) {
  await page.goto(`${BASE_URL}/gestao/gerente`, { waitUntil: 'domcontentloaded' });
  await closeOverlays(page);

  const fabOk = await waitReady(page, 'mobile-zelinho-fab', () => esperarFabZelinho(page));
  if (!fabOk) return { ok: false, frames: [] };

  await waitReady(page, 'mobile-zelinho-briefing', () => esperarBriefingCarregado(page));
  await page.evaluate(() => window.scrollTo(0, 0));

  const rec = startRecorder(page, path.join(FRAMES_ROOT, 'zelinho'));

  // Mostra o topo do briefing (saudação + avisos) por ~1.5s antes de abrir o chat.
  await recordEvent(rec, 'wait', { locator: page.locator('.manager-page .head h1'), label: 'Saudação + avisos' });
  await sleep(1500);

  const fab = page.locator('.zelinho-fab');
  await recordEvent(rec, 'tap', { locator: fab, label: 'Abrir chat do Zelinho' });
  await fab.tap();
  await page.locator('.assistant-panel.open').waitFor({ state: 'visible', timeout: 8000 });
  await humanPauseMobile();

  const textarea = page.locator('.assistant-panel.open #zelinho-message');
  await textarea.waitFor({ state: 'visible', timeout: 8000 });
  await recordEvent(rec, 'tap', { locator: textarea, label: 'Campo de mensagem' });
  await textarea.tap();
  await recordEvent(rec, 'type', { locator: textarea, label: 'Quanto sobrou este mês?' });
  await page.keyboard.type('Quanto sobrou este mês?', { delay: 35 });
  await humanPauseMobile();
  const sendBtn = page.locator('.assistant-panel.open button.send[aria-label="Enviar"]');
  await recordEvent(rec, 'tap', { locator: sendBtn, label: 'Enviar' });
  await sendBtn.tap();

  await page.locator('.assistant-panel.open #zelinho-message[disabled]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

  const finished = await waitReady(page, 'mobile-zelinho-streaming', async () => {
    await page.locator('.assistant-panel.open #zelinho-message:not([disabled])').waitFor({ timeout: READY_TIMEOUT });
    await page.locator('.assistant-panel.open .status').filter({ hasText: 'Pronto para ajudar' }).waitFor({ timeout: 8000 });
  });

  const hasError = await page.locator('.assistant-panel.open .p-assistant.error').first().isVisible({ timeout: 1000 }).catch(() => false);
  if (hasError) log('   Zelinho respondeu com erro.');

  await recordEvent(rec, 'wait', { label: 'Resposta completa' });
  await sleep(1200);

  const frames = await rec.stop();
  return { ok: finished && !hasError, frames, events: rec.events };
}

function shouldRun(group) {
  if (!ONLY_GROUPS) return true;
  return ONLY_GROUPS.includes(group);
}

async function main() {
  log('==== capture-mobile.mjs iniciado ====');
  log(`BASE_URL=${BASE_URL} ONLY=${ONLY_GROUPS ? ONLY_GROUPS.join(',') : '(todos)'} HEADED=${HEADED}`);

  const browser = await chromium.launch({ headless: !HEADED });

  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const contextOptions = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
  };

  const canReuseSession = !FRESH_LOGIN && fs.existsSync(AUTH_STATE_PATH);
  if (canReuseSession) contextOptions.storageState = AUTH_STATE_PATH;

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.on('pageerror', (err) => log(`   [pageerror] ${err?.message || err}`));
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (/google-analytics\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com/.test(url)) return;
    log(`   [requestfailed] ${req.method()} ${url} — ${req.failure()?.errorText}`);
  });

  const results = {};

  try {
    let loggedIn = false;
    if (canReuseSession) {
      log(`Reaproveitando sessão salva em ${AUTH_STATE_PATH}...`);
      await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' });
      await sleep(800);
      loggedIn = !page.url().includes('/login');
      if (!loggedIn) log('Sessão salva expirou/inválida; refazendo login.');
    }
    if (!loggedIn) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await sleep(1500);
      loggedIn = await autoLogin(page);
      if (!loggedIn) {
        log('Login automático falhou. Encerrando.');
        await context.close();
        await browser.close();
        process.exitCode = 1;
        return;
      }
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      await context.storageState({ path: AUTH_STATE_PATH });
    }

    await sleep(1200);
    await closeOverlays(page);

    if (shouldRun('venda')) {
      log('>> fluxo: venda (mobile)');
      try {
        const { ok, frames, events, dryRun } = await fluxoVendaMobile(page, { dryRun: DRY_VENDA });
        results.venda = { ok, frameCount: frames.length, dryRun };
        if (ok) await encodeFlow(frames, dryRun ? 'venda-dry' : 'venda', { events });
        else log('   venda: sucesso não confirmado, pulando encode.');
      } catch (err) {
        log(`FALHOU fluxo venda: ${err?.stack || err}`);
      }
    }

    if (shouldRun('fiado')) {
      log('>> fluxo: fiado (mobile)');
      try {
        const { ok, frames, events } = await fluxoFiadoMobile(page);
        results.fiado = { ok, frameCount: frames.length };
        if (ok) await encodeFlow(frames, 'fiado', { events });
      } catch (err) {
        log(`FALHOU fluxo fiado: ${err?.stack || err}`);
      }
    }

    if (shouldRun('zelinho')) {
      log('>> fluxo: zelinho (mobile)');
      try {
        const { ok, frames, events } = await fluxoZelinhoMobile(page);
        results.zelinho = { ok, frameCount: frames.length };
        if (ok) await encodeFlow(frames, 'zelinho', { events });
        else log('   zelinho: resposta com erro/indisponível, pulando encode.');
      } catch (err) {
        log(`FALHOU fluxo zelinho: ${err?.stack || err}`);
      }
    }

    log(`Resultado: ${JSON.stringify(results)}`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    log('==== capture-mobile.mjs finalizado ====');
    logStream.end();
  }
}

main().catch((err) => {
  log(`ERRO FATAL: ${err?.stack || err}`);
  process.exitCode = 1;
});
