/**
 * transitions.js — horizontal sweep + synchronized text slot reveal.
 *
 * The cover is two .cover-layer siblings: one .is-active showing the
 * current project, the other hidden and ready to receive the next one.
 * On navigation we paint the destination cover into the hidden layer,
 * unhide it from the appropriate edge via clip-path, then swap roles.
 *
 * Each text slot ([data-slot-current] / [data-slot-next] inside a
 * .slot-clip) is double-buffered the same way: the "next" element gets
 * the new text, both elements run their is-leaving / is-entering classes
 * in sync with the cover sweep, and after the transition the next slot
 * becomes the current.
 *
 * The full sequence resolves after var(--dur-sweep) (1s) and respects
 * prefers-reduced-motion via the global override in reset.css.
 */

import { prefersReducedMotion } from './utils.js';

const SWEEP_MS = 1000; // mirrors --dur-sweep in tokens.css

/**
 * Run a horizontal sweep on the cover stage.
 *
 * @param {Object}  opts
 * @param {Element} opts.activeLayer  Currently shown cover layer.
 * @param {Element} opts.nextLayer    Hidden cover layer to reveal.
 * @param {'next'|'prev'} opts.direction
 * @returns {Promise<void>} Resolves when the sweep completes and roles swap.
 */
export function horizontalSweep({ activeLayer, nextLayer, direction }) {
  return new Promise((resolve) => {
    // Position the next layer outside the viewport on the appropriate side.
    nextLayer.classList.remove('is-animating', 'is-active');
    nextLayer.style.clipPath = direction === 'next'
      ? 'inset(0 0 0 100%)'  // clipped from right; reveals leftward
      : 'inset(0 100% 0 0)'; // clipped from left;  reveals rightward
    // Force a reflow so the starting position is committed before transition.
    // eslint-disable-next-line no-unused-expressions
    nextLayer.offsetWidth;

    nextLayer.classList.add('is-animating');
    requestAnimationFrame(() => {
      nextLayer.style.clipPath = '';
      nextLayer.classList.add('is-active');
    });

    const finalize = () => {
      activeLayer.classList.remove('is-active', 'is-animating');
      activeLayer.style.clipPath = '';
      nextLayer.classList.remove('is-animating');
      resolve();
    };

    if (prefersReducedMotion()) {
      finalize();
      return;
    }

    setTimeout(finalize, SWEEP_MS + 60);
  });
}

/**
 * Animate the text slots (title, role, info row values) in lockstep with
 * the sweep. The next-text values are set on the queued slot before this
 * runs; this function only drives the visual choreography.
 *
 * @param {Element[]} slotPairs  Each entry is { current, next } element pair.
 * @param {'next'|'prev'} direction
 * @returns {Promise<void>}
 */
export function slideTextSlots(slotPairs, direction) {
  const leavingClass = direction === 'next' ? 'is-leaving-up'    : 'is-leaving-down';
  const enteringPrep = direction === 'next' ? 'is-entering-up-prep' : 'is-entering-down-prep';

  for (const { current, next } of slotPairs) {
    current.classList.remove('is-animating', 'is-leaving-up', 'is-leaving-down');
    next.classList.remove('is-animating', 'is-active', 'is-leaving-up', 'is-leaving-down', 'is-entering-up-prep', 'is-entering-down-prep');
    next.classList.add(enteringPrep);
  }

  // Force a paint with the prep state, then trigger the transition.
  // eslint-disable-next-line no-unused-expressions
  document.body.offsetWidth;

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      for (const { current, next } of slotPairs) {
        current.classList.add('is-animating', leavingClass);
        next.classList.remove(enteringPrep);
        next.classList.add('is-animating');
        // Cleared transform/clip-path animates back to defaults.
      }

      const finalize = () => {
        for (const { current, next } of slotPairs) {
          current.classList.remove('is-animating', 'is-leaving-up', 'is-leaving-down', 'is-active');
          next.classList.remove('is-animating');
          next.classList.add('is-active');
        }
        resolve();
      };

      if (prefersReducedMotion()) {
        finalize();
        return;
      }

      setTimeout(finalize, SWEEP_MS + 60);
    });
  });
}
