// Vue détaillée et transcription des narrations (moteur Whisper simulé).
import { test, expect } from '@playwright/test';
import { open, addCamera, narrate, count, stubWhisper, initialSettings, acceptDialogs, collectErrors } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await stubWhisper(page);
  await initialSettings(page, { transcription: { provider: 'local' } });
});

test('un clic ouvre l\'élément en grand ; légende, navigation, Échap, suppression', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await addCamera(page);
  await page.click('#btn-photo');
  await page.click('#btn-marker');
  await page.fill('#note-input', 'Commander des vis M3 × 16');
  await page.press('#note-input', 'Enter');
  await expect(count(page)).toHaveText('3');

  await page.click('.tl-photo .tl-meta');
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#cams')).toBeHidden();
  await expect(page.locator('.detail-pos')).toHaveText('1 / 3');
  await expect(page.locator('.tl-photo')).toHaveClass(/selected/);

  await page.fill('.detail-caption textarea', 'Support moteur, vue de face');
  await expect(page.locator('.tl-photo .tl-text')).toHaveValue('Support moteur, vue de face');

  await page.locator('.detail-head').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.detail-title b')).toHaveText('Repère');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.detail-caption textarea')).toHaveValue('Commander des vis M3 × 16');

  await page.click('#detail [data-act=delete]');
  await expect(count(page)).toHaveText('2');
  await expect(page.locator('.detail-title b')).toHaveText('Repère'); // élément voisin

  await page.keyboard.press('Escape');
  await expect(page.locator('#detail')).toBeHidden();
  await expect(page.locator('#cams')).toBeVisible();
  expect(errors).toEqual([]);
});

test('transcription automatique, corrigée phrase par phrase, écoute d\'une phrase', async ({ page }) => {
  await page.addInitScript(() => {
    window.__plays = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__plays.push(this.currentTime); window.__audio = this; return play.call(this); };
  });
  await open(page);
  await narrate(page);
  await expect(page.locator('.tl-audio .tl-sub')).toContainText('2 phrase(s)');

  await page.click('.tl-audio .tl-meta');
  const segs = page.locator('.detail-segs .seg-text');
  await expect(segs).toHaveText(['Là je serre les vis M3 au couple.', "J'utilise une clé Allen de 2,5."]);

  // Écouter la 2e phrase : lecture à partir de 1,2 s, arrêt en fin de phrase.
  await page.locator('.detail-segs .seg time').nth(1).click();
  await expect.poll(() => page.evaluate(() => window.__plays.at(-1))).toBe(1.2);
  await expect.poll(() => page.evaluate(() => window.__audio.paused), { timeout: 5000 }).toBe(true);

  // Corriger (taper « p » ne prend pas de photo).
  await segs.nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' pour les vis');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tl-audio .tl-sub')).toContainText('corrigée');
  await expect(count(page)).toHaveText('1');

  await page.reload();
  await page.click('.tl-audio .tl-meta');
  await expect(page.locator('.detail-segs .seg-text').nth(1)).toHaveText("J'utilise une clé Allen de 2,5. pour les vis");
});

test('« Retranscrire » demande confirmation si la transcription a été corrigée', async ({ page }) => {
  const dialogs = acceptDialogs(page);
  await open(page);
  await narrate(page);
  await page.click('.tl-audio .tl-meta');
  const seg = page.locator('.detail-segs .seg-text').first();
  await seg.click();
  await page.keyboard.type('X ');
  await page.keyboard.press('Enter');
  await page.click('.detail-retranscribe');
  expect(dialogs.at(-1)).toContain('Vos corrections seront remplacées');
  await expect(seg).toHaveText('Là je serre les vis M3 au couple.');
});

test('option automatique coupée : bouton « Transcrire »', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('docmate.settings', JSON.stringify({ transcription: { provider: 'local', auto: false } })));
  await open(page);
  await narrate(page);
  await expect(page.locator('.tl-audio .tl-sub')).toHaveCount(0);
  await page.click('.tl-audio .tl-transcribe');
  await expect(page.locator('.tl-audio .tl-sub')).toContainText('2 phrase(s)');
});
