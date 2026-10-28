// Téléphone : télécommande, micro sans fil, caméra en direct, appairage.
// Passe par le serveur PeerJS en ligne : `npm run test:phone`.
import { test, expect } from '@playwright/test';
import { open, addCamera, count } from './helpers.mjs';

test('télécommande, micro sans fil, caméra en direct, mauvais jeton refusé @network', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await open(page);
  await addCamera(page);
  await page.click('#btn-phone');
  await expect(page.locator('#phone-url')).toHaveAttribute('href', /#docmate-/, { timeout: 30_000 });
  const url = (await page.locator('#phone-url').getAttribute('href')).replace(/^https?:\/\/[^/]+/, '');
  await page.keyboard.press('Escape');

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera', 'microphone'],
    baseURL: 'http://127.0.0.1:8766',
  });
  const phone = await ctx.newPage();
  await phone.goto(url);
  await expect(phone.locator('#status')).toHaveClass(/ok/, { timeout: 30_000 });
  await expect(page.locator('#st-phone')).toHaveText('1 téléphone(s) connecté(s)');
  await expect(phone.locator('#r-session')).toHaveText(/Session du/);

  await phone.click('#r-photo');
  await expect(count(page)).toHaveText('1');
  await phone.click('#r-marker');
  await expect(count(page)).toHaveText('2');
  await expect(phone.locator('#r-screen')).toBeDisabled(); // pas de partage d'écran en cours

  await phone.click('#p-mic');
  await expect(page.locator('#st-mic')).toHaveText('Micro du téléphone');
  await phone.click('#r-narrate');
  await expect(page.locator('#btn-narrate')).toHaveClass(/rec/);
  await expect(phone.locator('#r-narrate')).toHaveClass(/rec/);
  await page.waitForTimeout(3000);
  await phone.click('#r-narrate');
  await expect(count(page)).toHaveText('3');
  await phone.click('#p-mic');
  await expect(page.locator('#st-mic')).toHaveText('Micro du PC');

  await phone.click('#p-live');
  await expect(page.locator('.cam')).toHaveCount(2);
  await phone.click('#p-live');
  await expect(page.locator('.cam')).toHaveCount(1);
  await expect(phone.locator('#r-detail')).toContainText('1 caméra(s)');

  const intruder = await ctx.newPage();
  await intruder.goto(url.replace(/\.[^.]+$/, '.mauvaisjeton'));
  await expect(intruder.locator('#status')).toContainText('Lien périmé', { timeout: 30_000 });
  await ctx.close();
});
