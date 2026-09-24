import React from 'react';
import { colors } from '../theme.js';

// Moldura de celular desenhada em CSS — sem notch/logo copiados de nenhuma
// marca real. Bezel fino, cantos bem arredondados, botão lateral discreto.
export const PhoneFrame = ({ width, height, radius = 56, children }) => {
  const bezel = Math.round(width * 0.028);
  return (
    <div
      style={{
        position: 'relative',
        width: width + bezel * 2,
        height: height + bezel * 2,
        borderRadius: radius,
        background: 'linear-gradient(155deg, #1b2436 0%, #0c1220 55%, #060a14 100%)',
        boxShadow:
          '0 60px 120px -30px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 2px rgba(255,255,255,0.04)',
        padding: bezel,
      }}
    >
      {/* Botões laterais */}
      <div style={{ position: 'absolute', right: -3, top: height * 0.16, width: 3, height: height * 0.09, borderRadius: 2, background: '#0a0e18' }} />
      <div style={{ position: 'absolute', left: -3, top: height * 0.13, width: 3, height: height * 0.045, borderRadius: 2, background: '#0a0e18' }} />
      <div style={{ position: 'absolute', left: -3, top: height * 0.2, width: 3, height: height * 0.075, borderRadius: 2, background: '#0a0e18' }} />

      <div
        style={{
          position: 'relative',
          width,
          height,
          borderRadius: radius - bezel * 0.7,
          overflow: 'hidden',
          background: colors.bgApp,
        }}
      >
        {children}
        {/* Home indicator */}
        <div
          style={{
            position: 'absolute',
            bottom: height * 0.012,
            left: '50%',
            transform: 'translateX(-50%)',
            width: width * 0.32,
            height: Math.max(4, width * 0.011),
            borderRadius: 999,
            background: 'rgba(255,255,255,0.55)',
          }}
        />
      </div>
    </div>
  );
};
