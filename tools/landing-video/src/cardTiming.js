// Curvas de opacidade do AnswerCard e do EndCard, isoladas num modulo .js
// puro (sem JSX) pra poderem ser importadas tanto pelos componentes
// (components/AnswerCard.jsx, components/EndCard.jsx) quanto pelo script de
// verificacao (scripts/check-device-bounds.mjs) — mesma fonte, sem duplicar
// a conta em dois lugares (mesmo padrao de components/camera.js).
//
// Bug real corrigido na revisao: o EndCard (fade-in de 10 frames) entrava
// por cima do AnswerCard enquanto ele ainda estava opaco (sem fade-out
// proprio), entao por ~10 frames os dois ficavam visiveis ao mesmo tempo —
// o logo aparecia sobreposto ao numero. Fix: pro fluxo zelinho, o AnswerCard
// vira o PROPRIO cartao final (ganha o logo pequeno embaixo, ver
// AnswerCard.jsx) e o EndCard genérico NAO é renderizado (ver FlowVideo.jsx)
// — os dois nunca coexistem, entao a pergunta "as opacidades se sobrepõem
// em algum frame?" fica estruturalmente impossivel de responder "sim" — mas
// o check em scripts/check-device-bounds.mjs ainda verifica isso de verdade
// (usando as MESMAS curvas daqui), pra pegar qualquer regressao futura caso
// alguem volte a renderizar os dois juntos.
import { interpolate } from 'remotion';

export const ANSWER_CARD_FADE_IN = [0, 8];
export const END_CARD_FADE_IN = [0, 10];

export function answerCardOpacity(localFrame) {
  if (localFrame < 0) return 0;
  return interpolate(localFrame, ANSWER_CARD_FADE_IN, [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

export function endCardOpacity(localFrame) {
  if (localFrame < 0) return 0;
  return interpolate(localFrame, END_CARD_FADE_IN, [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
