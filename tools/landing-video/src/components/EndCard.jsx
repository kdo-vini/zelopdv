import React from 'react';
import { AbsoluteFill, Img, staticFile, spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Background } from './Background.jsx';
import { colors } from '../theme.js';
import { endCardOpacity } from '../cardTiming.js';

// Cartão final curto: logo discreto sobre o mesmo fundo escuro usado no resto
// do vídeo — sem CTA de preço. `startFrame` é quando o card começa a cobrir a
// tela (crossfade); o primeiro frame do card deve ficar parecido com o
// primeiro frame do vídeo (fundo limpo) pra fechar o loop sem soco visual.
//
// Usado por venda/fiado (direto depois do video, sem cartão intermediário).
// O fluxo Zelinho NÃO usa este componente — o AnswerCard já é o cartão final
// dele, com o logo embutido (ver AnswerCard.jsx e a nota em cardTiming.js
// sobre o bug de sobreposição que isso corrigiu).
export const EndCard = ({ startFrame, logoWidth = 360 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;
  if (local < 0) return null;

  const containerOpacity = endCardOpacity(local);
  const logoSpring = spring({ frame: local, fps, config: { damping: 18, mass: 0.6, stiffness: 120 } });
  const logoScale = interpolate(logoSpring, [0, 1], [0.88, 1]);
  const logoOpacity = interpolate(local, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ opacity: containerOpacity, zIndex: 1000 }}>
      <Background />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
            padding: '2.2em 2.6em',
            borderRadius: 28,
            background: 'rgba(248,250,252,0.06)',
            border: `1px solid ${colors.marketingDarkBorder}`,
            boxShadow: '0 40px 90px -20px rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <Img src={staticFile('logo-horizontal-cropped.webp')} style={{ width: logoWidth, display: 'block' }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
