import { expect, test } from '@playwright/test';

// End-to-end smoke test in simulator mode: connect, play Speed Clear by pressing 1–6, check the result.
test('simulator: speed clear from start to result', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/#connect');
  await page.click('#connect-sim');
  await expect(page.getByText('Connected · Simulator')).toBeVisible();
  await expect(page.locator('table.data tbody tr')).toHaveCount(6);

  await page.goto('/#play');
  await page.click('#mode-speed');
  await page.click('#start-game');
  await expect(page.locator('.clock.run')).toBeVisible({ timeout: 8000 }); // after the random standby + beep
  for (const k of ['1', '2', '3', '4', '5', '6']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(120);
  }
  await expect(page.locator('.banner')).toContainText('Cleared 6 plates', { timeout: 5000 });

  await page.click('text=Results');
  await expect(page.locator('.prow .big')).toContainText(' s');
  await expect(page.locator('.tl')).toHaveCount(7); // header + 6 shots
  expect(errors).toEqual([]);
});

test('reaction mode runs with the demo shooter', async ({ page }) => {
  await page.goto('/#connect');
  await page.click('#connect-sim');
  await page.check('#sim-bot');
  await page.goto('/#play');
  await page.click('#mode-reaction');
  await page.fill('#ms-reaction-rounds', '3');
  await page.locator('#ms-reaction-rounds').blur();
  await page.click('#start-game');
  await expect(page.locator('.banner')).toBeVisible({ timeout: 40000 });
});

test('wiring guide renders all eight diagrams', async ({ page }) => {
  await page.goto('/#help');
  await expect(page.locator('.guide figure svg')).toHaveCount(8);
});

test('phone width has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  for (const r of ['play', 'connect', 'setup', 'results', 'help']) {
    await page.goto('/#' + r);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, r).toBeLessThanOrEqual(380);
  }
});
