import React from 'react';
import { interpolate, Easing } from 'remotion';
import { sourceMsToFrame } from '../data/timing.js';
import { colors } from '../theme.js';

const WINDOW_BEFORE = 3;
const WINDOW_AFTER = 22;

// Indicador de toque: circulo com ripple exatamente no ponto e instante de
// cada tap. Vive DENTRO do container que a Camera zoom/pan transforma, entao
// acompanha o device.
export const TapRipple = ({ events, timing, viewport, screenWidth, screenHeight, frame }) => {
  return (
    <>
      {events
        .filter((ev) => ev.type === 'tap' && ev.x != null)
        .map((ev, idx) => {
          const evFrame = sourceMsToFrame(ev.tMs, timing);
          const localFrame = frame - evFrame;
          if (localFrame < -WINDOW_BEFORE || localFrame > WINDOW_AFTER) return null;
          const t = Math.max(0, localFrame) / WINDOW_AFTER;
          const scale = interpolate(t, [0, 1], [0.25, 1.7], { easing: Easing.out(Easing.cubic) });
          const opacity = interpolate(t, [0, 0.15, 1], [0, 0.55, 0], { extrapolateRight: 'clamp' });
          const dotOpacity = interpolate(localFrame, [-WINDOW_BEFORE, 0, 6], [0, 1, 0.9], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const cx = (ev.x / viewport.width) * screenWidth;
          const cy = (ev.y / viewport.height) * screenHeight;
          const size = screenWidth * 0.16;
          return (
            <div
              key={`${ev.tMs}-${idx}`}
              style={{
                position: 'absolute',
                left: cx,
                top: cy,
                width: 0,
                height: 0,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: -size / 2,
                  top: -size / 2,
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  border: `${Math.max(2, screenWidth * 0.004)}px solid ${colors.primary}`,
                  background: `radial-gradient(circle, rgba(14,165,233,0.35), transparent 70%)`,
                  transform: `scale(${scale})`,
                  opacity,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: -size * 0.055,
                  top: -size * 0.055,
                  width: size * 0.11,
                  height: size * 0.11,
                  borderRadius: '50%',
                  background: colors.primary,
                  opacity: dotOpacity * 0.85,
                  boxShadow: `0 0 ${size * 0.22}px rgba(14,165,233,0.7)`,
                }}
              />
            </div>
          );
        })}
    </>
  );
};
