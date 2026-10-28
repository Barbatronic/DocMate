// Cadrage PTZ (caméra pilotable simulée : la caméra simulée du navigateur ne l'est pas).
import { test, expect } from '@playwright/test';
import { open, addCamera, fakePtzCamera } from './helpers.mjs';

const position = (page) => page.evaluate(() => {
  const s = document.querySelector('.cam video').srcObject.getVideoTracks()[0].getSettings();
  return { pan: s.pan, tilt: s.tilt, zoom: s.zoom };
});

test('déplacement, zoom, recentrage, positions mémorisées', async ({ page }) => {
  await fakePtzCamera(page);
  await open(page);
  await addCamera(page);
  await page.click('.cam-ptz');
  await expect(page.locator('.ptz')).toBeVisible();

  await page.click('.ptz [data-axis=zoom][data-dir="1"]');
  await page.click('.ptz [data-axis=pan][data-dir="1"]');
  await expect.poll(() => position(page)).toEqual({ pan: 10800, tilt: 0, zoom: 112 });

  // Appui maintenu : mouvement continu.
  const up = await page.locator('.ptz [data-axis=tilt][data-dir="1"]').boundingBox();
  await page.mouse.move(up.x + 10, up.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  const held = await position(page);
  expect(held.tilt).toBeGreaterThan(30000);

  await page.click('.ptz-save');
  await page.click('.ptz-slot[data-slot="0"]');
  await page.click('.ptz [data-reset]');
  await expect.poll(() => position(page)).toEqual({ pan: 0, tilt: 0, zoom: 100 });
  await page.click('.ptz-slot[data-slot="0"]');
  await expect.poll(() => position(page)).toEqual(held);
});

test('pas de bouton de cadrage pour une caméra non pilotable', async ({ page }) => {
  await open(page);
  await addCamera(page);
  await expect(page.locator('.cam-ptz')).toBeHidden();
});
