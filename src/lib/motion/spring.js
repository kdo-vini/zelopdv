/**
 * Zelo Design System — spring math (pure, no DOM, no Svelte).
 *
 * The motion reference (docs/design-system/reference/zelopdv-morph.html) drives
 * everything with the closed-form step response of a damped harmonic oscillator
 * instead of numeric integration: a value that heads to a new target is
 *   x(t) = target + displacement(t)
 * where displacement starts at (from - target) with an initial velocity and
 * decays according to the natural frequency `omega` (rad/s, the stiffness) and
 * the damping ratio `zeta` (1 = critically damped, < 1 overshoots slightly).
 *
 * House values (docs/DESIGN_SYSTEM.md → Movimento):
 *   ζ 0.82–0.9 for shapes (≤ ~1.5% overshoot), ζ 1 for opacity/blur/numbers,
 *   ω 15 (soft, trailing edge) … 34 (stiff, leading edge) … 55 (fast exit).
 *
 * Everything here is deterministic and unit-tested in tests/motionSpring.test.js.
 */

/** Shape spring used by the CSS token `--zelo-ease-spring` (ζ 0.84, overshoot ≈ 0.8%). */
export const SPRING_SHAPE = Object.freeze({ omega: 18, zeta: 0.84 });
/** Liquid indicator: leading edge (direction of travel) is stiff, trailing edge is soft. */
export const SPRING_LEAD = Object.freeze({ omega: 34, zeta: 0.85 });
export const SPRING_TRAIL = Object.freeze({ omega: 15, zeta: 0.85 });
/** Content entering after a swap (opacity, blur, scale) — no overshoot. */
export const SPRING_ENTER = Object.freeze({ omega: 34, zeta: 1 });
/** Content leaving: ~90% gone after ~70 ms. */
export const SPRING_EXIT = Object.freeze({ omega: 55, zeta: 1 });
/** Counting numbers — no overshoot (a total must never read higher than it is). */
export const SPRING_COUNT = Object.freeze({ omega: 16, zeta: 1 });
/** Small "pop" (badges): one tiny overshoot. */
export const SPRING_POP = Object.freeze({ omega: 30, zeta: 0.78 });

const CRITICAL_EPS = 1e-6;

/**
 * Displacement and velocity of a spring released at t = 0.
 * @param {number} d0 initial displacement from the target (from - target)
 * @param {number} v0 initial velocity, units per second
 * @param {number} t seconds since release
 * @param {number} omega natural frequency, rad/s (Infinity = jump)
 * @param {number} zeta damping ratio (> 0)
 * @returns {{ x: number, v: number }} displacement from target and velocity at t
 */
export function springState(d0, v0, t, omega, zeta) {
  if (t <= 0) return { x: d0, v: v0 };
  if (!Number.isFinite(omega)) return { x: 0, v: 0 };
  if (zeta < 1 - CRITICAL_EPS) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega * t);
    const b = (v0 + zeta * omega * d0) / wd;
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    const x = decay * (d0 * cos + b * sin);
    const v = decay * (-zeta * omega * (d0 * cos + b * sin) + wd * (b * cos - d0 * sin));
    return { x, v };
  }
  if (zeta <= 1 + CRITICAL_EPS) {
    const decay = Math.exp(-omega * t);
    const c = v0 + omega * d0;
    return { x: decay * (d0 + c * t), v: decay * (c - omega * (d0 + c * t)) };
  }
  const s = omega * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega + s;
  const r2 = -zeta * omega - s;
  const a = (v0 - r2 * d0) / (r1 - r2);
  const b = d0 - a;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return { x: a * e1 + b * e2, v: a * r1 * e1 + b * r2 * e2 };
}

/**
 * Step response 0 → 1 (the `S(τ, ω, ζ)` of the reference video).
 * @param {number} t seconds
 * @param {number} omega rad/s
 * @param {number} zeta damping ratio
 */
export function springStep(t, omega, zeta) {
  if (t <= 0) return 0;
  if (!Number.isFinite(omega)) return 1;
  return 1 - springState(1, 0, t, omega, zeta).x;
}

/** A value moving from `from` to `to`, `t` seconds after the change. */
export function springValue(from, to, t, omega, zeta) {
  return from + (to - from) * springStep(t, omega, zeta);
}

/** Peak overshoot of the step response as a fraction (0 when ζ ≥ 1). */
export function springOvershoot(zeta) {
  if (zeta >= 1) return 0;
  return Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
}

const settleCache = new Map();
/**
 * Seconds until the step response stays within `epsilon` of 1 for good.
 * Used as the duration of CSS/Svelte transitions driven by a spring.
 */
export function springSettleTime(omega, zeta, epsilon = 1e-3) {
  if (!Number.isFinite(omega)) return 0;
  const key = `${omega}|${zeta}|${epsilon}`;
  const cached = settleCache.get(key);
  if (cached != null) return cached;
  const dt = 0.001;
  const limit = 10;
  let last = 0;
  for (let t = dt; t <= limit; t += dt) {
    if (Math.abs(1 - springStep(t, omega, zeta)) > epsilon) last = t;
  }
  const settle = Math.round((last + dt) * 1000) / 1000;
  settleCache.set(key, settle);
  return settle;
}

/**
 * Easing function p ∈ [0, 1] → progress for a fixed-duration transition whose
 * duration is `springSettleTime(omega, zeta)`. Ends exactly at 1.
 */
export function springEasing(omega, zeta) {
  const total = springSettleTime(omega, zeta);
  return (p) => (p >= 1 ? 1 : p <= 0 ? 0 : springStep(p * total, omega, zeta));
}

/**
 * CSS `linear()` easing sampled from the spring, for `transition-timing-function`
 * or `animation-timing-function`. Pair it with `springSettleTime` as the duration.
 * @param {number} omega
 * @param {number} zeta
 * @param {number} [samples] number of segments (points = samples + 1)
 */
export function springLinear(omega, zeta, samples = 24) {
  const total = springSettleTime(omega, zeta);
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const value = i === samples ? 1 : springStep((i / samples) * total, omega, zeta);
    points.push(Number(value.toFixed(3)));
  }
  return `linear(${points.join(', ')})`;
}

/** Keyframe offsets and progress values of a spring, for the Web Animations API. */
export function springSamples(omega, zeta, samples = 30) {
  const ease = springEasing(omega, zeta);
  const out = [];
  for (let i = 0; i <= samples; i += 1) {
    const offset = i / samples;
    out.push({ offset, progress: ease(offset) });
  }
  return out;
}

/**
 * Of two edges moving to new positions, which one leads? The edge on the side
 * of travel gets the stiff spring; the other gets the soft one, so an indicator
 * stretches toward the target and then catches up.
 * @returns {{ left: typeof SPRING_LEAD, right: typeof SPRING_LEAD }}
 */
export function liquidEdgeSprings(fromLeft, fromRight, toLeft, toRight, lead = SPRING_LEAD, trail = SPRING_TRAIL) {
  const travel = (toLeft + toRight) / 2 - (fromLeft + fromRight) / 2;
  if (travel > 0) return { left: trail, right: lead };
  if (travel < 0) return { left: lead, right: trail };
  return { left: lead, right: lead };
}
