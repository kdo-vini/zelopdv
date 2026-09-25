import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  springState,
  springStep,
  springValue,
  springOvershoot,
  springSettleTime,
  springEasing,
  springLinear,
  springSamples,
  liquidEdgeSprings,
  SPRING_SHAPE,
  SPRING_LEAD,
  SPRING_TRAIL,
  SPRING_EXIT,
  SPRING_ENTER,
} from '../src/lib/motion/spring.js';

// Reference implementation copied from docs/design-system/reference/zelopdv-morph.html (`S`).
function referenceS(tau, w, z) {
  if (tau <= 0) return 0;
  if (!isFinite(w)) return 1;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
  }
  const e = Math.exp(-w * tau);
  return 1 - e * (1 + w * tau);
}

const peak = (omega, zeta) => {
  let max = 0;
  for (let t = 0; t < 2; t += 0.0005) max = Math.max(max, springStep(t, omega, zeta));
  return max;
};

describe('springStep (closed-form step response)', () => {
  it('matches the reference video for under- and critically damped springs', () => {
    for (const [w, z] of [[18, 0.82], [22, 0.9], [34, 0.85], [15, 0.85], [55, 1], [34, 1], [7, 1]]) {
      for (let t = 0; t <= 1; t += 0.013) expect(springStep(t, w, z)).toBeCloseTo(referenceS(t, w, z), 10);
    }
  });

  it('starts at 0, ends at 1, and jumps for an infinite stiffness', () => {
    expect(springStep(0, 18, 0.84)).toBe(0);
    expect(springStep(-1, 18, 0.84)).toBe(0);
    expect(springStep(3, 18, 0.84)).toBeCloseTo(1, 6);
    expect(springStep(0.01, Infinity, 0.84)).toBe(1);
  });

  it('never overshoots when critically or over-damped', () => {
    expect(peak(34, 1)).toBeLessThanOrEqual(1);
    expect(peak(20, 1.4)).toBeLessThanOrEqual(1);
    expect(springStep(1, 20, 1.4)).toBeGreaterThan(0.95);
  });

  it('keeps the house springs to a tiny overshoot', () => {
    expect(springOvershoot(SPRING_SHAPE.zeta)).toBeCloseTo(0.0077, 3);
    expect(peak(SPRING_SHAPE.omega, SPRING_SHAPE.zeta) - 1).toBeCloseTo(springOvershoot(SPRING_SHAPE.zeta), 3);
    for (const s of [SPRING_SHAPE, SPRING_LEAD, SPRING_TRAIL]) expect(springOvershoot(s.zeta)).toBeLessThan(0.015);
    expect(springOvershoot(1)).toBe(0);
  });

  it('exits ~90% within ~70 ms (blurSwap timing)', () => {
    const gone = springStep(0.07, SPRING_EXIT.omega, SPRING_EXIT.zeta);
    expect(gone).toBeGreaterThan(0.88);
    expect(gone).toBeLessThan(0.92);
    expect(springStep(0.07, SPRING_ENTER.omega, SPRING_ENTER.zeta)).toBeLessThan(gone);
  });
});

describe('springState (retargeting keeps velocity)', () => {
  it('is the displacement form of springStep', () => {
    for (const t of [0.02, 0.1, 0.3]) expect(1 - springState(1, 0, t, 18, 0.84).x).toBeCloseTo(springStep(t, 18, 0.84), 12);
  });

  it('returns the initial conditions at t = 0', () => {
    expect(springState(5, -3, 0, 18, 0.84)).toEqual({ x: 5, v: -3 });
  });

  it('reports a velocity consistent with the position (all damping regimes)', () => {
    for (const zeta of [0.6, 0.84, 1, 1.5]) {
      const h = 1e-6;
      const t = 0.05;
      const a = springState(2, 7, t, 20, zeta);
      const b = springState(2, 7, t + h, 20, zeta);
      expect(a.v).toBeCloseTo((b.x - a.x) / h, 3);
    }
  });

  it('settles to the target from any start', () => {
    const { x, v } = springState(-40, 300, 4, 15, 0.85);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(Math.abs(v)).toBeLessThan(1e-4);
  });

  it('springValue interpolates between from and to', () => {
    expect(springValue(10, 20, 0, 18, 0.84)).toBe(10);
    expect(springValue(10, 20, 3, 18, 0.84)).toBeCloseTo(20, 5);
  });
});

describe('durations and easings', () => {
  it('settle time grows as the spring softens and is cached-stable', () => {
    const stiff = springSettleTime(34, 0.85);
    const soft = springSettleTime(15, 0.85);
    expect(soft).toBeGreaterThan(stiff);
    expect(springSettleTime(34, 0.85)).toBe(stiff);
    expect(springSettleTime(Infinity, 1)).toBe(0);
    expect(Math.abs(1 - springStep(stiff, 34, 0.85))).toBeLessThanOrEqual(1e-3);
  });

  it('springEasing maps 0 → 0 and 1 → 1 exactly', () => {
    const ease = springEasing(18, 0.84);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeGreaterThan(0.9);
  });

  it('springLinear produces a CSS linear() close to the --zelo-ease-spring token', () => {
    const css = springLinear(SPRING_SHAPE.omega, SPRING_SHAPE.zeta, 20);
    expect(css).toMatch(/^linear\(0, [\d., ]+, 1\)$/);
    const ours = css.slice(7, -1).split(', ').map(Number);
    const tokens = readFileSync(new URL('../src/themes/tokens.css', import.meta.url), 'utf8');
    const token = tokens.match(/--zelo-ease-spring:\s*linear\(([^)]+)\)/)[1].split(',').map(Number);
    expect(ours).toHaveLength(token.length);
    expect(Math.max(...ours)).toBeCloseTo(Math.max(...token), 2);
    ours.forEach((v, i) => expect(Math.abs(v - token[i])).toBeLessThan(0.06)); // token sampled over a slightly longer horizon
  });

  it('springSamples covers offsets 0..1 ending at progress 1', () => {
    const samples = springSamples(30, 0.78, 10);
    expect(samples).toHaveLength(11);
    expect(samples[0]).toEqual({ offset: 0, progress: 0 });
    expect(samples.at(-1)).toEqual({ offset: 1, progress: 1 });
  });
});

describe('liquidEdgeSprings', () => {
  it('gives the stiff spring to the edge on the side of travel', () => {
    expect(liquidEdgeSprings(0, 50, 100, 160)).toEqual({ left: SPRING_TRAIL, right: SPRING_LEAD });
    expect(liquidEdgeSprings(100, 160, 0, 50)).toEqual({ left: SPRING_LEAD, right: SPRING_TRAIL });
  });

  it('uses the stiff spring on both edges when only the size changes', () => {
    expect(liquidEdgeSprings(0, 50, -5, 55)).toEqual({ left: SPRING_LEAD, right: SPRING_LEAD });
  });
});
