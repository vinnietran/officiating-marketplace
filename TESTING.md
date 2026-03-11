# Testing and CI

This repository now includes a GitHub Actions CI workflow and a zero-new-dependency automated test suite focused on the core feature logic that currently drives the app.

## CI Workflow

- Workflow file: `.github/workflows/ci.yml`
- Triggers:
  - every pull request
  - pushes to `main`
  - pushes to `master`
  - pushes to `codex/**` branches

CI performs these checks:

- installs root dependencies with `npm ci`
- installs Firebase Functions dependencies with `npm --prefix functions install`
- runs the automated test suite with `npm test`
- builds the Vite app with `npm run build`
- syntax-checks the Firebase Functions entrypoint with `node --check functions/index.js`

## Local Commands

Run the full test suite:

```bash
npm test
```

Run only the app business-logic tests:

```bash
npm run test:app
```

Run only the weekly product update tests:

```bash
npm run test:weekly
```

Run the same checks used by CI:

```bash
npm run ci
```

## Coverage Scope

The app test suite covers the major existing feature logic through extracted helper modules used by the current UI:

- auth and profile onboarding flows
- home-route redirect behavior
- marketplace bid-window/status logic
- game posting/editing validation and payload shaping
- direct assignment validation and payload shaping
- bidding rules and bid update behavior
- crew and assignment resolution logic used by schedule/dashboard style views
- marketplace discovery helpers such as level qualification and location matching

## Current Testing Approach

Because this environment could not fetch additional npm packages, the app suite is implemented with:

- TypeScript compilation for test sources
- Node's built-in `node:test` runner
- Node's experimental test coverage output

This provides stable CI validation for the highest-risk logic without introducing an unverified browser test stack.

## Known Limitation

The suite currently emphasizes business logic and flow assembly over DOM-level interaction testing. That is an intentional tradeoff based on the repository's current tooling and the inability to install additional browser-test dependencies during implementation.
