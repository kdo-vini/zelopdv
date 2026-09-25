import React from 'react';
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { fontFamily, colors } from '../theme.js';

// Legenda cinetica: 1 legenda curta por beat, entrada como UM bloco so —
// nao palavra a palavra. O stagger palavra-a-palavra com blur (versao
// anterior) e a assinatura visual de "video explicativo de IA"/legenda de
// Reels, nao de big SaaS launch — Linear/Stripe/Vercel revelam a legenda
// inteira de uma vez (fade + leve slide), sem quique por palavra. `startFrame`
// /`endFrame` sao absolutos na composicao. `size` controla o tamanho da fonte
// (px) — chamado com valores diferentes p/ mobile e desktop.
export const Caption = ({ text, startFrame, endFrame, size = 78, align = 'center', color = colors.textMain }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < startFrame - 2 || frame > endFrame + 7) return null;

  const local = frame - startFrame;
  const s = spring({ frame: local, fps, config: { damping: 26, mass: 0.9, stiffness: 170 } });
  const translateY = interpolate(s, [0, 1], [14, 0]);
  const enterOpacity = interpolate(s, [0, 1], [0, 1]);
  const fadeOut = interpolate(frame, [endFrame - 3, endFrame + 6], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        fontFamily,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: '-0.01em',
        color,
        textAlign: align,
        opacity: Math.min(enterOpacity, fadeOut),
        transform: `translateY(${translateY}px)`,
        textWrap: 'balance',
      }}
    >
      {text}
    </div>
  );
};
