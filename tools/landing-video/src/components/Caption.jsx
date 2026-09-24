import React from 'react';
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { fontFamily, colors } from '../theme.js';

// Legenda cinetica: 1 legenda curta por beat, entrada palavra a palavra.
// `startFrame`/`endFrame` sao absolutos na composicao. `size` controla o
// tamanho da fonte (px) — chamado com valores diferentes p/ mobile e desktop.
export const Caption = ({ text, startFrame, endFrame, size = 78, align = 'center', color = colors.textMain }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < startFrame - 2 || frame > endFrame + 7) return null;

  const words = text.split(' ');
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
        gap: '0 0.3em',
        fontFamily,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: '-0.01em',
        color,
        textAlign: align,
        opacity: fadeOut,
        textWrap: 'balance',
      }}
    >
      {words.map((word, i) => {
        const wordDelay = i * 2.4;
        const s = spring({
          frame: frame - startFrame - wordDelay,
          fps,
          config: { damping: 16, mass: 0.5, stiffness: 130 },
        });
        const translateY = interpolate(s, [0, 1], [26, 0]);
        const opacity = interpolate(s, [0, 1], [0, 1]);
        const blur = interpolate(s, [0, 1], [6, 0]);
        return (
          <span
            key={`${word}-${i}`}
            style={{
              display: 'inline-block',
              transform: `translateY(${translateY}px)`,
              opacity,
              filter: `blur(${blur}px)`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
