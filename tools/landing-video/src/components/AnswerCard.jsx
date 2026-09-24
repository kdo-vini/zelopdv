import React from 'react';
import { AbsoluteFill, Img, staticFile, spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Background } from './Background.jsx';
import { fontFamily, colors } from '../theme.js';
import { answerCardOpacity } from '../cardTiming.js';

const formatBRL = (value) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

// Cartão de número animado (count-up) usado no fecho do fluxo Zelinho — o
// valor vem EXATAMENTE da resposta gravada (ver `answerValue` em
// data/flows.js). Este é o PRÓPRIO cartão final do fluxo Zelinho (ganha o
// logo pequeno embaixo, fade-in tardio) — não existe um <EndCard> separado
// por cima dele (ver FlowVideo.jsx e a nota em cardTiming.js). Antes disso
// era EndCard quem cobria a tela com o logo, e como ele tem fade-in próprio
// enquanto o AnswerCard ficava opaco sem fade-out, os dois ficavam visíveis
// ao mesmo tempo por ~10 frames (logo sobreposto ao número — bug real
// encontrado na revisão). Fundir os dois num cartão só elimina o problema de
// raiz em vez de tentar cronometrar um crossfade perfeito.
export const AnswerCard = ({
  startFrame,
  durationFrames,
  value,
  label,
  numberSize = 132,
  closingLine,
  logoWidth = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;
  if (local < 0) return null;

  const containerOpacity = answerCardOpacity(local);
  const countSpring = spring({ frame: local - 4, fps, config: { damping: 22, mass: 1.1, stiffness: 70 } });
  // O spring e overdamped (sem "quique") de proposito, mas por isso demora a
  // convergir pro valor exato — trava no valor final um pouco antes do fim
  // da contagem pra garantir que o numero mostrado (inclusive no poster
  // estatico) seja SEMPRE o valor exato da gravacao, nunca um intermediario.
  const settled = local >= durationFrames - 8;
  const current = settled
    ? value
    : Math.round(interpolate(countSpring, [0, 1], [0, value], { extrapolateRight: 'clamp' }));
  const scale = interpolate(countSpring, [0, 1], [0.92, 1]);
  const closingOpacity = interpolate(local, [16, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Logo pequeno, fade-in depois da linha de fecho ja estar visivel — e o
  // que fechava o video antes (EndCard), agora dentro do mesmo cartao.
  const logoOpacity = interpolate(local, [26, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity: containerOpacity, zIndex: 900 }}>
      <Background />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18 }}>
        <div
          style={{
            fontFamily,
            fontWeight: 500,
            fontSize: numberSize * 0.19,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: colors.marketingMuted,
          }}
        >
          Balcão do Zelo · este mês
        </div>
        <div
          style={{
            transform: `scale(${scale})`,
            fontFamily,
            fontWeight: 800,
            fontSize: numberSize,
            letterSpacing: '-0.02em',
            color: colors.textMain,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 20px 60px rgba(14,165,233,0.25)',
          }}
        >
          {formatBRL(current)}
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 600,
            fontSize: numberSize * 0.24,
            color: colors.success,
          }}
        >
          {label}
        </div>
        {closingLine && (
          <div
            style={{
              marginTop: numberSize * 0.28,
              opacity: closingOpacity,
              fontFamily,
              fontWeight: 700,
              fontSize: numberSize * 0.3,
              color: colors.textMain,
              textAlign: 'center',
            }}
          >
            {closingLine}
          </div>
        )}
        {logoWidth > 0 && (
          <div
            style={{
              marginTop: numberSize * 0.32,
              opacity: logoOpacity,
              padding: '0.7em 1.1em',
              borderRadius: 16,
              background: 'rgba(248,250,252,0.06)',
              border: `1px solid ${colors.marketingDarkBorder}`,
            }}
          >
            <Img src={staticFile('logo-horizontal-cropped.webp')} style={{ width: logoWidth, display: 'block' }} />
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
