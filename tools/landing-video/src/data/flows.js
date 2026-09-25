// Dados de cada fluxo x formato: geometria da captura (pra mapear x/y pro
// palco do device), eventos de toque (pra Camera/TapRipple) e legendas
// cineticas (pra Caption). Tempos de evento/legenda sao em ms, relativos ao
// INICIO DO VIDEO FONTE (nao ao frame 0 da composicao) — a composicao decide
// quantos frames de intro entram antes do video comecar a tocar.
//
// FPS de todas as composicoes: 30.
export const FPS = 30;

export const LOGO_SRC = '/logo-horizontal-cropped.webp';

// ---------------------------------------------------------------------------
// VENDA
// ---------------------------------------------------------------------------
// Recapturado em 2026-09-24 (modal de pagamento mostrando "R$ 44,00" em vez
// de "R$ 44.00" — ver tools/landing-video/README.md "Como recapturar so a
// venda"). Gerado com `node scripts/print-capture-events.mjs venda` a partir
// de public/captures/mobile/venda.events.json (14 eventos reais, cursor
// sintetico — capture-mobile.mjs).
const vendaMobileEvents = [
  { tMs: 22, type: 'tap', x: 126, y: 241, label: 'Categoria: Lanches' },
  { tMs: 542, type: 'tap', x: 281, y: 521, label: 'X-Salada' },
  { tMs: 1083, type: 'tap', x: 207, y: 241, label: 'Categoria: Porções' },
  { tMs: 1565, type: 'tap', x: 110, y: 462, label: 'Batata Frita Média' },
  { tMs: 2147, type: 'tap', x: 44, y: 241, label: 'Categoria: Bebidas' },
  { tMs: 2612, type: 'tap', x: 110, y: 708, label: 'Refrigerante Lata 350ml' },
  { tMs: 3135, type: 'tap', x: 574, y: 241, label: 'Categoria: Doces & Sobremesas' },
  { tMs: 3610, type: 'tap', x: 110, y: 580, label: 'Brigadeiro' },
  { tMs: 4868, type: 'tap', x: 304, y: 746, label: 'Ver Comanda' },
  { tMs: 5697, type: 'tap', x: 287, y: 728, label: 'Receber' },
  { tMs: 6424, type: 'tap', x: 273, y: 380, label: 'Pix' },
  { tMs: 7123, type: 'tap', x: 248, y: 686, label: 'Confirmar pagamento' },
  { tMs: 8149, type: 'tap', x: 284, y: 488, label: 'Novo Pedido' },
  { tMs: 8235, type: 'wait', x: null, y: null, label: 'Respiro final' },
];

// Recapturado em 2026-09-24 — agora COM events.json real (cursor sintetico,
// capture-desktop-events.mjs), mesma estrutura de fluxo do mobile (categoria
// -> 4 itens -> Receber -> Pix -> Confirmar -> Novo Pedido). Substitui a
// timeline reconstruida a mao que existia antes (ver historico do README se
// precisar da versao antiga).
const vendaDesktopEvents = [
  { tMs: 18, type: 'tap', x: 366, y: 182, label: 'Categoria: Lanches' },
  { tMs: 418, type: 'tap', x: 619, y: 407, label: 'X-Salada' },
  { tMs: 953, type: 'tap', x: 447, y: 182, label: 'Categoria: Porções' },
  { tMs: 1370, type: 'tap', x: 517, y: 277, label: 'Batata Frita Média' },
  { tMs: 1922, type: 'tap', x: 284, y: 182, label: 'Categoria: Bebidas' },
  { tMs: 2335, type: 'tap', x: 315, y: 408, label: 'Refrigerante Lata 350ml' },
  { tMs: 2784, type: 'tap', x: 814, y: 182, label: 'Categoria: Doces & Sobremesas' },
  { tMs: 3203, type: 'tap', x: 720, y: 275, label: 'Brigadeiro' },
  { tMs: 4257, type: 'tap', x: 1178, y: 747, label: 'Receber' },
  { tMs: 4651, type: 'tap', x: 513, y: 441, label: 'Pix' },
  { tMs: 5336, type: 'tap', x: 727, y: 654, label: 'Confirmar pagamento' },
  { tMs: 6229, type: 'tap', x: 743, y: 498, label: 'Novo Pedido' },
  { tMs: 6301, type: 'wait', x: null, y: null, label: 'Respiro final' },
];

// Trecho "morto" (tela parada, sem acao) que a revisao pediu pra acelerar:
// depois do tap em "Novo Pedido" o carrinho volta vazio e fica parado ate o
// fim do clipe fonte (medido via diff de frames quadro a quadro — ver
// tools/landing-video/README.md "Como os trechos parados foram medidos").
// Desktop fica soh ~0.9s parado (abaixo do teto de 1s), mas leva o mesmo
// tratamento pra manter o final dos dois formatos igualmente objetivo.
const vendaMobileDeadZones = [{ startMs: 8500, endMs: 9858, outputFrames: 14 }];
const vendaDesktopDeadZones = [{ startMs: 6450, endMs: 7320, outputFrames: 12 }];

const vendaMobileCaptions = [
  { text: 'Toca.', startMs: 0, endMs: 900 },
  { text: 'Adiciona.', startMs: 1200, endMs: 4600 },
  { text: 'Recebe no Pix.', startMs: 5450, endMs: 7550 },
  { text: 'Próximo!', startMs: 7850, endMs: 8550 },
];

const vendaDesktopCaptions = [
  { text: 'Toca.', startMs: 0, endMs: 850 },
  { text: 'Adiciona.', startMs: 1100, endMs: 3550 },
  { text: 'Recebe no Pix.', startMs: 4050, endMs: 5650 },
  { text: 'Próximo!', startMs: 5950, endMs: 6650 },
];

// ---------------------------------------------------------------------------
// FIADO
// ---------------------------------------------------------------------------
const fiadoMobileEvents = [
  { tMs: 54, type: 'tap', x: 193, y: 767, label: 'Cliente: João Pereira' },
  { tMs: 677, type: 'wait', x: 195, y: 471, label: 'Saldo do cliente' },
  { tMs: 2060, type: 'scroll', x: 195, y: 1000, label: 'Rolar extrato (1/5)' },
  { tMs: 2524, type: 'scroll', x: 195, y: 1000, label: 'Rolar extrato (2/5)' },
  { tMs: 3056, type: 'scroll', x: 195, y: 1000, label: 'Rolar extrato (3/5)' },
  { tMs: 3596, type: 'scroll', x: 195, y: 1000, label: 'Rolar extrato (4/5)' },
  { tMs: 4235, type: 'scroll', x: 195, y: 1000, label: 'Rolar extrato (5/5)' },
];

const fiadoDesktopEvents = [
  { tMs: 23, type: 'tap', x: 403, y: 774, label: 'Cliente: João Pereira' },
  { tMs: 458, type: 'wait', x: 893, y: 344, label: 'Saldo do cliente' },
  { tMs: 1805, type: 'scroll', x: 893, y: 700, label: 'Rolar extrato (1/5)' },
  { tMs: 2349, type: 'scroll', x: 893, y: 700, label: 'Rolar extrato (2/5)' },
  { tMs: 2869, type: 'scroll', x: 893, y: 700, label: 'Rolar extrato (3/5)' },
  { tMs: 3376, type: 'scroll', x: 893, y: 700, label: 'Rolar extrato (4/5)' },
  { tMs: 3792, type: 'scroll', x: 893, y: 700, label: 'Rolar extrato (5/5)' },
];

// Depois do ultimo scroll o extrato fica parado (rolado ate o fim) ate o
// clipe fonte acabar — trecho parado > 1s, acelerado igual ao venda-mobile.
const fiadoMobileDeadZones = [{ startMs: 4350, endMs: 6286, outputFrames: 14 }];

const fiadoMobileCaptions = [
  { text: 'Quem deve.', startMs: 0, endMs: 600 },
  { text: 'Quanto.', startMs: 900, endMs: 1900 },
  { text: 'Desde quando.', startMs: 2300, endMs: 4700 },
];

const fiadoDesktopCaptions = [
  { text: 'Quem deve.', startMs: 0, endMs: 450 },
  { text: 'Quanto.', startMs: 750, endMs: 1700 },
  { text: 'Desde quando.', startMs: 2050, endMs: 3900 },
];

// ---------------------------------------------------------------------------
// ZELINHO
// ---------------------------------------------------------------------------
const zelinhoMobileEvents = [
  { tMs: 1519, type: 'tap', x: 346, y: 736, label: 'Abrir chat do Zelinho' },
  { tMs: 2115, type: 'tap', x: 179, y: 719, label: 'Campo de mensagem' },
  { tMs: 3765, type: 'tap', x: 353, y: 721, label: 'Enviar' },
];

const zelinhoDesktopEvents = [
  { tMs: 15, type: 'tap', x: 1236, y: 756, label: 'Abrir chat do Zelinho' },
  { tMs: 471, type: 'tap', x: 1065, y: 741, label: 'Campo de mensagem' },
  { tMs: 2076, type: 'tap', x: 1243, y: 741, label: 'Enviar' },
];

const zelinhoMobileCaptions = [
  { text: 'Pergunta do seu jeito.', startMs: 1550, endMs: 3765 },
];

const zelinhoDesktopCaptions = [
  { text: 'Pergunta do seu jeito.', startMs: 15, endMs: 2076 },
];

// "Pensando..." -> "Consultando os seus dados..." é o trecho parado que a
// revisão pediu pra acelerar (indicador de loading sem mudança visível na
// tela). Medido quadro a quadro no clipe fonte (diff de frames, ~0.2s de
// resolução — ver README.md "Como os trechos parados foram medidos"):
//   mobile:  envia em ~3.8s, resposta completa aparece em ~7.8s (4.0s parado)
//   desktop: envia em ~2.1s, resposta completa aparece em ~9.5s (7.4s parado!)
// outputFrames=22 (~0.73s a 30fps) fica sob o teto de 0.8s de espera
// percebida e ainda dá pra ler o indicador "Pensando.../Consultando...".
// A resposta final (depois do trecho morto) NÃO é acelerada — é o "pagamento"
// da pergunta, precisa ficar legível antes do corte pro AnswerCard.
const zelinhoMobileDeadZones = [{ startMs: 3800, endMs: 7800, outputFrames: 22 }];
const zelinhoDesktopDeadZones = [{ startMs: 2100, endMs: 9500, outputFrames: 22 }];

export const ZELINHO_ANSWER_LABEL = 'sobraram no mês';

export const FLOWS = {
  venda: {
    mobile: {
      src: '/captures/mobile/venda.mp4',
      viewport: { width: 390, height: 844 },
      videoSize: { width: 780, height: 1688 },
      sourceDurationMs: 9858,
      events: vendaMobileEvents,
      captions: vendaMobileCaptions,
      deadZones: vendaMobileDeadZones,
      outro: 'Pedido em 3 toques.',
    },
    desktop: {
      src: '/captures/desktop/venda.mp4',
      viewport: { width: 1280, height: 800 },
      videoSize: { width: 1280, height: 800 },
      sourceDurationMs: 7320,
      events: vendaDesktopEvents,
      captions: vendaDesktopCaptions,
      deadZones: vendaDesktopDeadZones,
      outro: 'Pedido em 3 toques.',
    },
  },
  fiado: {
    mobile: {
      src: '/captures/mobile/fiado.mp4',
      viewport: { width: 390, height: 844 },
      videoSize: { width: 780, height: 1688 },
      sourceDurationMs: 6286,
      events: fiadoMobileEvents,
      captions: fiadoMobileCaptions,
      deadZones: fiadoMobileDeadZones,
      outro: 'Aposenta o caderninho.',
    },
    desktop: {
      src: '/captures/desktop/fiado.mp4',
      viewport: { width: 1280, height: 800 },
      videoSize: { width: 1280, height: 800 },
      sourceDurationMs: 5280,
      events: fiadoDesktopEvents,
      captions: fiadoDesktopCaptions,
      outro: 'Aposenta o caderninho.',
    },
  },
  zelinho: {
    mobile: {
      src: '/captures/mobile/zelinho.mp4',
      viewport: { width: 390, height: 844 },
      videoSize: { width: 780, height: 1688 },
      sourceDurationMs: 10143,
      events: zelinhoMobileEvents,
      captions: zelinhoMobileCaptions,
      deadZones: zelinhoMobileDeadZones,
      // Numero exato lido no frame final da gravacao mobile (nao inventar
      // outro) — diferente do valor da gravacao desktop porque sao duas
      // gravacoes/estados de dados diferentes da conta demo.
      answerValue: 16589,
      outro: 'O Zelinho faz a conta.',
    },
    desktop: {
      src: '/captures/desktop/zelinho.mp4',
      viewport: { width: 1280, height: 800 },
      videoSize: { width: 1280, height: 800 },
      sourceDurationMs: 10600,
      // Os primeiros ~150ms do clipe mostram o skeleton de carregamento do
      // briefing ("Boa tarde." com caixas vazias) antes do conteudo real
      // aparecer (medido via diff de frames a cada 50ms — transicao entre
      // 100ms e 150ms). Como o trecho normal deste fluxo roda em ~0.37x
      // (baseRate — ver README "Trechos parados"), esses 150ms reais viram
      // ~400ms perceptiveis no video final, dava pra ver o skeleton
      // claramente. zelinho-mobile NAO tem esse problema (conferido: chat
      // fechado mostra a pagina ja carregada desde o frame 0).
      sourceStartMs: 160,
      events: zelinhoDesktopEvents,
      captions: zelinhoDesktopCaptions,
      deadZones: zelinhoDesktopDeadZones,
      // Numero exato lido no frame final da gravacao DESKTOP (R$ 16.677,00 —
      // conferido nos frames extraidos; diferente do mobile, ver nota acima).
      answerValue: 16677,
      outro: 'O Zelinho faz a conta.',
    },
  },
};
