# Hangman stage artwork

Used by the password-protected-project gate (`scripts/build.js` `buildHangmanSprite`,
`src/js/password-gate.js`). Seven files, one per stage, revealed in this order
on each wrong character: `structure` (shown immediately, not a "miss") →
`head` → `body` → `arm-left` → `arm-right` → `leg-left` → `leg-right`
(6th miss = game over).

**This is the real artwork (as of 2026-09-11)** — solid hand-drawn shapes
matching the site's ink-drip aesthetic (same family as the MORRO logo and the
contact icon), not stroke line-art.

## Requirements for each file

- **One stage's shapes only** — `structure.svg` = gallows only, `head.svg` = head
  only, etc. Don't include earlier stages; the build combines all 7 into one
  sprite and reveals them cumulatively.
- **A normal, standalone `<svg viewBox="..." >...</svg>` file** — however your
  design tool exports it. The build strips the wrapper and keeps only what's
  inside.
- **Each file keeps its own natural viewBox/coordinate space** — they don't
  need to share one canvas. `scripts/build.js`'s `HANGMAN_TRANSFORMS` places
  each piece by hand (a `translate(x,y)` per stage) so they compose into one
  figure hanging from the gallows' hook. **If you redraw a piece with
  meaningfully different proportions or a different local origin, those
  transforms will likely need re-tuning** — render `structure.svg` alone to
  find the drip/hook tip, then adjust from there. A small size/shape tweak
  within the same rough proportions usually doesn't need any change.
- **No hardcoded `fill`/`stroke` color** — the wrapping `<svg>` sets
  `fill="currentColor"` once (`buildHangmanSprite`); the sprite's actual
  color (white) comes from `password-gate.css`. A hardcoded color on a path
  would override that.

## Files

| File | Stage |
|---|---|
| `structure.svg` | Gallows — always visible, not a miss |
| `head.svg` | 1st miss |
| `body.svg` | 2nd miss |
| `arm-left.svg` | 3rd miss |
| `arm-right.svg` | 4th miss |
| `leg-left.svg` | 5th miss |
| `leg-right.svg` | 6th miss — game over, "Incorrect password" |
