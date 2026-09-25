// capture.mjs — captura prints e vídeos do ZeloPDV para a landing page.
//
// SEGURANÇA:
// - Login automático na conta DEMO é autorizado explicitamente pelo dono do
//   produto/conta (ver instruções da tarefa). Lê email/senha das variáveis
//   de ambiente DEMO_EMAIL / DEMO_PASSWORD SOMENTE para preencher o form de
//   /login — nunca de um arquivo do repo. NUNCA imprime a senha em log ou
//   arquivo (só o email, quando necessário para depuração).
// - --manual-login preserva o modo antigo: abre /login e ESPERA humano logar
//   (até 10 min) em vez de preencher o form.
// - Sessão pode ser reaproveitada entre rodadas via storageState salvo em
//   SCRATCH/.auth/state.json (fora do repo). Use --fresh-login para ignorar
//   uma sessão salva e logar de novo.
// - NUNCA abre porta de debug remoto (sem --remote-debugging-port, sem
//   connectOverCDP).
// - Roda headless por padrão; use --headed para ver a janela.
// - Um único Chromium, um único context por execução. Tudo acontece no MESMO
//   context/página da MESMA execução.
//
// Uso:
//   node capture.mjs --dry-run              -> só abre /login, imprime a mensagem e sai
//   node capture.mjs                        -> fluxo completo (login automático + vídeos + prints)
//   node capture.mjs --no-video             -> pula os 3 vídeos, só prints
//   node capture.mjs --only=relatorios,zelinho  -> roda só os grupos listados
//   node capture.mjs --manual-login         -> espera login manual (modo antigo)
//   node capture.mjs --headed               -> Chromium visível (default: headless)
//   node capture.mjs --fresh-login          -> ignora sessão salva e loga de novo
//
// Grupos válidos p/ --only: venda, fiado, zelinho, dashboard, comanda,
// relatorios, pessoas, despesas. "financeiro" é alias de "relatorios".
//
// Cada passo espera uma condição de "pronto" baseada em conteúdo real (nunca só
// um sleep fixo) com timeout generoso (30-45s). Se a condição não for atingida,
// o passo grava screenshot + innerText do <main> em SCRATCH/errors/<nome>.* e
// SEGUE em frente (tenta o print/vídeo do jeito que a tela estiver, em vez de
// abortar a execução inteira).

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// Playwright não está instalado no SCRATCH; usamos o do repo.
const REPO_ROOT = 'C:\\Users\\Vinicius\\orca\\zelopdv';
const { chromium } = require(path.join(REPO_ROOT, 'node_modules', 'playwright'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = __dirname;
const RAW_DIR = path.join(SCRATCH, 'raw');
const VIDEO_RAW_DIR = path.join(SCRATCH, 'video-raw');
const ERRORS_DIR = path.join(SCRATCH, 'errors');
const LOG_FILE = path.join(SCRATCH, 'capture.log');
const TIMELINE_FILE = path.join(SCRATCH, 'timeline.json');

const BASE_URL = process.env.ZELOPDV_BASE_URL || 'http://localhost:5173';
const DRY_RUN = process.argv.includes('--dry-run');
const NO_VIDEO = process.argv.includes('--no-video');
const MANUAL_LOGIN = process.argv.includes('--manual-login');
const HEADED = process.argv.includes('--headed');
const FRESH_LOGIN = process.argv.includes('--fresh-login');
const AUTH_DIR = path.join(SCRATCH, '.auth');
const AUTH_STATE_PATH = path.join(AUTH_DIR, 'state.json');
// Alias de grupo: "financeiro" cobre o mesmo fluxo que "relatorios" (nome mais
// alinhado ao que aparece na navegação do produto).
const GROUP_ALIASES = { financeiro: 'relatorios' };
const ONLY_ARG = process.argv.find((a) => a.startsWith('--only='));
const ONLY_GROUPS = ONLY_ARG
  ? ONLY_ARG.slice('--only='.length).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).map((g) => GROUP_ALIASES[g] || g)
  : null;
const LOGIN_WAIT_MS = 10 * 60 * 1000; // 10 min
const READY_TIMEOUT = 40000; // timeout generoso p/ condições de "pronto"

function shouldRun(group) {
  if (NO_VIDEO && ['venda', 'fiado'].includes(group)) return false;
  if (NO_VIDEO && group === 'zelinho-video') return false;
  if (!ONLY_GROUPS) return true;
  return ONLY_GROUPS.includes(group);
}

for (const dir of [RAW_DIR, VIDEO_RAW_DIR, ERRORS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pausa "humana" entre ações nos vídeos (300-700ms).
function humanPause() {
  const ms = 300 + Math.floor(Math.random() * 400);
  return sleep(ms);
}

function slug(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function step(name, fn, page) {
  try {
    log(`>> ${name}`);
    await fn();
    log(`OK ${name}`);
    return true;
  } catch (err) {
    log(`FALHOU ${name}: ${err?.message || err}`);
    try {
      if (page && !page.isClosed()) {
        const errPath = path.join(ERRORS_DIR, `${slug(name)}.png`);
        await page.screenshot({ path: errPath, fullPage: false }).catch(() => {});
        log(`   screenshot de erro salvo em ${errPath}`);
      }
    } catch {
      // ignora falha ao tentar capturar screenshot de erro
    }
    return false;
  }
}

/**
 * Roda uma condição de "pronto" (fn) com timeout generoso. Se falhar, registra
 * screenshot + innerText do <main> em SCRATCH/errors/ e retorna false — o
 * chamador deve SEGUIR (tentar o print/vídeo do jeito que a tela estiver) em
 * vez de abortar o passo inteiro.
 */
async function waitReady(page, name, fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    log(`   condição de pronto não atingida para "${name}": ${err?.message || err}`);
    try {
      const mainText = await page
        .locator('main')
        .first()
        .innerText({ timeout: 2000 })
        .catch(() => page.locator('body').innerText({ timeout: 2000 }).catch(() => '(sem texto)'));
      const txtPath = path.join(ERRORS_DIR, `${slug(name)}.txt`);
      fs.writeFileSync(
        txtPath,
        `[${new Date().toISOString()}] condição de pronto não atingida para "${name}": ${err?.message || err}\n\n--- innerText(main) ---\n${mainText}`
      );
      log(`   innerText salvo em ${txtPath}`);
    } catch {
      // best-effort
    }
    try {
      const errPath = path.join(ERRORS_DIR, `${slug(name)}-ready-timeout.png`);
      await page.screenshot({ path: errPath, fullPage: false }).catch(() => {});
      log(`   screenshot (condição não atingida) salvo em ${errPath}`);
    } catch {
      // best-effort
    }
    return false;
  }
}

// Fecha modais/tours/toasts que possam aparecer antes de um print/passo.
// IMPORTANTE: nunca pressiona Escape enquanto o painel do Zelinho está aberto
// (a página escuta Escape globalmente e fecharia o chat bem antes do print).
async function closeOverlays(page, { allowEscape = true } = {}) {
  try {
    const panelOpen = await page.locator('.assistant-panel.open').isVisible({ timeout: 200 }).catch(() => false);
    if (allowEscape && !panelOpen) {
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(150);
    }

    const closeSelectors = [
      '[data-close-button]', // botão de fechar real dos toasts (svelte-sonner, closeButton=true)
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
    // Deixa toasts sem botão (raros) sumirem sozinhos.
    await sleep(400);
  } catch {
    // best-effort — nunca deve abortar o fluxo chamador
  }
}

async function screenshotBoth(page, context, name, { fullPage = false, clip = null, allowEscape = true } = {}) {
  await closeOverlays(page, { allowEscape });
  const desktopPath = path.join(RAW_DIR, `desktop-${name}.png`);
  await page.screenshot({ path: desktopPath, fullPage, clip: clip?.desktop || undefined });
  log(`   screenshot desktop: ${desktopPath}`);
}

async function screenshotMobile(page, name, { fullPage = false, allowEscape = true } = {}) {
  await closeOverlays(page, { allowEscape });
  const mobilePath = path.join(RAW_DIR, `mobile-${name}.png`);
  await page.screenshot({ path: mobilePath, fullPage });
  log(`   screenshot mobile: ${mobilePath}`);
}

async function waitForLogin(page) {
  log('Faça login com a conta demo na janela aberta');
  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!url.includes('/login')) {
      log(`Login detectado. URL atual: ${url}`);
      return true;
    }
    await sleep(1000);
  }
  return false;
}

/**
 * Lê email/senha da conta demo das variáveis de ambiente DEMO_EMAIL /
 * DEMO_PASSWORD. NUNCA loga a senha, nunca lê de arquivo do repo — exporte
 * as duas variáveis antes de rodar o script (ver README.md).
 */
function readCredentials() {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    throw new Error('Defina DEMO_EMAIL e DEMO_PASSWORD no ambiente antes de rodar este script (ver README.md).');
  }
  return { email, password };
}

/**
 * Preenche o form de /login com a conta demo e envia. Autorizado
 * explicitamente pelo dono do produto/conta para esta captura automatizada.
 * Espera até LOGIN_WAIT_MS a URL sair de /login (mesma tolerância do modo
 * manual, cobrindo latência de rede/Supabase).
 */
async function autoLogin(page) {
  const { email, password } = readCredentials();
  log(`Login automático: preenchendo formulário com a conta demo (${email})...`);
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 15000 });
  log('   campo de email visível, preenchendo...');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  log('   campos preenchidos, clicando em Entrar...');
  await page.locator('button[type="submit"].auth-btn').click();
  log('   clique enviado, aguardando redirecionamento...');

  const deadline = Date.now() + LOGIN_WAIT_MS;
  let lastLogAt = 0;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!url.includes('/login')) {
      log(`Login automático concluído. URL atual: ${url}`);
      return true;
    }
    const errVisible = await page.locator('.auth-error').isVisible({ timeout: 300 }).catch(() => false);
    if (errVisible) {
      const errText = await page.locator('.auth-error').innerText().catch(() => '(sem texto)');
      log(`   erro de login exibido na tela: ${errText}`);
      return false;
    }
    if (Date.now() - lastLogAt > 5000) {
      log(`   ainda em ${url}, aguardando...`);
      lastLogAt = Date.now();
    }
    await sleep(500);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Condições de "pronto" por tela + helpers de fluxo
// ---------------------------------------------------------------------------

/** Frente de Caixa: espera um botão de produto com preço (R$) visível. */
async function readyFrenteDeCaixa(page) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="product-grid"] button[data-prod]');
      return !!btn && /R\$/.test(btn.textContent || '');
    },
    { timeout: READY_TIMEOUT }
  );
}

/** Garante que a comanda está vazia antes de montar um print/vídeo do zero. */
async function ensureComandaVazia(page) {
  const vazio = await page.getByText('VAZIO', { exact: true }).isVisible({ timeout: 1500 }).catch(() => false);
  if (vazio) return;
  const limparBtn = page.locator('button[aria-label="Limpar comanda"]');
  if (!(await limparBtn.isVisible({ timeout: 1500 }).catch(() => false))) return;
  await limparBtn.click().catch(() => {});
  const confirmBtn = page.locator('.confirm-dialog-confirm');
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click().catch(() => {});
  } else {
    // Comanda travada por confirmação pendente (checkoutSubmission): o toast
    // "Finalize a confirmação pendente..." apareceu em vez do ConfirmDialog.
    log('   aviso: não foi possível limpar a comanda (possível confirmação de venda pendente).');
  }
  await sleep(500);
}

async function addItemsToComanda(page, n) {
  const produtoBtns = page.locator('[data-testid="product-grid"] button[data-prod]');
  await produtoBtns.first().waitFor({ state: 'visible', timeout: READY_TIMEOUT });
  const count = Math.min(await produtoBtns.count(), n);
  for (let i = 0; i < count; i++) {
    await produtoBtns.nth(i).click();
    await sleep(280);
  }
  await sleep(400);
}

/**
 * Seleciona, entre as abas de categoria da Frente de Caixa, a aba "Lanches"
 * (preferida explicitamente) ou — na ausência dela — a categoria com mais
 * produtos cadastrados. Usada para o print "dashboard-desktop" (PDV vazio),
 * que não deve depender de nomes exatos de produto, só da categoria visível.
 */
async function selecionarCategoriaComMaisProdutos(page) {
  const tabs = page.locator('[data-testid="category-tab"]');
  const count = await tabs.count();
  if (count === 0) return false;

  for (let i = 0; i < count; i++) {
    const txt = (await tabs.nth(i).innerText().catch(() => '')).trim();
    if (/lanches/i.test(txt)) {
      await tabs.nth(i).click();
      await sleep(400);
      return true;
    }
  }

  let bestIdx = 0;
  let bestCount = -1;
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    await sleep(350);
    const n = await page.locator('[data-testid="product-grid"] button[data-prod]').count();
    if (n > bestCount) {
      bestCount = n;
      bestIdx = i;
    }
  }
  await tabs.nth(bestIdx).click();
  await sleep(400);
  return true;
}

/**
 * Monta uma comanda com 4 itens de categorias diferentes (1 lanche, 1 porção,
 * 2 bebidas) e quantidades variando entre 1 e 2 — sem depender de nomes
 * exatos de produto (o catálogo demo pode mudar), só das abas de categoria
 * ("Lanches"/"Porções"/"Bebidas") e da ordem dos cards visíveis nelas.
 * Faz fallback para outras categorias disponíveis se alguma dessas três não
 * existir, garantindo ainda assim ~4 itens variados na comanda.
 */
async function montarComandaVariada(page) {
  const tabs = page.locator('[data-testid="category-tab"]');
  const tabCount = await tabs.count();
  if (tabCount === 0) {
    // Sem categorias (produto sem categorização): cai no comportamento antigo.
    await addItemsToComanda(page, 4);
    return;
  }

  const tabTexts = [];
  for (let i = 0; i < tabCount; i++) {
    tabTexts.push((await tabs.nth(i).innerText().catch(() => '')).trim());
  }
  const findTabIndex = (regex) => tabTexts.findIndex((t) => regex.test(t));

  async function addFromTab(tabIdx, howManyProducts, qtyPerProduct) {
    await tabs.nth(tabIdx).click();
    await waitReady(page, 'comanda-variada-tab', () => readyFrenteDeCaixa(page));
    const produtoBtns = page.locator('[data-testid="product-grid"] button[data-prod]');
    const n = Math.min(await produtoBtns.count(), howManyProducts);
    for (let i = 0; i < n; i++) {
      for (let q = 0; q < qtyPerProduct; q++) {
        await produtoBtns.nth(i).click();
        await sleep(280);
      }
    }
    return n;
  }

  const lancheIdx = findTabIndex(/lanche/i);
  const porcaoIdx = findTabIndex(/por[cç][aã]o/i);
  const bebidaIdx = findTabIndex(/bebida/i);

  let itemsAdded = 0;
  if (lancheIdx >= 0) itemsAdded += await addFromTab(lancheIdx, 1, 1);
  if (porcaoIdx >= 0) itemsAdded += await addFromTab(porcaoIdx, 1, 2); // qty 2 pra variar quantidades
  if (bebidaIdx >= 0) itemsAdded += await addFromTab(bebidaIdx, 2, 1); // 2 bebidas diferentes, qty 1 cada

  // Fallback: nem todas as categorias esperadas existem no catálogo demo —
  // completa até ~4 itens com o que estiver disponível em outras abas.
  if (itemsAdded < 4) {
    const usedIdx = new Set([lancheIdx, porcaoIdx, bebidaIdx].filter((i) => i >= 0));
    for (let i = 0; i < tabCount && itemsAdded < 4; i++) {
      if (usedIdx.has(i)) continue;
      itemsAdded += await addFromTab(i, 1, 1);
    }
  }

  await sleep(400);
}

/**
 * Screenshot desktop do /relatorios (modo período) cobrindo hero "Receita
 * Líquida" + os 4 KPIs + o gráfico "Vendas por Dia". A região combinada pode
 * passar dos 900px de altura do viewport — por isso usamos fullPage:true
 * junto de clip: fullPage renderiza o documento inteiro antes de recortar,
 * então o clip (calculado em coordenadas absolutas da página, com scrollY=0)
 * funciona mesmo com o gráfico abaixo da dobra, sem depender de scroll manual.
 */
async function screenshotFinancialOverview(page, outPath) {
  await page.locator('.card-hero').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.card-hero + .grid').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('h3', { hasText: 'Vendas por Dia' }).first().waitFor({ state: 'visible', timeout: 15000 });

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(150);

  const box = await page.evaluate(() => {
    const hero = document.querySelector('.card-hero');
    const kpis = hero?.nextElementSibling;
    const h3s = Array.from(document.querySelectorAll('h3'));
    const chartTitle = h3s.find((el) => el.textContent?.trim() === 'Vendas por Dia');
    const chartCard = chartTitle?.closest('.card-inset') || chartTitle;
    const rects = [hero, kpis, chartCard].filter(Boolean).map((el) => el.getBoundingClientRect());
    if (rects.length < 3) return null;
    const margin = 16;
    const x = Math.max(0, Math.min(...rects.map((r) => r.x)) - margin);
    const y = Math.max(0, Math.min(...rects.map((r) => r.y)) - margin);
    const right = Math.max(...rects.map((r) => r.x + r.width)) + margin;
    const bottom = Math.max(...rects.map((r) => r.y + r.height)) + margin;
    return { x, y, width: right - x, height: bottom - y };
  });
  if (!box) throw new Error('Não foi possível medir hero + KPIs + gráfico (elementos ausentes).');

  await page.screenshot({ path: outPath, fullPage: true, clip: box });
}

/**
 * Fluxo completo de uma venda via Pix (atalho de teclado "X"), incluindo o
 * passo que faltava no script original: fechar o ModalSucesso clicando em
 * "Novo Pedido". Sem isso, `checkoutSubmission` nunca é limpo no app e toda
 * interação seguinte com a comanda mostra o toast "Finalize a confirmação
 * pendente antes de alterar esta venda.".
 */
async function completarVendaPix(page, { itemCount = 3, name = 'venda' } = {}) {
  const produtoBtns = page.locator('[data-testid="product-grid"] button[data-prod]');
  const count = Math.min(await produtoBtns.count(), itemCount);
  for (let i = 0; i < count; i++) {
    await produtoBtns.nth(i).click();
    await humanPause();
  }
  await humanPause();

  const cobrar = page.locator('[data-testid="btn-cobrar"]');
  await cobrar.waitFor({ state: 'visible', timeout: 10000 });
  await cobrar.click();
  await humanPause();

  // Atalho de teclado do ModalPagamento: X = Pix (evita ter que preencher
  // "valor recebido" manualmente, que só é obrigatório para Dinheiro).
  await page.keyboard.press('x').catch(() => {});
  await humanPause();

  const confirmBtn = page.locator('button.btn-confirm');
  await confirmBtn.waitFor({ state: 'visible', timeout: 8000 });
  await confirmBtn.click();

  const sucessoOk = await waitReady(page, `${name}-sucesso`, async () => {
    await page.getByText('Venda Realizada!', { exact: false }).waitFor({ timeout: 15000 });
  });

  if (sucessoOk) {
    // Fecha o modal de sucesso corretamente (dispara finalizarFluxoSucesso():
    // zera a comanda e limpa checkoutSubmission) em vez de deixar a venda
    // "pendente de confirmação" travando a próxima interação com o PDV.
    const novoPedido = page.getByRole('button', { name: 'Novo Pedido' });
    if (await novoPedido.isVisible({ timeout: 3000 }).catch(() => false)) {
      await novoPedido.click();
      await page.getByText('Venda Realizada!', { exact: false }).waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    }
  }
  return sucessoOk;
}

/** Escolhe, dentre os .person-card visíveis, o de MAIOR saldo devedor. */
async function selecionarPessoaMaiorSaldo(page) {
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
  await page.locator('.person-card').nth(bestIndex).click({ timeout: 8000 });
  return true;
}

/**
 * Troca para "Por Período", aplica o preset "Últimos 30" (bate com os ~768
 * vendas/30 dias da conta demo) e espera o hero "Receita Líquida" mostrar um
 * valor != R$ 0,00 e o gráfico "Vendas por Dia" aparecer.
 *
 * ARMADILHA (causa do bug "print sai com Hoje em vez de Últimos 30"): o
 * onMount da página já chama aplicarPreset('hoje') + carregarRelatorioPeriodo()
 * ANTES de qualquer interação do script. Isso deixa o hero "Receita Líquida"
 * com um valor != R$ 0,00 (ex.: R$ 584 do dia) mesmo antes de clicarmos em
 * "Por Período" → "Últimos 30". Um waitForFunction que só checa "valor não
 * vazio e diferente de R$ 0,00" passa IMEDIATAMENTE após o clique em
 * "Últimos 30" — antes do fetch assíncrono de carregarRelatorioPeriodo()
 * terminar — e o screenshot sai com os dados antigos de "Hoje". Por isso
 * capturamos o texto do hero ANTES do clique e exigimos que o texto MUDE,
 * além de checar a classe ativa do botão do preset.
 */
async function prepararRelatoriosPeriodo(page) {
  // Cobre tanto o auth-gate do layout /gestao quanto o primeiro fetch (caixa
  // de hoje + período do dia) disparado no onMount da página.
  //
  // ARMADILHA CONFIRMADA (ver relatório do bug em src/routes/relatorios/+page.svelte):
  // a variável `loading` que controla este texto é reaproveitada por
  // carregarRelatorioDoCaixa() (onMount, ~linha 239) e já vira `false` assim
  // que o caixa "Por Caixa" termina de carregar — MUITO antes de
  // carregarFechamentosRecentes() e do carregamento inicial do período
  // ("hoje", ~linha 243-244) terminarem em segundo plano. Clicar em "Por
  // Período" → preset logo que este texto some corre contra esse
  // carregarRelatorioPeriodo('hoje') do onMount, que ainda não terminou — e
  // quando ele termina DEPOIS do nosso clique, sobrescreve silenciosamente
  // o preset escolhido (confirmado via log de rede: o fetch de vendas/despesas
  // ainda usava o intervalo de "hoje" segundos depois do clique em "Últimos
  // 30"). Por isso damos uma folga extra aqui esperando a rede assentar antes
  // de tocar em qualquer preset — não elimina a corrida na origem (isso exige
  // mudança no app), mas reduz muito a chance de flagrá-la no meio do caminho.
  await page.waitForFunction(
    () => !document.body.innerText.includes('Carregando relatórios...'),
    { timeout: READY_TIMEOUT }
  );
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

  const periodoTab = page.getByRole('button', { name: 'Por Período', exact: true });
  await periodoTab.waitFor({ state: 'visible', timeout: READY_TIMEOUT });
  await periodoTab.click();

  const preset30 = page.getByRole('button', { name: 'Últimos 30', exact: true });
  await preset30.waitFor({ state: 'visible', timeout: 10000 });

  // Snapshot do hero ANTES do clique: ainda reflete o preset "Hoje" herdado
  // do onMount. Usado abaixo para detectar quando o valor de fato mudou.
  const heroBefore = await page
    .locator('.card-hero .text-3xl')
    .first()
    .textContent()
    .catch(() => null);

  await preset30.click();

  // 1) O preset "Últimos 30" precisa realmente ficar ativo (classe aplicada
  //    depois do re-render do Svelte).
  await page.waitForFunction(
    () => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.trim() === 'Últimos 30');
      return !!btn && btn.classList.contains('report-preset-active');
    },
    { timeout: 10000 }
  );

  // 2) O hero precisa ter um valor não vazio, diferente de R$ 0,00 E
  //    diferente do valor capturado antes do clique (garante que o fetch
  //    assíncrono de "Últimos 30" já terminou, não só que o "Hoje" antigo
  //    ainda está lá).
  await page.waitForFunction(
    (prevText) => {
      const hero = document.querySelector('.card-hero .text-3xl');
      const txt = hero?.textContent?.trim() || '';
      return txt.length > 0 && !/^R\$\s*0,00$/.test(txt) && txt !== prevText;
    },
    heroBefore,
    { timeout: READY_TIMEOUT }
  );
  await page.locator('h3', { hasText: 'Vendas por Dia' }).waitFor({ state: 'visible', timeout: 15000 });

  // Respiro para a animação do gráfico de barras / donut assentar.
  await sleep(1500);
}

/**
 * Lê o hero "Receita Líquida" de /relatorios (modo período) e devolve se o
 * selo "Despesas: -R$ ..." está visível E se o valor grande (Receita Líquida)
 * é diferente do "Bruto: R$ ...". Isso detecta o bug de renderização
 * intermediária de carregarRelatorioPeriodo() em src/routes/relatorios/+page.svelte:
 * `periodoVendas` é atribuído (linha ~794) e dispara um re-render ANTES de
 * `periodoDespesas` ser atribuído (linha ~917, só depois do 2º Promise.all).
 * Nessa janela, Bruto já reflete o período novo mas o selo de Despesas ainda
 * está com o valor (tipicamente vazio) do preset anterior — exatamente o
 * screenshot quebrado que motivou este helper.
 */
async function heroPeriodoTemSeloDespesas(page) {
  return page.evaluate(() => {
    const hero = document.querySelector('.card-hero');
    if (!hero) return false;
    const valueEl = hero.querySelector('.text-3xl');
    const receitaText = (valueEl?.textContent || '').trim();
    const spans = Array.from(hero.querySelectorAll('span'));
    const brutoSpan = spans.find((s) => (s.textContent || '').trim().startsWith('Bruto:'));
    const brutoText = brutoSpan ? brutoSpan.textContent.replace('Bruto:', '').trim() : '';
    const temDespesas = spans.some((s) => (s.textContent || '').trim().startsWith('Despesas:'));
    return temDespesas && receitaText.length > 0 && receitaText !== brutoText;
  });
}

/**
 * Roda prepararRelatoriosPeriodo() e só dá por pronto quando o hero mostra o
 * selo "Despesas:" com Receita Líquida != Bruto (ver heroPeriodoTemSeloDespesas
 * acima). Se não aparecer em 20s, recarrega a página inteira e refaz o preset
 * do zero — até 3 tentativas no total — antes de desistir (lança erro, que o
 * chamador via waitReady() trata como "condição de pronto não atingida" sem
 * abortar a captura inteira).
 */
async function esperarSeloDespesasEReceitaDiferente(page, name) {
  const MAX_ATTEMPTS = 3;
  const SELO_TIMEOUT = 20000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      log(`   recarregando "${name}" para tentar pegar o selo de Despesas (tentativa ${attempt}/${MAX_ATTEMPTS})...`);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await prepararRelatoriosPeriodo(page);

    const deadline = Date.now() + SELO_TIMEOUT;
    let ok = false;
    while (Date.now() < deadline) {
      if (await heroPeriodoTemSeloDespesas(page).catch(() => false)) {
        ok = true;
        break;
      }
      await sleep(300);
    }
    if (ok) return true;
    log(`   selo de Despesas não apareceu em "${name}" dentro de ${SELO_TIMEOUT}ms (tentativa ${attempt}/${MAX_ATTEMPTS}).`);
  }
  throw new Error(`Selo de Despesas nunca apareceu em "${name}" após ${MAX_ATTEMPTS} tentativas.`);
}

async function screenshotKpiCrop(page, outPath) {
  const hero = page.locator('.card-hero').first();
  const kpis = page.locator('.card-hero + .grid').first();
  await hero.waitFor({ state: 'visible', timeout: 15000 });
  await kpis.waitFor({ state: 'visible', timeout: 15000 });
  const heroBox = await hero.boundingBox();
  const kpisBox = await kpis.boundingBox();
  if (!heroBox || !kpisBox) throw new Error('Não foi possível medir o bloco de KPIs (boundingBox nulo).');
  const margin = 16;
  const x = Math.max(0, Math.min(heroBox.x, kpisBox.x) - margin);
  const y = Math.max(0, Math.min(heroBox.y, kpisBox.y) - margin);
  const right = Math.max(heroBox.x + heroBox.width, kpisBox.x + kpisBox.width) + margin;
  const bottom = Math.max(heroBox.y + heroBox.height, kpisBox.y + kpisBox.height) + margin;
  await page.screenshot({ path: outPath, clip: { x, y, width: right - x, height: bottom - y } });
}

async function readyPessoas(page, { mobile = false } = {}) {
  await page.waitForFunction(
    (isMobile) => {
      const sel = isMobile ? '.mobile-list .person-card' : '.desktop-table tbody tr';
      return document.querySelectorAll(sel).length > 0;
    },
    mobile,
    { timeout: READY_TIMEOUT }
  );
}

async function readyDespesas(page) {
  await page.waitForFunction(
    () => {
      const body = document.querySelector('table tbody');
      return !!body && body.children.length > 0; // linha de dado real ou "Nenhuma despesa no período."
    },
    { timeout: READY_TIMEOUT }
  );
}

/**
 * A página /gestao/despesas tem uma corrida real de carregamento: o
 * onMount chama ensureActiveSubscription() (auth/assinatura) e só DEPOIS
 * seta `uid`, o que dispara loadExpenses(). Em navegações rápidas
 * (goto logo após outra página, como faz este script), esse fetch às
 * vezes corre contra o carregamento da própria página/hydração e volta
 * vazio mesmo com despesas cadastradas — a tela cai no estado real "Nenhuma
 * despesa no período." só que incorretamente. A conta demo SEMPRE tem 12
 * despesas em setembro (ver scratchpad/demo-seed/24-expenses-fix.mjs), então
 * se aparecer vazio, recarrega (até 2x, com respiro crescente) antes de
 * desistir — um reload isolado às vezes ainda perde a corrida (a própria
 * navegação de reload cancela um fetch em voo, gerando um "Failed to fetch"
 * inofensivo, mas se checarmos rápido demais depois ainda vemos o estado
 * vazio de antes do onMount terminar a cadeia auth → assinatura → despesas).
 */
async function ensureDespesasCarregadas(page, name) {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await waitReady(page, `${name}-ready-${attempt}`, () => readyDespesas(page));
    await sleep(500); // respiro pro texto/total assentarem após o waitForFunction
    const vazio = await page
      .getByText('Nenhuma despesa no período.', { exact: false })
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (!vazio) return;
    if (attempt === MAX_ATTEMPTS) {
      log(`   aviso: despesas continua vazio em "${name}" mesmo após ${attempt - 1} reload(s).`);
      return;
    }
    log(`   despesas veio vazio em "${name}" (tentativa ${attempt}/${MAX_ATTEMPTS}) — recarregando a página...`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1500 + attempt * 800); // respiro crescente pra cadeia auth->assinatura->despesas terminar
  }
}

/** Espera o FAB do Zelinho aparecer (ou seja, saiu de "Verificando autenticação..."). */
async function esperarFabZelinho(page) {
  await page.locator('.zelinho-fab').waitFor({ state: 'visible', timeout: READY_TIMEOUT });
}

async function abrirChatZelinho(page) {
  await page.locator('.zelinho-fab').click();
  await page.locator('.assistant-panel.open').waitFor({ state: 'visible', timeout: 8000 });
}

/**
 * Envia uma mensagem no chat do Zelinho (já aberto) e espera o streaming
 * terminar: textarea reabilitado (fica disabled={isStreaming}) + status
 * "Pronto para ajudar". Registra o texto se a resposta vier com erro.
 */
async function enviarMensagemZelinho(page, texto, { name = 'zelinho' } = {}) {
  const textarea = page.locator('.assistant-panel.open #zelinho-message');
  await textarea.waitFor({ state: 'visible', timeout: 8000 });
  await textarea.click();
  await page.keyboard.type(texto, { delay: 35 });
  await humanPause();
  await page.locator('.assistant-panel.open button.send[aria-label="Enviar"]').click();

  // Tolera respostas muito rápidas: não falha se nunca "pegarmos" o estado disabled.
  await page
    .locator('.assistant-panel.open #zelinho-message[disabled]')
    .waitFor({ state: 'attached', timeout: 5000 })
    .catch(() => {});

  const finished = await waitReady(page, `${name}-streaming`, async () => {
    await page.locator('.assistant-panel.open #zelinho-message:not([disabled])').waitFor({ timeout: READY_TIMEOUT });
    await page
      .locator('.assistant-panel.open .status')
      .filter({ hasText: 'Pronto para ajudar' })
      .waitFor({ timeout: 8000 });
  });

  const hasError = await page
    .locator('.assistant-panel.open .p-assistant.error')
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (hasError) {
    const errText = await page
      .locator('.assistant-panel.open .p-assistant.error .txt')
      .first()
      .innerText()
      .catch(() => '(sem texto)');
    log(`   Zelinho respondeu com erro: ${errText}`);
    const errPath = path.join(ERRORS_DIR, `${slug(name)}-resposta-erro.txt`);
    fs.writeFileSync(errPath, `[${new Date().toISOString()}] Zelinho respondeu com erro:\n${errText}`);
  }
  return finished && !hasError;
}

async function main() {
  log('==== capture.mjs iniciado ====');
  log(
    `DRY_RUN=${DRY_RUN} BASE_URL=${BASE_URL} NO_VIDEO=${NO_VIDEO} ONLY=${ONLY_GROUPS ? ONLY_GROUPS.join(',') : '(todos)'} ` +
      `MANUAL_LOGIN=${MANUAL_LOGIN} HEADED=${HEADED} FRESH_LOGIN=${FRESH_LOGIN}`
  );

  const browser = await chromium.launch({ headless: !HEADED });

  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  };
  if (!DRY_RUN) {
    contextOptions.recordVideo = { dir: VIDEO_RAW_DIR, size: { width: 1280, height: 800 } };
  }

  const canReuseSession = !DRY_RUN && !MANUAL_LOGIN && !FRESH_LOGIN && fs.existsSync(AUTH_STATE_PATH);
  if (canReuseSession) {
    contextOptions.storageState = AUTH_STATE_PATH;
  }

  const context = await browser.newContext(contextOptions);
  const contextCreatedAt = Date.now();
  const page = await context.newPage();
  page.on('pageerror', (err) => log(`   [pageerror] ${err?.message || err}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') log(`   [console.error] ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    // Analytics/tag-manager de terceiros falham sempre em ambiente de captura
    // (bloqueados/sem rede real) e não afetam a captura — silencia o ruído.
    if (/google-analytics\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|google\.com\/(ccm|rmkt)/.test(url)) return;
    log(`   [requestfailed] ${req.method()} ${url} — ${req.failure()?.errorText}`);
  });

  const timeline = { contextCreatedAt, flows: {} };

  try {
    if (DRY_RUN) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      log('Faça login com a conta demo na janela aberta');
      log('--dry-run: validação de abertura do /login concluída. Encerrando sem prosseguir.');
      await sleep(1500);
      await context.close();
      await browser.close();
      log('==== capture.mjs (dry-run) finalizado ====');
      return;
    }

    let loggedIn = false;
    if (canReuseSession) {
      log(`Reaproveitando sessão salva em ${AUTH_STATE_PATH}...`);
      await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' });
      await sleep(800);
      loggedIn = !page.url().includes('/login');
      if (loggedIn) {
        log(`Sessão reaproveitada com sucesso. URL atual: ${page.url()}`);
      } else {
        log('Sessão salva expirou/inválida; refazendo login.');
      }
    }

    if (!loggedIn) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      if (!MANUAL_LOGIN) {
        // A página SSR renderiza o form antes da hidratação do Svelte; um
        // clique em "Entrar" antes disso dispara um submit HTML nativo (GET,
        // recarrega /login? em branco) em vez do handler async com fetch.
        // networkidle já ajuda, mas hidratar ainda leva um instante depois
        // dos módulos carregarem — por isso a espera extra abaixo.
        await sleep(1500);
      }
      loggedIn = MANUAL_LOGIN ? await waitForLogin(page) : await autoLogin(page);
      if (!loggedIn) {
        log(
          MANUAL_LOGIN
            ? 'Tempo esgotado (10 min) esperando login. Encerrando.'
            : 'Login automático falhou (timeout esperando sair de /login). Encerrando.'
        );
        await context.close();
        await browser.close();
        process.exitCode = 1;
        return;
      }
      try {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        await context.storageState({ path: AUTH_STATE_PATH });
        log(`Sessão salva em ${AUTH_STATE_PATH} (reaproveitável nas próximas rodadas).`);
      } catch (err) {
        log(`   aviso: não foi possível salvar storageState: ${err?.message || err}`);
      }
    }

    // Pequena espera para a página logada assentar (dados carregando).
    await sleep(1500);
    await closeOverlays(page);

    // ---------------------------------------------------------------
    // 1) VÍDEOS (viewport 1280x800, ANTES dos prints mobile)
    // ---------------------------------------------------------------
    if (shouldRun('venda')) {
      await step('vídeo: fluxo venda', async () => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' });
        await closeOverlays(page);
        await ensureComandaVazia(page);
        await waitReady(page, 'video-venda-ready', () => readyFrenteDeCaixa(page));
        // ensureComandaVazia() pode disparar o toast "Comanda limpa" (dura até
        // 3s, addToast() default). Espera ele sumir de vez antes de marcar o
        // início do clipe — como o corte usa startMs/endMs, esse tempo de
        // espera NUNCA aparece no vídeo final (fica antes do "start"), então
        // não custa "trecho morto"; só evita o toast tampando o botão Receber
        // no primeiro frame.
        await page
          .getByText('Comanda limpa', { exact: true })
          .waitFor({ state: 'hidden', timeout: 3500 })
          .catch(() => {});
        await closeOverlays(page);

        // Marca o início do trecho útil do vídeo só depois da tela estar pronta
        // (produtos carregados) — senão o clipe abre em "Carregando produtos...".
        const start = Date.now() - contextCreatedAt;

        await completarVendaPix(page, { itemCount: 3, name: 'video-venda' });
        await sleep(1000); // respiro final do clipe, comanda já vazia/pronta p/ próxima venda

        const end = Date.now() - contextCreatedAt;
        timeline.flows.venda = { startMs: start, endMs: end };
      }, page);
    }

    if (shouldRun('fiado')) {
      await step('vídeo: fluxo fiado', async () => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(`${BASE_URL}/gestao/fichario`, { waitUntil: 'domcontentloaded' });
        await closeOverlays(page);
        await waitReady(page, 'video-fiado-ready', async () => {
          await page.locator('.person-card').first().waitFor({ state: 'visible', timeout: READY_TIMEOUT });
        });

        const start = Date.now() - contextCreatedAt;

        const picked = await selecionarPessoaMaiorSaldo(page);
        if (!picked) await page.locator('.person-card').first().click({ timeout: 8000 }).catch(() => {});
        await humanPause();

        await waitReady(page, 'video-fiado-hero', async () => {
          await page.locator('.hero-card').waitFor({ state: 'visible', timeout: 15000 });
        });
        await sleep(900); // dwell pra "ler" o saldo antes de rolar

        await waitReady(page, 'video-fiado-historico', async () => {
          await page.locator('.statement-loading').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
          await page.locator('.history-card').waitFor({ state: 'visible', timeout: 15000 });
        });

        await page.locator('.history-card').scrollIntoViewIfNeeded().catch(() => {});
        await sleep(400);
        // Rola suavemente pelo extrato em vários passos pequenos (em vez de um jump seco).
        for (let i = 0; i < 5; i++) {
          await page.mouse.wheel(0, 240);
          await sleep(380 + Math.floor(Math.random() * 140));
        }
        await sleep(1000); // respiro final

        const end = Date.now() - contextCreatedAt;
        timeline.flows.fiado = { startMs: start, endMs: end };
      }, page);
    }

    if (shouldRun('zelinho') || shouldRun('zelinho-video')) {
      await step('vídeo: fluxo zelinho', async () => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(`${BASE_URL}/gestao/gerente`, { waitUntil: 'domcontentloaded' });
        await closeOverlays(page);

        const fabOk = await waitReady(page, 'video-zelinho-fab', () => esperarFabZelinho(page));
        if (!fabOk) return; // sem FAB visível, não há como abrir o chat — segue o resto do script.

        const start = Date.now() - contextCreatedAt;

        await abrirChatZelinho(page);
        await humanPause();
        const ok = await enviarMensagemZelinho(page, 'Quanto sobrou este mês?', { name: 'video-zelinho' });
        await sleep(1200); // deixa a resposta assentar visualmente

        const end = Date.now() - contextCreatedAt;
        // failed:true faz o cut-videos.mjs pular este fluxo (nunca gera um
        // zelinho.mp4 mostrando a mensagem de erro "Zelinho Gerente indisponível.").
        timeline.flows.zelinho = { startMs: start, endMs: end, failed: !ok };
        if (!ok) log('   aviso: resposta do Zelinho falhou/deu erro; fluxo de vídeo marcado como failed.');
      }, page);
    }

    fs.writeFileSync(TIMELINE_FILE, JSON.stringify(timeline, null, 2));
    log(`timeline.json salvo em ${TIMELINE_FILE}`);

    // ---------------------------------------------------------------
    // 2) PRINTS DESKTOP (1440x900, dpr já é 2 desde a criação do context)
    // ---------------------------------------------------------------
    if (shouldRun('dashboard')) {
      await step('desktop: dashboard-desktop (Frente de Caixa /app)', async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' });
        await closeOverlays(page);
        await ensureComandaVazia(page);
        await waitReady(page, 'dashboard-desktop', () => readyFrenteDeCaixa(page));
        // Mostra a categoria com mais produtos (ou "Lanches", se existir) em
        // vez de qualquer aba padrão — pedido explícito p/ o print do PDV vazio.
        await selecionarCategoriaComMaisProdutos(page).catch(() => {});
        await screenshotBoth(page, context, 'dashboard-desktop');
      }, page);
    }

    if (shouldRun('comanda')) {
      await step('desktop: app-comanda (Frente de Caixa com 4 itens variados)', async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' });
        await closeOverlays(page);
        await ensureComandaVazia(page);
        await waitReady(page, 'app-comanda', () => readyFrenteDeCaixa(page));
        await montarComandaVariada(page);
        await screenshotBoth(page, context, 'app-comanda');
        // Limpa a comanda logo depois do print pra não vazar pros próximos
        // fluxos (mobile "comanda" já limpa antes, mas outras contas/reexecuções
        // do script não devem herdar essa comanda populada).
        await ensureComandaVazia(page).catch(() => {});
      }, page);
    }

    if (shouldRun('relatorios')) {
      await step('desktop: financial-screen (/relatorios, Por Período · Últimos 30)', async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${BASE_URL}/relatorios`, { waitUntil: 'domcontentloaded' });
        await waitReady(page, 'financial-screen', () => esperarSeloDespesasEReceitaDiferente(page, 'financial-screen'));
        await closeOverlays(page);
        const outPath = path.join(RAW_DIR, 'desktop-financial-screen.png');
        await screenshotFinancialOverview(page, outPath);
        log(`   screenshot desktop: ${outPath}`);
      }, page);

      await step('desktop: financial-kpis-crop (topo do /relatorios)', async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${BASE_URL}/relatorios`, { waitUntil: 'domcontentloaded' });
        await waitReady(page, 'financial-kpis-crop', () => esperarSeloDespesasEReceitaDiferente(page, 'financial-kpis-crop'));
        await closeOverlays(page);
        const outPath = path.join(RAW_DIR, 'desktop-financial-kpis-crop.png');
        await screenshotKpiCrop(page, outPath);
        log(`   screenshot desktop: ${outPath}`);
      }, page);
    }

    if (shouldRun('pessoas')) {
      await step('desktop: customers-screen (/gestao/pessoas)', async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${BASE_URL}/gestao/pessoas`, { waitUntil: 'domcontentloaded' });
        await waitReady(page, 'customers-screen', () => readyPessoas(page, { mobile: false }));
        await screenshotBoth(page, context, 'customers-screen');
      }, page);
    }

    if (shouldRun('despesas')) {
      await step('desktop: despesas-page (/gestao/despesas)', async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${BASE_URL}/gestao/despesas`, { waitUntil: 'domcontentloaded' });
        await ensureDespesasCarregadas(page, 'despesas-page');
        await screenshotBoth(page, context, 'despesas-page');
      }, page);
    }

    if (shouldRun('zelinho')) {
      await step('desktop: zelinho respondendo', async () => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${BASE_URL}/gestao/gerente`, { waitUntil: 'domcontentloaded' });
        await closeOverlays(page);
        const fabOk = await waitReady(page, 'zelinho-desktop-fab', () => esperarFabZelinho(page));
        let ok = false;
        if (fabOk) {
          await abrirChatZelinho(page);
          ok = await enviarMensagemZelinho(page, 'Quanto sobrou este mês?', { name: 'zelinho-desktop' });
        }
        await sleep(600);
        // allowEscape:false — o painel do Zelinho precisa continuar aberto no print.
        if (ok) {
          await screenshotBoth(page, context, 'zelinho', { allowEscape: false });
        } else {
          // Resposta com erro (ex.: "Zelinho Gerente indisponível.") ou FAB
          // nunca apareceu: NÃO salva como desktop-zelinho.png (nome final),
          // só em errors/ para inspeção — evita a landing usar um print de erro.
          await closeOverlays(page, { allowEscape: false });
          const errPath = path.join(ERRORS_DIR, 'zelinho-desktop.png');
          await page.screenshot({ path: errPath, fullPage: false }).catch(() => {});
          log(`   Zelinho com erro/indisponível: screenshot salvo em ${errPath} (NÃO salvo como desktop-zelinho.png)`);
        }
      }, page);
    }

    // ---------------------------------------------------------------
    // 3) PRINTS MOBILE (390x844) — mesmo page, mesmo context, sem novo login.
    // ---------------------------------------------------------------
    const mobileTargets = [
      { group: 'dashboard', name: 'dashboard-desktop', url: '/app' },
      { group: 'comanda', name: 'app-comanda', url: '/app', comanda: true },
      { group: 'relatorios', name: 'financial-screen', url: '/relatorios', relatorios: true },
      { group: 'pessoas', name: 'customers-screen', url: '/gestao/pessoas', pessoas: true },
      { group: 'despesas', name: 'despesas-page', url: '/gestao/despesas', despesas: true },
      { group: 'zelinho', name: 'zelinho', url: '/gestao/gerente', zelinho: true },
    ];

    for (const target of mobileTargets) {
      if (!shouldRun(target.group)) continue;
      await step(`mobile: ${target.name}`, async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${BASE_URL}${target.url}`, { waitUntil: 'domcontentloaded' });
        await closeOverlays(page);

        if (target.comanda || target.url === '/app') {
          await ensureComandaVazia(page);
          await waitReady(page, `mobile-${target.name}`, () => readyFrenteDeCaixa(page));
        }
        if (target.comanda) {
          await montarComandaVariada(page);
          // No mobile a comanda fica atrás do botão "Ver Comanda" (a lista de
          // itens só aparece no drawer, showMobileCart=true) — sem isso o
          // print sairia mostrando só a grade de produtos.
          const verComandaBtn = page.getByRole('button', { name: 'Ver Comanda' });
          if (await verComandaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await verComandaBtn.click();
            await page.locator('[data-testid="cart"]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            await sleep(300);
          }
        } else if (target.url === '/app') {
          // Dashboard mobile (PDV vazio): mesma escolha de categoria do print desktop.
          await selecionarCategoriaComMaisProdutos(page).catch(() => {});
        }
        if (target.relatorios) {
          await waitReady(page, `mobile-${target.name}`, () => esperarSeloDespesasEReceitaDiferente(page, `mobile-${target.name}`));
          // O filtro (abas "Por Caixa/Por Período" + presets) ocupa a primeira
          // tela inteira no mobile — rola até o hero pra ele aparecer no print.
          // scrollIntoViewIfNeeded alinha pela borda mais próxima: como o hero
          // está abaixo da dobra, ele gruda no RODAPÉ do viewport e os KPIs
          // (que vêm depois no DOM) ficam fora da tela. Rolagem manual com
          // margem no topo garante hero + início dos KPIs visíveis juntos.
          await page.evaluate(() => {
            const hero = document.querySelector('.card-hero');
            if (hero) {
              const y = hero.getBoundingClientRect().top + window.scrollY - 12;
              window.scrollTo(0, Math.max(0, y));
            }
          });
          await sleep(400);
        }
        if (target.pessoas) {
          await waitReady(page, `mobile-${target.name}`, () => readyPessoas(page, { mobile: true }));
          // Lista mobile é ordenada por nome, não por saldo — a 1a pessoa com
          // fiado em aberto pode estar fora da tela inicial. Rola até o
          // primeiro .person-card com saldo devedor (.fiado-devedor) para
          // garantir que o print mostre fiado em aberto, não só "Sem saldo".
          // /gestao/* usa um <main id="gestao-main-content"> com
          // overflow-y-auto PRÓPRIO — diferente de /relatorios, que rola a
          // window. scrollIntoView({block:'start'}) acha o ancestral
          // rolável certo sozinho (não precisa saber o id do container).
          await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.person-card')).find((c) =>
              c.querySelector('.fiado-devedor')
            );
            card?.scrollIntoView({ block: 'start' });
          });
          await sleep(300);
        }
        if (target.despesas) {
          await ensureDespesasCarregadas(page, `mobile-${target.name}`);
        }
        let zelinhoOk = true;
        if (target.zelinho) {
          const fabOk = await waitReady(page, `mobile-${target.name}-fab`, () => esperarFabZelinho(page));
          zelinhoOk = false;
          if (fabOk) {
            await abrirChatZelinho(page);
            zelinhoOk = await enviarMensagemZelinho(page, 'Quanto sobrou este mês?', { name: `mobile-${target.name}` });
          }
          await sleep(500);
        }

        if (target.zelinho && !zelinhoOk) {
          // Mesma regra do desktop: erro/indisponibilidade não vira print final.
          await closeOverlays(page, { allowEscape: false });
          const errPath = path.join(ERRORS_DIR, 'zelinho-mobile.png');
          await page.screenshot({ path: errPath, fullPage: false }).catch(() => {});
          log(`   Zelinho com erro/indisponível: screenshot salvo em ${errPath} (NÃO salvo como mobile-zelinho.png)`);
        } else {
          // allowEscape:false no zelinho — mesmo motivo do print desktop.
          await screenshotMobile(page, target.name, { allowEscape: !target.zelinho });
        }

        if (target.comanda) {
          // Limpa a comanda depois do print pra não vazar pra próxima execução.
          await ensureComandaVazia(page).catch(() => {});
        }
      }, page);
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    log('==== capture.mjs finalizado ====');
    logStream.end();
  }
}

main().catch((err) => {
  log(`ERRO FATAL: ${err?.stack || err}`);
  process.exitCode = 1;
});
