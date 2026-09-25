/**
 * Zelo Design System — Svelte transitions and one-shot animations built on the
 * closed-form springs in ./spring.js. Every primitive returns zero duration when
 * the viewer asks for reduced motion (`prefers-reduced-motion: reduce`).
 *
 * Svelte transitions are local by default: they play when their own block
 * ({#if}, {#each}, {#key}) adds or removes the element, not when a parent does.
 *
 * docs/DESIGN_SYSTEM.md → Movimento.
 */
import { prefersReducedMotion } from 'svelte/motion';
import { springStep, springSettleTime, springEasing, SPRING_ENTER, SPRING_EXIT, SPRING_POP, SPRING_SHAPE } from './spring.js';

/** How long content waits before entering after a swap (the exit is ~90% gone by then). */
export const SWAP_ENTER_DELAY_MS = 70;
/** Blur radius at the start of an entry / end of an exit, in px. */
export const SWAP_BLUR_PX = 8;
/** Scale a pressed control squashes to (mirrors the CSS token --zelo-press-scale). */
export const PRESS_SCALE = 0.965;

const HEIGHT_SPRING = Object.freeze({ omega: 26, zeta: 1 });
const HEIGHT_EXIT_DELAY_MS = 40;

/** True when motion should be skipped (reduced-motion preference, or no window). */
export function reducedMotion() {
  if (typeof window === 'undefined') return true;
  try {
    return prefersReducedMotion.current === true;
  } catch {
    return false;
  }
}

const ms = (seconds) => Math.round(seconds * 1000);
const fixed = (n, digits = 3) => Number(n.toFixed(digits));

function boxOf(node) {
  const style = getComputedStyle(node);
  const px = (prop) => parseFloat(style[prop]) || 0;
  return {
    height: node.offsetHeight,
    paddingTop: px('paddingTop'),
    paddingBottom: px('paddingBottom'),
    marginTop: px('marginTop'),
    marginBottom: px('marginBottom'),
    borderTop: px('borderTopWidth'),
    borderBottom: px('borderBottomWidth'),
  };
}

function collapseCss(box, k) {
  return `height:${fixed(box.height * k, 2)}px;min-height:0;overflow:hidden;` +
    `padding-top:${fixed(box.paddingTop * k, 2)}px;padding-bottom:${fixed(box.paddingBottom * k, 2)}px;` +
    `margin-top:${fixed(box.marginTop * k, 2)}px;margin-bottom:${fixed(box.marginBottom * k, 2)}px;` +
    `border-top-width:${fixed(box.borderTop * k, 2)}px;border-bottom-width:${fixed(box.borderBottom * k, 2)}px;`;
}

/**
 * Content swap with a short blur (reference: `vis()` in zelopdv-morph.html).
 * - exit: opacity → 0, blur → 8px, scale → 1.02; ~90% gone after ~70 ms (ω 55, ζ 1)
 * - enter: waits 70 ms, then opacity 0 → 1, blur 8 → 0, scale .96 → 1 (ω 34, ζ 1)
 * Enter and exit never overlap visually, so two layers can share one grid cell.
 *
 * Use as `in:blurSwap` + `out:blurSwap` (or `transition:blurSwap`).
 * @param {Element} node
 * @param {{ delay?: number, collapse?: boolean, enterDelay?: number, blur?: number }} [params]
 *   collapse: also animate height/padding/margins (list rows): grows before the
 *   content enters, shrinks right after it leaves.
 * @param {{ direction?: 'in' | 'out' | 'both' }} [options] provided by Svelte
 */
export function blurSwap(node, params = {}, options = {}) {
  const { delay = 0, collapse = false, enterDelay = SWAP_ENTER_DELAY_MS, blur = SWAP_BLUR_PX } = params;
  if (reducedMotion()) return { delay: 0, duration: 0 };
  const leaving = options.direction === 'out';
  const box = collapse ? boxOf(node) : null;

  if (leaving) {
    const contentMs = ms(springSettleTime(SPRING_EXIT.omega, SPRING_EXIT.zeta));
    const heightMs = collapse ? HEIGHT_EXIT_DELAY_MS + ms(springSettleTime(HEIGHT_SPRING.omega, HEIGHT_SPRING.zeta)) : 0;
    const duration = Math.max(contentMs, heightMs);
    return {
      delay,
      duration,
      // Svelte runs an outro from t = 1 to t = 0; u = 1 - t is the elapsed fraction.
      css: (_t, u) => {
        const elapsed = u * duration;
        const q = springStep(elapsed / 1000, SPRING_EXIT.omega, SPRING_EXIT.zeta);
        let css = `opacity:${fixed(1 - q)};filter:blur(${fixed(q * blur, 2)}px);transform:scale(${fixed(1 + 0.02 * q, 4)});`;
        if (box) css += collapseCss(box, 1 - springStep((elapsed - HEIGHT_EXIT_DELAY_MS) / 1000, HEIGHT_SPRING.omega, HEIGHT_SPRING.zeta));
        return css;
      },
    };
  }

  const duration = enterDelay + ms(springSettleTime(SPRING_ENTER.omega, SPRING_ENTER.zeta));
  return {
    delay,
    duration,
    css: (t) => {
      const elapsed = t * duration;
      const p = springStep((elapsed - enterDelay) / 1000, SPRING_ENTER.omega, SPRING_ENTER.zeta);
      let css = `opacity:${fixed(p)};filter:blur(${fixed((1 - p) * blur, 2)}px);transform:scale(${fixed(0.96 + 0.04 * p, 4)});`;
      if (box) css += collapseCss(box, springStep(elapsed / 1000, HEIGHT_SPRING.omega, HEIGHT_SPRING.zeta));
      return css;
    },
  };
}

/**
 * Rise from below with the shape spring (bars and sheets that appear), and sink on exit.
 * @param {Element} node
 * @param {{ y?: number, delay?: number, spring?: { omega: number, zeta: number } }} [params]
 */
export function rise(node, params = {}, options = {}) {
  const { y = 24, delay = 0, spring = SPRING_SHAPE } = params;
  if (reducedMotion()) return { delay: 0, duration: 0 };
  const leaving = options.direction === 'out';
  const s = leaving ? SPRING_EXIT : spring;
  const duration = ms(springSettleTime(s.omega, s.zeta));
  return {
    delay,
    duration,
    css: (t, u) => {
      const p = leaving ? 1 - springStep((u * duration) / 1000, s.omega, s.zeta) : springStep((t * duration) / 1000, s.omega, s.zeta);
      return `opacity:${fixed(Math.min(1, p * 1.6))};transform:translateY(${fixed((1 - p) * y, 2)}px);`;
    },
  };
}

/**
 * Draws an SVG stroke (a check mark) with a critically damped spring.
 * @param {SVGGeometryElement} node
 * @param {{ delay?: number, omega?: number }} [params]
 */
export function drawStroke(node, params = {}) {
  const { delay = 0, omega = 16 } = params;
  if (reducedMotion()) return { delay: 0, duration: 0 };
  const length = typeof node.getTotalLength === 'function' ? node.getTotalLength() : 100;
  return {
    delay,
    duration: ms(springSettleTime(omega, 1)),
    easing: springEasing(omega, 1),
    css: (t) => `stroke-dasharray:${fixed(length, 2)};stroke-dashoffset:${fixed(length * (1 - t), 2)};`,
  };
}

/**
 * Runs a spring-shaped one-shot animation on an element with the Web Animations
 * API. `frame(progress)` returns the keyframe for a spring progress value
 * (0 → 1, may overshoot slightly). Returns the Animation, or null when skipped.
 * @param {Element | null | undefined} el
 * @param {(progress: number) => Keyframe} frame
 * @param {{ omega?: number, zeta?: number, samples?: number }} [spring]
 */
export function animateSpring(el, frame, { omega = SPRING_SHAPE.omega, zeta = SPRING_SHAPE.zeta, samples = 24 } = {}) {
  if (!el || typeof el.animate !== 'function' || reducedMotion()) return null;
  const total = springSettleTime(omega, zeta);
  const keyframes = [];
  for (let i = 0; i <= samples; i += 1) {
    const offset = i / samples;
    const progress = i === samples ? 1 : springStep(offset * total, omega, zeta);
    keyframes.push({ ...frame(progress), offset });
  }
  return el.animate(keyframes, { duration: ms(total), easing: 'linear' });
}

/**
 * Spring "pop" (badge appears or its number changes): scale `from` → 1.
 * @param {Element | null | undefined} el
 * @param {{ from?: number }} [params]
 */
export function pop(el, { from = 0.5 } = {}) {
  return animateSpring(el, (p) => ({ transform: `scale(${fixed(from + (1 - from) * p, 4)})`, opacity: fixed(Math.min(1, 0.4 + p)) }), SPRING_POP);
}
