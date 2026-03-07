# Typing

Local-first touch typing practice built with React, TypeScript, Bun, and Vite.

## What is implemented

- Adaptive lessons built from real words only.
- Starter letters locked to `e n i a r l`.
- One-letter-at-a-time unlock order through the full alphabet.
- Per-letter speed and accuracy tracking stored in IndexedDB.
- Focus mode for drilling any specific key without changing the main unlock order.
- Dark-mode single-page UI with a keyboard map, weak-letter list, session history, and unlock progress.
- Basic PWA support for installability and offline reopening after the first load.

## Local development

```bash
bun install
bun dev
```

## Verification

```bash
bun test
bun run lint
bun run build
```

## Notes

- Progress is stored locally in the browser. Clearing site data resets the app back to the starter state.
- V1 is desktop-first and assumes a US English QWERTY hardware keyboard.
- The bundled word corpus is intentionally small and curated for the MVP. If you expand this commercially, review the corpus strategy and licensing more rigorously.
