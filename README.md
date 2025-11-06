# SkateHubba Live S.K.8

Apple-grade polished MVP for running real-time S.K.8 battles with Firebase authority, Tailwind UI, and Next.js 14 App Router.

## Features

- 🔐 Firebase Auth (anonymous + Google upgrade) with handle reservation via Cloud Function.
- 🎮 Two-player S.K.8 lobby with Firestore realtime listeners and deterministic Cloud Function refs.
- 🎥 MediaRecorder capture with resumable Storage uploads guarded by rules.
- 🏁 Server-authoritative scoring, SK8 letters, and match flow (SET/RESP phases + self-fail integrity).
- 📡 PWA installable shell, offline fallback, Sentry telemetry, analytics consent, WCAG-focused UI.
- ✅ CI-ready: ESLint, TypeScript strict, Vitest unit tests, Playwright smoke test scaffold, Lighthouse CI.

## Getting Started

### 1. Clone & Install

```bash
pnpm install
pnpm exec playwright install --with-deps
```

### 2. Firebase Project Setup

1. Create a Firebase project.
2. Enable Authentication providers: **Anonymous** and **Google**.
3. Create Firestore database (production mode) and Storage bucket.
4. Enable Cloud Functions, set region `us-central1`.
5. Create the `videos` storage bucket (default bucket works) and deploy the provided `storage.rules`.
6. In Firestore, run the rules from `firestore.rules`.
7. Deploy Functions:

   ```bash
   cd functions
   npm install
   npm run build
   firebase deploy --only functions --project <your-project-id>
   ```

8. Set the following environment variables in `.env.local` (copy from `.env.example`).

### 3. Local Development

```bash
pnpm dev
```

When using Firebase emulators, set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` and start emulators:

```bash
firebase emulators:start --import=./.emulator-data
```

### 4. Testing & QA

- **Lint & Typecheck**
  ```bash
  pnpm lint
  pnpm typecheck
  ```
- **Unit tests (Vitest)**
  ```bash
  pnpm test
  ```
- **E2E (Playwright)**
  ```bash
  pnpm test:e2e
  ```
- **Lighthouse CI**
  ```bash
  pnpm exec lhci autorun
  ```

### 5. Deployment

1. Build Next.js app: `pnpm build`.
2. Deploy hosting via Vercel/Netlify (Next.js 14).
3. Deploy Firebase rules and functions as above.
4. Configure Sentry DSN in environment.

## Architecture Notes

- `app/` contains App Router pages: `/` for lobby management, `/game/[code]` for live battles.
- `components/` holds UI primitives (shadcn-inspired), feature widgets (ScoreBoard, GameControls, VideoRecorder), and platform helpers.
- `lib/` includes Firebase clients, hooks, and type definitions.
- `store/` uses Zustand for global UI states (toasts, action indicators).
- `functions/` implements HTTPS callable Cloud Functions enforcing match flow and scoring.
- Security posture: Firestore and Storage rules lock reads/writes to authenticated players; Cloud Functions ensure letters and phase transitions.

## Testing Checklist

- [ ] Sign in anonymously, set handle, create lobby.
- [ ] Join lobby from second session, verify realtime sync.
- [ ] Record set clip (auto upload) → opponent approves.
- [ ] Defender records response → setter judges make/fail → letters update.
- [ ] Self-fail flows work for both setter and responder.
- [ ] Winner state locks deck when SK8 reached.

## Accessibility & Performance

- High-contrast palette, focus outlines, keyboard-accessible controls, ARIA statuses on toast.
- Videos lazy-load with `preload="metadata"` for quick scrubbing.
- PWA manifest + service worker for install/offline shell.
- Lighthouse CI configured in GitHub Actions for ≥90 performance targets.

## Environment Variables

See `.env.example`. Ensure the Firebase web config matches your project.

## License

MIT
