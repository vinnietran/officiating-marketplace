# Testing and CI

This repository includes both logic-level tests and a full Playwright functional test suite with HTML reporting.

## CI Workflow

- Workflow file: `.github/workflows/ci.yml`
- Triggers:
  - every pull request
  - pushes to `main`
  - pushes to `master`
  - pushes to `codex/**` branches

CI performs these checks:

- installs root dependencies with `npm ci`
- installs the Playwright Chromium browser bundle
- installs Firebase Functions dependencies with `npm --prefix functions install`
- runs the automated test suite with `npm test`
- builds the Vite app with `npm run build`
- syntax-checks the Firebase Functions entrypoint with `node --check functions/index.js`

## Local Commands

Run the full test suite:

```bash
npm test
```

Run only the browser functional suite:

```bash
npm run test:functional
```

Run the browser suite in headed mode:

```bash
npm run test:functional:headed
```

Open the HTML Playwright report after a run:

```bash
npm run test:functional:report
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

The Playwright suite covers the primary role-based workflows in a browser:

- incomplete-profile onboarding and official profile completion
- official profile details updates
- crew creation and Varsity crew-bid setup
- assignor posting and editing marketplace games
- official bid placement and bid increases
- assignor bid selection and award flow
- direct assignment for crews and individuals
- evaluator game evaluations
- post-game ratings from both assignor and official perspectives

## Functional Test Architecture

The Playwright suite runs the app in `vite --mode e2e`, which swaps Firebase and Google Places integrations for a deterministic in-browser E2E harness. That keeps the functional tests fully automated and self-contained while still exercising the real UI.

Artifacts produced by the browser suite:

- `playwright-report/` for the HTML report
- `test-results/` for traces, screenshots, and videos retained on failure

GitHub Actions uploads the Playwright HTML report as an artifact on every run.

## Logic Test Architecture

The app logic suite is implemented with:

- TypeScript compilation for test sources
- Node's built-in `node:test` runner
- Node's experimental test coverage output

This provides stable CI validation for the highest-risk logic without introducing an unverified browser test stack.
