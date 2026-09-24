import React from 'react';
import { colors } from '../theme.js';
import { fontFamily } from '../theme.js';

// Janela de navegador minimalista: 3 pontinhos + barra de endereço discreta.
export const BrowserFrame = ({ width, height, radius = 20, children }) => {
  const barHeight = Math.round(height * 0.062);
  return (
    <div
      style={{
        width,
        height: height + barHeight,
        borderRadius: radius,
        overflow: 'hidden',
        background: '#0a0f1c',
        boxShadow:
          '0 70px 140px -35px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          height: barHeight,
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${Math.round(width * 0.018)}px`,
          gap: Math.round(width * 0.012),
          background: 'linear-gradient(180deg, #131c2e 0%, #0e1523 100%)',
          borderBottom: `1px solid ${colors.marketingDarkBorder}`,
        }}
      >
        <div style={{ display: 'flex', gap: Math.round(width * 0.008) }}>
          {['#ef5350', '#f6c343', '#3ac569'].map((c) => (
            <div key={c} style={{ width: barHeight * 0.26, height: barHeight * 0.26, borderRadius: 999, background: c, opacity: 0.85 }} />
          ))}
        </div>
        <div
          style={{
            marginLeft: Math.round(width * 0.02),
            flex: 1,
            maxWidth: width * 0.34,
            height: barHeight * 0.56,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${colors.marketingDarkBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily,
            fontSize: barHeight * 0.34,
            color: colors.marketingMuted,
            letterSpacing: 0.2,
          }}
        >
          zelopdv.com.br/app
        </div>
      </div>
      {/* position:relative é OBRIGATÓRIO aqui (faltava — bug real encontrado
          na revisão): sem isso, o <AbsoluteFill> do vídeo (dentro de
          VideoLayer) não tem este div como "containing block" e acaba
          preenchendo o wrapper transformado (scale do zoom) INTEIRO,
          inclusive a altura da barra do navegador — o vídeo saía ~barHeight
          mais alto que deveria e `object-fit: cover` cortava uma fatia da
          direita pra manter a proporção (ex.: "Enter envia" cortado no
          zelinho-desktop). Ver PhoneFrame.jsx, que já fazia certo. */}
      <div style={{ position: 'relative', width, height, background: colors.bgApp, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
};
