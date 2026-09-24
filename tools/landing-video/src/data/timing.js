import { FPS, FLOWS } from './flows.js';

// Orcamento de frames por composicao (30fps). Cada composicao =
// intro (device entra) + video (fonte tocando, possivelmente com
// playbackRate != 1 pra caber no orcamento) + [answer, so zelinho] + outro
// (EndCard). Duracoes-alvo: 8-12s (240-360 frames), looping limpo.
//
// totalFrames/introFrames/outroFrames/answerFrames NAO mudam quando um fluxo
// ganha "trechos mortos" (ver FLOWS[x][y].deadZones em data/flows.js) — so a
// forma como videoFrames e distribuido entre os trechos do video fonte muda
// (getTiming abaixo). Isso mantem a duracao final de cada composicao estavel
// e dentro do orcamento de 8-12s sem precisar re-tunar os 6 valores toda vez
// que um trecho parado for descoberto/ajustado.
const BUDGETS = {
  'venda-mobile': { totalFrames: 330, introFrames: 12, outroFrames: 36, answerFrames: 0 },
  'venda-desktop': { totalFrames: 270, introFrames: 12, outroFrames: 48, answerFrames: 0 },
  'fiado-mobile': { totalFrames: 270, introFrames: 12, outroFrames: 42, answerFrames: 0 },
  'fiado-desktop': { totalFrames: 270, introFrames: 12, outroFrames: 42, answerFrames: 0 },
  'zelinho-mobile': { totalFrames: 360, introFrames: 10, outroFrames: 28, answerFrames: 42 },
  'zelinho-desktop': { totalFrames: 360, introFrames: 10, outroFrames: 28, answerFrames: 42 },
};

// Orcamento padrao (em frames de saida) pra um trecho morto sem
// `outputFrames` explicito — 16 frames a 30fps = ~0.53s, bem abaixo do teto
// de 0.8s de espera percebida pedido na revisao.
const DEAD_ZONE_DEFAULT_FRAMES = 16;

// Quebra o video fonte [sourceStartMs, sourceDurationMs] numa lista ordenada
// de trechos {startMs, endMs, dead}, intercalando os `deadZones` (ja
// ordenados) com os trechos normais entre eles. `sourceStartMs` (default 0)
// pula um trecho no INICIO do clipe fonte (ex.: skeleton de carregamento
// antes do conteudo real aparecer — ver `sourceStartMs` em data/flows.js) —
// eventos/legendas com tMs menor que sourceStartMs so ficam "grudados" no
// frame 0 da composicao (ver sourceMsToFrame), o que e inofensivo pra
// timestamps ja bem cedo no clipe.
function buildSourceSegments(sourceDurationMs, deadZones, sourceStartMs = 0) {
  const segments = [];
  let cursor = sourceStartMs;
  for (const dz of deadZones) {
    if (dz.startMs > cursor) segments.push({ startMs: cursor, endMs: dz.startMs, dead: false });
    segments.push({
      startMs: dz.startMs,
      endMs: dz.endMs,
      dead: true,
      outputFrames: dz.outputFrames ?? DEAD_ZONE_DEFAULT_FRAMES,
    });
    cursor = dz.endMs;
  }
  if (cursor < sourceDurationMs) segments.push({ startMs: cursor, endMs: sourceDurationMs, dead: false });
  return segments;
}

// Monta o orcamento de timing de uma composicao. Alem dos campos historicos
// (videoStartFrame/videoEndFrame/etc.), devolve `segments`: a lista de
// trechos do video fonte com sua taxa de reproducao e posicao em frames de
// composicao — e o que VideoLayer (FlowVideo.jsx) usa pra montar um
// <Sequence trimBefore/trimAfter/playbackRate> por trecho, e o que
// sourceMsToFrame usa pra mapear qualquer tMs (evento/legenda) pro frame
// absoluto certo mesmo com taxa variavel.
//
// Trechos normais tocam numa taxa uniforme `baseRate` (mesma ideia de antes:
// sourceFrames/videoFrames — so que agora sourceFrames e videoFrames somam
// SO os trechos normais, porque os trechos mortos tem orcamento de saida
// fixo e curto, reservado ANTES do resto ser dividido). Como um trecho morto
// tira tempo de fonte do meio sem tirar frames de saida do orcamento total,
// baseRate fica menor que a taxa "ingenua" (sourceFrames totais/videoFrames)
// — ou seja, o conteudo real (digitacao, scroll etc.) roda um pouco mais
// devagar, o que so ajuda legibilidade.
export function getTiming(flow, format) {
  const key = `${flow}-${format}`;
  const budget = BUDGETS[key];
  if (!budget) throw new Error(`Sem orcamento de timing para "${key}"`);
  const data = FLOWS[flow][format];
  const { totalFrames, introFrames, outroFrames, answerFrames } = budget;
  const videoFrames = totalFrames - introFrames - outroFrames - answerFrames;
  const sourceDurationMs = data.sourceDurationMs;
  const sourceStartMs = data.sourceStartMs || 0;
  const deadZones = (data.deadZones || []).slice().sort((a, b) => a.startMs - b.startMs);
  const rawSegments = buildSourceSegments(sourceDurationMs, deadZones, sourceStartMs);

  const deadOutputFrames = rawSegments.filter((s) => s.dead).reduce((sum, s) => sum + s.outputFrames, 0);
  const normalSourceMs = rawSegments.filter((s) => !s.dead).reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
  const normalVideoFrames = Math.max(1, videoFrames - deadOutputFrames);
  const normalSourceFrames = (normalSourceMs / 1000) * FPS;
  const baseRate = normalSourceMs > 0 ? normalSourceFrames / normalVideoFrames : 1;

  let compCursor = introFrames;
  const segments = rawSegments.map((seg) => {
    const segSourceFrames = ((seg.endMs - seg.startMs) / 1000) * FPS;
    const playbackRate = seg.dead ? segSourceFrames / seg.outputFrames : baseRate;
    const compFrames = seg.dead ? seg.outputFrames : Math.max(1, Math.round(segSourceFrames / playbackRate));
    const meta = {
      startMs: seg.startMs,
      endMs: seg.endMs,
      dead: seg.dead,
      playbackRate,
      compFrameStart: compCursor,
      compFrameEnd: compCursor + compFrames,
    };
    compCursor += compFrames;
    return meta;
  });

  const actualVideoFrames = compCursor - introFrames;

  return {
    fps: FPS,
    totalFrames,
    introFrames,
    videoFrames: actualVideoFrames,
    answerFrames,
    outroFrames,
    playbackRate: baseRate,
    segments,
    videoStartFrame: introFrames,
    videoEndFrame: introFrames + actualVideoFrames,
    answerStartFrame: introFrames + actualVideoFrames,
    outroStartFrame: introFrames + actualVideoFrames + answerFrames,
  };
}

// Converte um t_ms do evento/legenda (relativo ao inicio do video FONTE) pro
// frame absoluto da composicao, considerando o intro e os trechos de
// timing.segments (cada um com sua propria taxa — ver getTiming acima).
export function sourceMsToFrame(tMs, timing) {
  const segs = timing.segments;
  let seg = segs[segs.length - 1];
  for (const s of segs) {
    if (tMs <= s.endMs) {
      seg = s;
      break;
    }
  }
  const localMs = Math.max(0, tMs - seg.startMs);
  const localFrames = ((localMs / 1000) * FPS) / seg.playbackRate;
  return seg.compFrameStart + localFrames;
}
