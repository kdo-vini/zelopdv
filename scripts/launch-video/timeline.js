// Linha do tempo única do vídeo de lançamento. A cena (scene.html) e a trilha
// (audio.mjs) leem daqui, então imagem e som nunca saem de sincronia.
// Tudo em segundos. Grid musical: 120 BPM → 1 tempo = 0,5 s, 1 compasso = 2 s.
(function (root) {
  const TL = {
    fps: 30,
    duration: 34.5,
    bpm: 120,
    scenes: {
      coldOpen: [0, 3.5],
      chaos: [3.5, 7.5],
      reveal: [7.5, 10],
      venda: [10, 13.5],
      fiado: [13.5, 17],
      offline: [17, 20.5],
      pedidos: [20.5, 24],
      lucro: [24, 27.5],
      zelinho: [27.5, 30.5],
      end: [30.5, 34.5]
    },
    coldOpen: {
      line1: { text: 'Sexta-feira, 20h47.', from: 0.35, to: 1.45 },
      line2: { text: 'A fila já dobrou a esquina.', from: 1.75, to: 3.05 }
    },
    chaos: {
      items: [3.6, 3.9, 4.2, 4.5, 4.8, 5.1],
      words: [5.5, 5.9, 6.3, 6.75],
      suck: [7.0, 7.5]
    },
    reveal: { label: 7.7, icon: 8.0, wordmark: 8.45, tagline: 9.05 },
    venda: { taps: [10.5, 10.9, 11.3], pay: 11.9, success: 12.1 },
    fiado: { count: [13.85, 14.55], rows: [14.6, 14.9], pay: 15.6, note: 16.15 },
    offline: { drop: 17.4, queued: [17.8, 18.2, 18.6], back: 19.3, synced: [19.55, 19.75, 19.95] },
    pedidos: { cards: [20.9, 21.6, 22.3], ready: 23.05 },
    lucro: { bars: [24.5, 25.5], count: [25.35, 26.35] },
    zelinho: { enter: 27.6, bubbles: [28.0, 28.75, 29.5] },
    end: { icon: 30.55, title: 31.05, sub: 31.5, url: 31.95, fadeOut: [34.0, 34.5] }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TL;
  else root.TL = TL;
})(typeof window !== 'undefined' ? window : globalThis);
