# E2E Tests for Session Manager

This directory contains end-to-end tests using Playwright for the Session Manager application.

## Setup

First, install Playwright and its dependencies:

```bash
cd frontend
npm install -D @playwright/test@latest
npx playwright install
```

The `playwright install` command downloads the browser binaries needed for testing.

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests in UI mode (interactive)
```bash
npx playwright test --ui
```

### Run tests in headed mode (see the browser)
```bash
npx playwright test --headed
```

### Run specific test file
```bash
npx playwright test e2e/session-drag-drop.spec.ts
```

### Run tests in specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Structure

### session-drag-drop.spec.ts

Tests for the drag-and-drop functionality of session tiles:

- **Drag between workspaces**: Verifies sessions can be moved from one workspace to another
- **Visual feedback**: Checks that drag operations show appropriate visual indicators
- **Move to unassigned**: Tests moving sessions to the unassigned area
- **State preservation**: Ensures session data persists after drag operations
- **Cancel drag**: Verifies ESC key cancels drag operations
- **Rapid drags**: Tests handling of multiple successive drag operations

## Configuration

The `playwright.config.ts` file configures:

- Test directory: `./e2e`
- Base URL: `http://localhost:5173` (Vite dev server)
- Browsers: Chromium, Firefox, WebKit
- Dev server auto-start before tests
- Trace collection on first retry
- Screenshots on failure

## Writing New Tests

When adding new E2E tests:

1. Use data-testid attributes in components for reliable selectors
2. Wait for app readiness using the `waitForAppReady()` helper
3. Use helper functions for common operations
4. Test both success and edge cases
5. Clean up state between tests using `beforeEach`

## Debugging

### View test report
```bash
npx playwright show-report
```

### Debug specific test
```bash
npx playwright test --debug e2e/session-drag-drop.spec.ts
```

### View traces
Traces are automatically collected on test failures and can be viewed:
```bash
npx playwright show-trace trace.zip
```

## CI/CD

In CI environments, tests will:
- Run with 2 retries on failure
- Use single worker (no parallelism)
- Skip interactive prompts via `forbidOnly`
- Generate HTML reports

## Notes

- The dev server must be running on port 5173 (configured in `webServer`)
- Tests use actual browser automation (not jsdom)
- Drag-and-drop tests use mouse events for realistic interaction
- Test data should be seeded or mocked as needed
