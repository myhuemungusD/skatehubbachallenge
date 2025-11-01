# SkateHubba Functions & Security Rules

This repository contains the Firebase backend surface for SkateHubba, including typed Cloud Functions, Firestore security rules, and Storage security rules tailored for the two-player S.K.8 flow.

## Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project with Firestore, Functions, and Storage enabled

## Getting Started

1. **Install dependencies**

   ```bash
   cd functions
   npm install
   ```

2. **Configure environment variables**

   Copy the example environment file and populate values:

   ```bash
   cp .env.example .env
   ```

   Recommended variables:

   - `SENTRY_DSN`: Sentry DSN for error reporting
   - `SENTRY_ENVIRONMENT`: Deployment environment name (e.g., `production`)
   - `RATE_LIMIT_REQUESTS`: Requests allowed per window for callable functions
   - `RATE_LIMIT_WINDOW_MS`: Rate limit window duration in milliseconds

3. **Emulate locally**

   ```bash
   firebase emulators:start
   ```

4. **Deploy**

   ```bash
   npm run deploy --prefix functions
   ```

## Cloud Functions

| Function | Description |
| --- | --- |
| `createGame` | Creates a new S.K.8 match, generating a unique six-character join code. |
| `joinGame` | Allows the second skater to join a game using the shared code. |
| `submitSetClip` | Records the setter's clip and transitions the game to the opponent review phase. |
| `judgeSet` | Lets the non-shooter approve or decline the set clip. |
| `submitRespClip` | Stores the responder's attempt and moves the game to setter review. |
| `judgeResp` | Authoritatively applies letters, determines winners, and rotates turns. |
| `selfFailSet` | Allows the shooter to end their turn without a valid set. |
| `selfFailResp` | Lets the responder concede the attempt, applying the appropriate letter. |

Each callable function enforces:

- Authentication (players only)
- Game membership validation
- Phase-aware state transitions
- Single-attempt guarantees for set and response clips
- Rate limiting based on UID and IP address

Errors are captured with Sentry via its HTTPS ingestion API and emitted with structured logs for observability.

## Firestore Security Rules

The Firestore ruleset (`firestore.rules`) ensures that:

- Only authenticated participants can read or mutate their game document.
- Every write matches a valid phase transition (set submission, approvals, judging, or self-fails).
- Shooters/responder identities are enforced on each transition.
- Letters are awarded exactly once and winners are immutable after declaration.

## Storage Security Rules

The Storage rules (`storage.rules`) provide:

- Upload access exclusively to the active shooter or responder based on the current game phase.
- File-type validation for `video/mp4`, `video/quicktime`, and `video/webm` uploads.
- Maximum clip size of 120 MB.
- Public read access for archived history clips while keeping active attempts private to players.

## Source Maps & CI

TypeScript compilation outputs source maps (`tsconfig.json` sets `"sourceMap": true`) to power error reporting in Sentry. The `npm run build` script compiles the TypeScript sources and should be used in CI pipelines ahead of deployment.

## Deployment Pipeline

Integrate the following high-level steps in CI/CD:

1. Install dependencies (`npm ci` inside `functions/`).
2. Run linting (`npm run lint`).
3. Compile TypeScript (`npm run build`).
4. Deploy via Firebase CLI (`firebase deploy --only functions,firestore:rules,storage:rules`).

Adjust secrets in your CI environment to expose Sentry DSN and Firebase tokens securely.
