/**
 * Zelo Design System — reactive springs (Svelte 5 runes).
 *
 * `SpringValue` animates a number toward a target with the closed-form spring of
 * ./spring.js. Retargeting mid-flight keeps position and velocity, so a value
 * that changes its mind never jumps. Each retarget may use its own ω/ζ.
 *
 * `LiquidIndicator` is two SpringValues (left and right edge) for tab/segment
 * indicators: the edge on the side of travel rides a stiff spring (ω 34), the
 * other a soft one (ω 15), so the indicator stretches toward the target and the
 * tail catches up — the toggle/tab beat of zelopdv-morph.html.
 *
 * docs/DESIGN_SYSTEM.md → Movimento.
 */
import { untrack } from 'svelte';
import { springState, liquidEdgeSprings, SPRING_SHAPE, SPRING_LEAD, SPRING_TRAIL } from './spring.js';
import { reducedMotion } from './transitions.js';

const REST_DISTANCE = 0.01;
const REST_VELOCITY = 0.5;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class SpringValue {
  /** Current animated value (reactive). */
  current = $state(0);
  #target = 0;
  #from = 0;
  #velocity = 0;
  #startedAt = 0;
  #omega = SPRING_SHAPE.omega;
  #zeta = SPRING_SHAPE.zeta;
  #frame = 0;

  /**
   * @param {number} value initial value
   * @param {{ omega?: number, zeta?: number }} [spring] default spring
   */
  constructor(value = 0, spring = {}) {
    this.current = value;
    this.#target = value;
    this.#from = value;
    this.#omega = spring.omega ?? SPRING_SHAPE.omega;
    this.#zeta = spring.zeta ?? SPRING_SHAPE.zeta;
  }

  get target() {
    return this.#target;
  }

  /**
   * Moves toward `target`.
   * @param {number} target
   * @param {{ omega?: number, zeta?: number, instant?: boolean }} [options]
   */
  set(target, options = {}) {
    // Never let a caller's effect subscribe to `current` through this write.
    untrack(() => this.#set(target, options));
  }

  #set(target, { omega, zeta, instant = false }) {
    if (instant || reducedMotion() || typeof requestAnimationFrame === 'undefined') {
      this.#stop();
      this.#target = target;
      this.#from = target;
      this.#velocity = 0;
      this.current = target;
      return;
    }
    const t = now();
    const { x, v } = this.#sample(t);
    this.#from = x;
    this.#velocity = v;
    this.#target = target;
    this.#startedAt = t;
    if (omega != null) this.#omega = omega;
    if (zeta != null) this.#zeta = zeta;
    if (!this.#frame) this.#frame = requestAnimationFrame(this.#tick);
  }

  #sample(t) {
    if (!this.#frame) return { x: this.current, v: 0 };
    const s = springState(this.#from - this.#target, this.#velocity, (t - this.#startedAt) / 1000, this.#omega, this.#zeta);
    return { x: this.#target + s.x, v: s.v };
  }

  #tick = (t) => {
    const { x, v } = this.#sample(t);
    if (Math.abs(x - this.#target) < REST_DISTANCE && Math.abs(v) < REST_VELOCITY) {
      this.#frame = 0;
      this.current = this.#target;
      return;
    }
    this.current = x;
    this.#frame = requestAnimationFrame(this.#tick);
  };

  #stop() {
    if (this.#frame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** Stops any running animation (call on destroy). */
  destroy() {
    this.#stop();
  }
}

export class LiquidIndicator {
  left = new SpringValue(0);
  right = new SpringValue(0);
  /** False until the first measurement: render a static fallback until then. */
  ready = $state(false);
  #lead;
  #trail;

  /**
   * @param {{ lead?: { omega: number, zeta: number }, trail?: { omega: number, zeta: number } }} [springs]
   */
  constructor({ lead = SPRING_LEAD, trail = SPRING_TRAIL } = {}) {
    this.#lead = lead;
    this.#trail = trail;
  }

  /** Left edge in px (reactive). */
  get x() {
    return this.left.current;
  }

  /** Width in px (reactive, never negative). */
  get width() {
    return Math.max(0, this.right.current - this.left.current);
  }

  /**
   * Moves the indicator to span [left, right]. The first call (and `instant`,
   * used for resizes) jumps; later calls ride split-edge springs.
   * @param {number} left
   * @param {number} right
   * @param {{ instant?: boolean }} [options]
   */
  moveTo(left, right, options = {}) {
    untrack(() => this.#moveTo(left, right, options));
  }

  #moveTo(left, right, { instant = false }) {
    if (!this.ready || instant) {
      this.left.set(left, { instant: true });
      this.right.set(right, { instant: true });
      this.ready = true;
      return;
    }
    if (left === this.left.target && right === this.right.target) return;
    const springs = liquidEdgeSprings(this.left.target, this.right.target, left, right, this.#lead, this.#trail);
    this.left.set(left, springs.left);
    this.right.set(right, springs.right);
  }

  /**
   * Measures `el` (a child of the positioned container) and moves there.
   * @param {HTMLElement | null | undefined} el
   * @param {{ instant?: boolean }} [options]
   */
  follow(el, options = {}) {
    if (!el || !el.offsetWidth) return;
    this.moveTo(el.offsetLeft, el.offsetLeft + el.offsetWidth, options);
  }

  destroy() {
    this.left.destroy();
    this.right.destroy();
  }
}
