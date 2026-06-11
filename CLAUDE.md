# Claude Code Project Instructions — MORRO Portfolio

## Project context

This is a rebuild of the existing portfolio site at `menendezmorro.com` — a design portfolio for Martí Menéndez. The full specification is in `BUILD_SPEC.md` at the project root. **Read it before starting any work in this project.**

The existing site code is in `_legacy/` — reference only, never modify. It contains design and UX decisions worth preserving (referenced in the spec) and code we are deliberately replacing.

---

## Authoritative documents

1. **`BUILD_SPEC.md`** — the contract. Defines what is being built, the vocabulary, the page behaviors, the data model, the file structure, the performance targets, and the build phases. If any task seems to conflict with the spec, surface the conflict — do not proceed.
2. **This file (`CLAUDE.md`)** — operational principles for how you work in this project.

---

## Non-negotiable principles

These apply to every line of code, every commit, every phase — initial build and post-launch changes alike.

1. **Clean, tidy, professional code.** No dead code. No commented-out blocks left "just in case." No `// TODO` left without a clear, concrete next step. No duplicated logic.
2. **Optimized.** Match the performance targets in spec Section 9. Every regression must be justified.
3. **Fully responsive.** Every screen size (320px to 2560px+) must look intentional and work perfectly. Test specifically at 320, 375, 414, 768, 1024, 1366, 1440, 1920, and 2560 pixels wide.
4. **Vanilla HTML / CSS / native ES modules only.** No frameworks. No build-time JS bundling (HTTP/2 handles separate files fine). No npm runtime dependencies on the live site. Dev-time tools (sharp, etc.) are fine.
5. **Spec-bounded scope.** Build only what's in the spec. If the user requests something out of scope mid-phase, surface it as an out-of-scope change and ask before doing it. Do not silently expand scope.
6. **Phase discipline.** Build phases are sequential (see spec Section 13). Within a phase, you may work freely; between phases, pause for review.

---

## Working style

- At the start of every session, re-check whether `BUILD_SPEC.md` has been edited since the last session. If yes, read the changes.
- Before significant code changes (new file, restructuring, design choice not specified in spec), plan in chat first. Use Plan Mode (Shift+Tab) for any non-trivial step.
- Commit at logical breakpoints with short imperative messages (e.g. `add Home horizontal sweep`, `wire Decap CMS auth`). No fluff in commit messages.
- Run linters and validators (when they exist) before declaring a task done.
- Ask before making any architectural choice not specified in the spec.

---

## Working with the legacy code

`_legacy/` contains the previous version of the site.

- **Read it freely** to understand current behavior and design decisions.
- **DO preserve** any visual design and UX decisions the spec marks as "keep" or "identical to current site" — e.g., Line reveal animation parameters, Description section layout, Contact page layout, static element positions.
- **Do NOT copy code patterns wholesale** — the rewrite must be cleaner than the original. The legacy `app.js` grew organically and has duplicated logic and unused state. Treat it as a description of behavior, not a template for code.
- **Do NOT modify files in `_legacy/`**. It is reference-only.

---

## When you finish a phase

1. Summarize what was built (one paragraph, plus a bullet list of new/changed files).
2. Note any deviations from the spec (with rationale, if any).
3. List anything deferred or marked to revisit in a later phase.
4. Confirm whether the deliverable matches the phase definition in spec Section 13.
5. Stop. Wait for review/approval before starting the next phase.

---

## Things to flag immediately (do not silently fix)

- Any inconsistency or ambiguity in `BUILD_SPEC.md`.
- Any data in `_legacy/assets/projects.json` that doesn't fit the new data model in spec Section 6.
- Any browser-compatibility issue with the chosen approach.
- Any time you feel pressure to compromise on the non-negotiable principles above.
