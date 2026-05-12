# Frontend tests (Vitest + Testing Library)

Component tests run in **jsdom** (no real browser). Network and `next/navigation` are **mocked** where needed.

## How to run

From the `frontend/` directory:

```bash
npm install
npm run test
```

Watch mode while developing:

```bash
npm run test:watch
```

## What gets tested

| File | What it checks |
|------|----------------|
| `error-message.test.tsx` | `ErrorMessage` shows an alert with optional title; hides when empty. |
| `loading-state.test.tsx` | `LoadingState` shows a spinner line only while `active`. |
| `bingo-preview-card.test.tsx` | Static preview grid renders nine cells. |
| `create-game-form.test.tsx` | Form submits **title**, **topic**, **host_pin**, and pattern to `POST /games`. |
| `join-game-form.test.tsx` | Join payload is sent to `POST /games/join`, session saved, router navigates to `/game`. |

Config: `vitest.config.ts`, shared setup: `vitest.setup.ts` (jest-dom matchers).
