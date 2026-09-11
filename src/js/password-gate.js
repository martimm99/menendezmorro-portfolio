/**
 * password-gate.js — Password-protected project gate.
 *
 * Only ever loaded via a dynamic import() from project.js, and only for a
 * project with `protected: true` that hasn't already been unlocked this
 * session — every other project page never requests this file at all.
 *
 * The gate's markup is static HTML baked in at build time (see
 * scripts/build.js buildPasswordGateBlock) — it already looks correct the
 * instant the page paints. This module only attaches BEHAVIOUR to that
 * already-rendered markup: capturing keystrokes, validating each one live,
 * driving the wiggle + hangman-stage reveal, and calling back into
 * project.js once the password is fully correct.
 *
 * Validation is per character, live, not "type it all then submit": each
 * project carries `passwordCharHashes`, one SHA-256 hex digest per
 * position (`sha256("<index>:<UPPERCASE CHAR>")`), computed at build time
 * from the real password — the plaintext itself never ships to the
 * browser. A wrong character is rejected outright (never inserted), so the
 * field always shows a true, correct prefix of the real password. This is
 * a soft gate, not real access control — see BUILD_SPEC.md §5.5.
 */

import { forceRevealAndNavigate } from './utils.js';

const MAX_MISSES = 6;
const REDIRECT_DELAY_MS = 2000;

async function hashPositionalChar(index, char) {
  const bytes = new TextEncoder().encode(`${index}:${char.toUpperCase()}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function initPasswordGate({ project, alreadyUnlocked, onUnlock }) {
  const gate   = document.querySelector('[data-password-gate]');
  const fields = document.querySelector('[data-password-fields]');
  const input  = document.querySelector('[data-password-input]');
  const hangman = document.querySelector('[data-hangman]');
  const status = document.querySelector('[data-password-status]');
  if (!gate || !fields || !input || !hangman || !status) return;

  const slots  = Array.from(fields.querySelectorAll('.password-field-slot'));
  // [structure, head, body, arm-left, arm-right, leg-left, leg-right] —
  // DOM order, not hardcoded names, so it stays correct even if the real
  // artwork (assets/icons/hangman/*.svg) changes what's inside each stage.
  const stages = Array.from(hangman.querySelectorAll('[data-stage]'));
  const hashes = project.passwordCharHashes || [];
  const total  = project.passwordLength ?? hashes.length;

  if (!window.crypto?.subtle) {
    status.textContent = 'Password check unavailable in this browser';
    input.disabled = true;
    return;
  }

  let enteredCount = 0;
  let missCount = 0;
  let busy = false;
  let gameOver = false;

  function wiggle() {
    fields.classList.remove('is-wiggling');
    void fields.offsetWidth; // restart the animation so consecutive misses each replay it
    fields.classList.add('is-wiggling');
  }

  function revealNextStage() {
    stages[missCount]?.classList.add('is-revealed');
  }

  function fail() {
    gameOver = true;
    input.disabled = true;
    status.textContent = 'Incorrect password';
    status.classList.add('is-incorrect');
    setTimeout(() => forceRevealAndNavigate('/'), REDIRECT_DELAY_MS);
  }

  function registerMiss() {
    missCount += 1;
    wiggle();
    revealNextStage();
    if (missCount >= MAX_MISSES) fail();
  }

  async function unlock() {
    // Full password entered correctly (or this is a session-remembered
    // return visit) — hand off to project.js to fetch the real content and
    // reveal it. Stop input while that's in flight.
    input.disabled = true;
    const unlocked = await onUnlock?.();
    return unlocked;
  }

  function wireInteractiveGate() {
    input.addEventListener('keydown', async (e) => {
      if (gameOver || busy) { e.preventDefault(); return; }

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (enteredCount > 0) {
          enteredCount -= 1;
          slots[enteredCount].textContent = '_';
        }
        return;
      }

      // Single printable characters only — Tab, arrows, Enter, modifier
      // combos, and IME composition keys pass through untouched rather
      // than being scored as a guess.
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (enteredCount >= total) return;

      busy = true;
      const hash = await hashPositionalChar(enteredCount, e.key);
      busy = false;
      if (gameOver) return; // the game could have ended while this hash was computing

      if (hash !== hashes[enteredCount]) {
        registerMiss();
        return;
      }

      slots[enteredCount].textContent = e.key.toUpperCase();
      enteredCount += 1;
      if (enteredCount < total) return;

      if (!(await unlock())) {
        // The gated-content fetch itself failed (offline, bad deploy,
        // etc.) — the password was right, but we still can't show the
        // project. Treat it like a miss rather than leaving the page
        // silently stuck.
        input.disabled = false;
        enteredCount -= 1;
        slots[enteredCount].textContent = '_';
        registerMiss();
      }
    });

    // Tapping the label already focuses the input natively; this covers
    // clicks that land slightly outside it (e.g. on the hangman side).
    gate.addEventListener('click', () => { if (!gameOver) input.focus(); });
  }

  if (alreadyUnlocked) {
    // Session-remembered — skip requiring the password again. If the
    // fetch fails anyway (e.g. reloaded offline), fall back to the normal
    // interactive gate rather than leaving the page stuck.
    unlock().then((ok) => { if (!ok) wireInteractiveGate(); });
    return;
  }

  wireInteractiveGate();
}
