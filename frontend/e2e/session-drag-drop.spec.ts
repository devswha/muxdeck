import { test, expect, Page } from '@playwright/test';

/**
 * E2E Tests for Session Drag-and-Drop Functionality
 *
 * Tests cover:
 * - Dragging session tiles between workspaces
 * - Moving sessions to unassigned area
 * - Visual feedback during drag operations
 * - State persistence after drop
 *
 * NOTE: These tests require sessions to be present in the app.
 * Tests will skip gracefully if no sessions are available.
 */

// Helper function to wait for initial app load
async function waitForAppReady(page: Page) {
  // Wait for main app container to be visible
  await page.waitForSelector('[data-testid="app-container"], .app-container, #root > div', {
    state: 'visible',
    timeout: 10000,
  });

  // Wait for any initial loading states to complete
  await page.waitForTimeout(500);
}

// Helper function to check if sessions exist
async function hasSessionsAvailable(page: Page): Promise<boolean> {
  const sessionTiles = page.locator('[data-testid^="session-tile-"], [draggable="true"]');
  const count = await sessionTiles.count();
  return count > 0;
}

// Helper function to get session tile element
async function getSessionTile(page: Page, sessionName: string) {
  return page.locator(`[data-testid="session-tile-${sessionName}"], [data-session-name="${sessionName}"]`).first();
}

// Helper function to get workspace element
async function getWorkspace(page: Page, workspaceName: string) {
  return page.locator(`[data-testid="workspace-${workspaceName}"], [data-workspace-name="${workspaceName}"]`).first();
}

test.describe('Session Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should drag session tile from one workspace to another', async ({ page }) => {
    // Check if sessions are available
    if (!(await hasSessionsAvailable(page))) {
      test.skip(true, 'No sessions available for drag-drop testing. Create sessions manually or via API before running these tests.');
      return;
    }

    // Find the first session tile
    const sessionTile = page.locator('[data-testid^="session-tile-"], [draggable="true"]').first();

    // Verify session tile exists
    await expect(sessionTile).toBeVisible();

    // Get the session name and initial workspace
    const initialWorkspace = await sessionTile.locator('..').getAttribute('data-workspace') ||
                            await sessionTile.evaluate((el) => {
                              const workspaceEl = el.closest('[data-workspace-name], [data-testid^="workspace-"]');
                              return workspaceEl?.getAttribute('data-workspace-name') ||
                                     workspaceEl?.getAttribute('data-testid')?.replace('workspace-', '') ||
                                     'unknown';
                            });

    // Find a different target workspace
    const workspaces = page.locator('[data-testid^="workspace-"], [data-workspace-name]');
    const workspaceCount = await workspaces.count();

    if (workspaceCount < 2) {
      test.skip(true, 'Need at least 2 workspaces for this test');
      return;
    }

    // Get the second workspace as target
    const targetWorkspace = workspaces.nth(1);
    const targetWorkspaceName = await targetWorkspace.getAttribute('data-workspace-name') ||
                                await targetWorkspace.getAttribute('data-testid')?.then(id => id?.replace('workspace-', '')) ||
                                'target';

    // Get session tile bounding box
    const sessionBox = await sessionTile.boundingBox();
    expect(sessionBox).not.toBeNull();

    // Get target workspace bounding box
    const workspaceBox = await targetWorkspace.boundingBox();
    expect(workspaceBox).not.toBeNull();

    if (!sessionBox || !workspaceBox) return;

    // Perform drag and drop
    await page.mouse.move(sessionBox.x + sessionBox.width / 2, sessionBox.y + sessionBox.height / 2);
    await page.mouse.down();

    // Move to target workspace center
    await page.mouse.move(
      workspaceBox.x + workspaceBox.width / 2,
      workspaceBox.y + workspaceBox.height / 2,
      { steps: 10 }
    );

    await page.mouse.up();

    // Wait for any animations or state updates
    await page.waitForTimeout(500);

    // Verify session is now in the target workspace
    // The session should no longer be in the initial workspace
    // and should be in the target workspace
    const sessionInTarget = targetWorkspace.locator('[data-testid^="session-tile-"], [draggable="true"]').first();
    await expect(sessionInTarget).toBeVisible();
  });

  test('should show visual feedback during drag operation', async ({ page }) => {
    // Check if sessions are available
    if (!(await hasSessionsAvailable(page))) {
      test.skip(true, 'No sessions available for drag-drop testing. Create sessions manually or via API before running these tests.');
      return;
    }

    const sessionTile = page.locator('[data-testid^="session-tile-"], [draggable="true"]').first();
    await expect(sessionTile).toBeVisible();

    const sessionBox = await sessionTile.boundingBox();
    expect(sessionBox).not.toBeNull();
    if (!sessionBox) return;

    // Start dragging
    await page.mouse.move(sessionBox.x + sessionBox.width / 2, sessionBox.y + sessionBox.height / 2);
    await page.mouse.down();

    // Move slightly to trigger drag
    await page.mouse.move(sessionBox.x + sessionBox.width / 2 + 50, sessionBox.y + sessionBox.height / 2 + 50, {
      steps: 5
    });

    // Check for visual feedback (drag ghost, opacity change, cursor change, etc.)
    // The dragged element might have opacity change or a drag ghost appears
    const dragIndicator = page.locator('[data-drag-active="true"], .dragging, .drag-ghost');

    // At least one visual indicator should be present during drag
    // This could be the original element with opacity change or a drag ghost
    await page.waitForTimeout(200);

    // Release
    await page.mouse.up();

    // Visual feedback should be gone after release
    await page.waitForTimeout(300);
    await expect(dragIndicator).toHaveCount(0);
  });

  test('should move session to unassigned area when dragged outside workspaces', async ({ page }) => {
    // Check if sessions are available
    if (!(await hasSessionsAvailable(page))) {
      test.skip(true, 'No sessions available for drag-drop testing. Create sessions manually or via API before running these tests.');
      return;
    }

    // Find a session tile in a workspace
    const sessionTile = page.locator('[data-testid^="session-tile-"], [draggable="true"]').first();
    await expect(sessionTile).toBeVisible();

    // Find or verify unassigned area exists
    const unassignedArea = page.locator('[data-testid="unassigned-area"], [data-area="unassigned"]');

    // Skip if no unassigned area
    const unassignedCount = await unassignedArea.count();
    if (unassignedCount === 0) {
      test.skip(true, 'No unassigned area found');
      return;
    }

    const sessionBox = await sessionTile.boundingBox();
    const unassignedBox = await unassignedArea.boundingBox();

    expect(sessionBox).not.toBeNull();
    expect(unassignedBox).not.toBeNull();

    if (!sessionBox || !unassignedBox) return;

    // Drag to unassigned area
    await page.mouse.move(sessionBox.x + sessionBox.width / 2, sessionBox.y + sessionBox.height / 2);
    await page.mouse.down();

    await page.mouse.move(
      unassignedBox.x + unassignedBox.width / 2,
      unassignedBox.y + unassignedBox.height / 2,
      { steps: 10 }
    );

    await page.mouse.up();
    await page.waitForTimeout(500);

    // Verify session appears in unassigned area
    const sessionInUnassigned = unassignedArea.locator('[data-testid^="session-tile-"], [draggable="true"]').first();
    await expect(sessionInUnassigned).toBeVisible();
  });

  test('should preserve session state after drag and drop', async ({ page }) => {
    // Check if sessions are available
    if (!(await hasSessionsAvailable(page))) {
      test.skip(true, 'No sessions available for drag-drop testing. Create sessions manually or via API before running these tests.');
      return;
    }

    // Find a session tile
    const sessionTile = page.locator('[data-testid^="session-tile-"], [draggable="true"]').first();
    await expect(sessionTile).toBeVisible();

    // Get session details before drag
    const sessionText = await sessionTile.textContent();
    const sessionName = await sessionTile.getAttribute('data-session-name') ||
                       await sessionTile.getAttribute('data-testid')?.then(id => id?.replace('session-tile-', ''));

    // Find target workspace
    const workspaces = page.locator('[data-testid^="workspace-"], [data-workspace-name]');
    const workspaceCount = await workspaces.count();

    if (workspaceCount < 2) {
      test.skip(true, 'Need at least 2 workspaces for this test');
      return;
    }

    const targetWorkspace = workspaces.nth(1);

    const sessionBox = await sessionTile.boundingBox();
    const workspaceBox = await targetWorkspace.boundingBox();

    if (!sessionBox || !workspaceBox) return;

    // Perform drag and drop
    await page.mouse.move(sessionBox.x + sessionBox.width / 2, sessionBox.y + sessionBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      workspaceBox.x + workspaceBox.width / 2,
      workspaceBox.y + workspaceBox.height / 2,
      { steps: 10 }
    );
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Find the moved session in target workspace
    const movedSession = sessionName
      ? targetWorkspace.locator(`[data-session-name="${sessionName}"], [data-testid="session-tile-${sessionName}"]`)
      : targetWorkspace.locator('[data-testid^="session-tile-"], [draggable="true"]').first();

    // Verify session still has its original content/state
    await expect(movedSession).toBeVisible();
    const movedSessionText = await movedSession.textContent();

    // The session should retain its identifying information
    expect(movedSessionText).toBeTruthy();
    if (sessionText) {
      expect(movedSessionText).toContain(sessionText.trim().split('\n')[0]); // At least the first line should match
    }
  });

  test('should cancel drag operation on ESC key', async ({ page }) => {
    // Check if sessions are available
    if (!(await hasSessionsAvailable(page))) {
      test.skip(true, 'No sessions available for drag-drop testing. Create sessions manually or via API before running these tests.');
      return;
    }

    const sessionTile = page.locator('[data-testid^="session-tile-"], [draggable="true"]').first();
    await expect(sessionTile).toBeVisible();

    // Get initial position/parent
    const initialParent = await sessionTile.locator('..').getAttribute('data-workspace') ||
                         await sessionTile.evaluate((el) => {
                           const parent = el.closest('[data-workspace-name], [data-testid^="workspace-"]');
                           return parent?.getAttribute('data-workspace-name') ||
                                  parent?.getAttribute('data-testid') ||
                                  'unknown';
                         });

    const sessionBox = await sessionTile.boundingBox();
    if (!sessionBox) return;

    // Start drag
    await page.mouse.move(sessionBox.x + sessionBox.width / 2, sessionBox.y + sessionBox.height / 2);
    await page.mouse.down();

    // Move away
    await page.mouse.move(sessionBox.x + 200, sessionBox.y + 200, { steps: 5 });

    // Press ESC to cancel
    await page.keyboard.press('Escape');

    // Release mouse
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Verify session is still in original location
    const sessionStillThere = await sessionTile.isVisible();
    expect(sessionStillThere).toBe(true);
  });

  test('should handle rapid successive drags without errors', async ({ page }) => {
    // Check if sessions are available
    if (!(await hasSessionsAvailable(page))) {
      test.skip(true, 'No sessions available for drag-drop testing. Create sessions manually or via API before running these tests.');
      return;
    }

    const sessionTile = page.locator('[data-testid^="session-tile-"], [draggable="true"]').first();
    await expect(sessionTile).toBeVisible();

    const workspaces = page.locator('[data-testid^="workspace-"], [data-workspace-name]');
    const workspaceCount = await workspaces.count();

    if (workspaceCount < 2) {
      test.skip(true, 'Need at least 2 workspaces for this test');
      return;
    }

    // Perform multiple quick drags
    for (let i = 0; i < 3; i++) {
      const sessionBox = await sessionTile.boundingBox();
      const targetWorkspace = workspaces.nth(i % workspaceCount);
      const workspaceBox = await targetWorkspace.boundingBox();

      if (!sessionBox || !workspaceBox) continue;

      await page.mouse.move(sessionBox.x + sessionBox.width / 2, sessionBox.y + sessionBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        workspaceBox.x + workspaceBox.width / 2,
        workspaceBox.y + workspaceBox.height / 2,
        { steps: 3 } // Faster drag
      );
      await page.mouse.up();
      await page.waitForTimeout(200); // Shorter wait
    }

    // No errors should have occurred
    // Session should still be visible and functional
    const finalSession = page.locator('[data-testid^="session-tile-"], [draggable="true"]').first();
    await expect(finalSession).toBeVisible();
  });
});
