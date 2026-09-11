# Hangman stage artwork

Used by the password-protected-project gate (`scripts/build.js` `buildHangmanSprite`,
`src/js/password-gate.js`). Seven files, one per stage, revealed in this order
on each wrong character: `structure` (shown immediately, not a "miss") →
`head` → `body` → `arm-left` → `arm-right` → `leg-left` → `leg-right`
(6th miss = game over).

**These 7 files right now are simple placeholders** — swap them for the real
artwork by replacing the files below (same filenames, same folder). No code
changes needed.

## Requirements for each file

- **One stage's shapes only** — `structure.svg` = gallows only, `head.svg` = head
  only, etc. Don't include earlier stages; the build combines all 7 into one
  sprite and reveals them cumulatively.
- **A normal, standalone `<svg viewBox="..." >...</svg>` file** — however your
  design tool exports it. The build strips the wrapper and keeps only what's
  inside.
- **`viewBox="0 0 100 160"`**, same as these placeholders, so every stage lines
  up in the same coordinate space without needing to reposition anything.
- **Use `stroke="currentColor"` (or `fill="currentColor"` for solid shapes),
  never a hardcoded color** — the sprite's color (white) is set once in
  `password-gate.css`; a hardcoded color would override that and ignore
  dark/light theming.

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
