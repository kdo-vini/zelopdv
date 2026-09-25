import React from 'react';
import { AbsoluteFill } from 'remotion';
import { colors } from '../theme.js';

// Fundo escuro da marca: gradiente mesh radial sutil + grão fino via SVG
// turbulence. Estático (sem custo de recalcular por frame) — o movimento vem
// do device/camera/legendas, não do fundo.
export const Background = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.marketingDark }}>
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(1400px 900px at 18% -8%, rgba(14,165,233,0.16), transparent 60%),
            radial-gradient(1200px 800px at 106% 112%, rgba(3,105,161,0.20), transparent 62%),
            radial-gradient(900px 700px at 50% 50%, rgba(7,23,46,0.4), transparent 70%)
          `,
        }}
      />
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.035, mixBlendMode: 'overlay' }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <AbsoluteFill
        style={{
          boxShadow: 'inset 0 0 220px rgba(0,0,0,0.55)',
        }}
      />
    </AbsoluteFill>
  );
};
