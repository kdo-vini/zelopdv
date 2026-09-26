// Linha do tempo única do vídeo demonstrativo. A composição (scenes.js) e a
// trilha (audio.mjs) leem daqui: todo toque, sheet, morph e troca de legenda
// tem um tempo só. Segundos. Grid musical: 120 BPM → 1 tempo = 0,5 s.
(function (root) {
  const TL = {
    fps: 30,
    duration: 48,
    bpm: 120,
    scenes: {
      hook: [0, 4.5],
      venda: [4.5, 13.5],
      mesas: [13.5, 23.5],
      financeiro: [23.5, 31],
      relatorios: [31, 37],
      zelinho: [37, 43.8],
      end: [43.8, 48]
    },

    // 1 · abrir o caixa (a forma do MorphButton, fora do celular)
    hook: {
      eyebrow: 0.2, caption: 0.3, pill: 0.9, press: 1.9, loading: 2.0, check: 2.85,
      toast: 3.2, caption2: 3.0, pillOut: 4.0, phoneIn: 4.0
    },

    // 2 · venda no balcão
    venda: {
      caption: 4.5,
      taps: [5.2, 5.7, 6.1],            // X-Bacon, Coca-Cola, Coca-Cola
      cartIn: 5.3,
      openSheet: 7.0,
      receber: 8.0,
      pix: 8.8,
      confirm: 9.4, loading: 9.5, check: 10.3,
      closeSheet: 10.9, toast: 11.0, cash: 11.1, caption2: 11.2, stock: 11.3
    },

    // 3 · mesas (módulo Mesas)
    mesas: {
      caption: 13.5, screen: 13.6, tiles: 13.8,
      openMesa: 14.8, mesaScreen: 15.0,
      taps: [15.6, 15.95, 16.3, 16.55, 16.8], // X-Bacon ×2, Coca-Cola 600ml ×3
      openSheet: 17.2,
      send: 18.0, sendLoading: 18.1, sendCheck: 18.8, kitchen: 19.0,
      caption2: 19.2,
      fechar: 19.6, fecharSheet: 19.7,
      split: [20.6, 20.9],
      pix: 21.5,
      close: 22.0, closeLoading: 22.1, closeCheck: 22.8,
      closeSheet: 23.1, toast: 23.15
    },

    // 4 · despesas e fechamento de caixa
    financeiro: {
      caption: 23.5, nav: 23.6, screen: 23.7,
      novo: 24.4, sheet: 24.5,
      typeDesc: [24.9, 25.5], typeValor: [25.6, 26.0],
      categoria: 26.2,
      save: 26.7, saveLoading: 26.8, saveCheck: 27.4, closeSheet: 27.7, row: 27.8,
      caption2: 28.0,
      caixa: 28.3, caixaSheet: 28.4,
      contado: [28.9, 29.3],
      fechar: 29.6, fecharLoading: 29.7, fecharCheck: 30.3, done: 30.55
    },

    // 5 · relatórios
    relatorios: {
      caption: 31, closeSheet: 30.95, screen: 31.1,
      semana: 31.9, chart: [32.0, 33.1], tooltip: 33.2,
      tiles: 33.5, top: 34.3, caption2: 35.2
    },

    // 6 · Zelinho Gerente
    zelinho: {
      caption: 37, nav: 37.1, screen: 37.2,
      chip: 37.8, ask: 38.0, typing: [38.2, 38.8], answer: [38.8, 40.0],
      typeCmd: [40.3, 41.0], send: 41.1, ask2: 41.2, typing2: [41.3, 41.6], action: 41.6,
      caption2: 42.0, confirm: 42.3, loading: 42.4, check: 42.9, done: 43.15
    },

    // 7 · cartão final (superfície Brand)
    end: { panel: 43.8, logo: 44.25, title: 44.6, sub: 45.0, cta: 45.35, press: 46.3, fadeOut: [47.5, 48] }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TL;
  else root.TL = TL;
})(typeof window !== 'undefined' ? window : globalThis);
