// Captures de base, réglages et reprise après rechargement.
import { test, expect } from '@playwright/test';
import { open, addCamera, narrate, count, collectErrors } from './helpers.mjs';

test('photo, repère, note et narration arrivent dans la timeline', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await addCamera(page);
  await page.click('#btn-photo');
  await expect(count(page)).toHaveText('1');
  await page.click('#btn-marker');
  await page.fill('#note-input', 'Serrage des vis M3 au couple');
  await page.press('#note-input', 'Enter');
  await expect(count(page)).toHaveText('3');

  await page.click('#btn-narrate');
  await expect(page.locator('#st-session')).toHaveText('Enregistrement en cours');
  await page.waitForTimeout(2500);
  await page.click('#btn-narrate');
  await expect(count(page)).toHaveText('4');
  await expect(page.locator('#st-session')).toHaveText('Prêt');
  await expect(page.locator('.tl-item .tl-meta b')).toHaveText(['Photo', 'Repère', 'Note', 'Narration']);
  // Heure réelle (pas « +00:00:00 »).
  await expect(page.locator('.tl-item time').first()).toHaveText(/^\d\d:\d\d:\d\d$/);
  expect(errors).toEqual([]);
});

test('raccourcis clavier, mais pas pendant la saisie', async ({ page }) => {
  await open(page);
  await addCamera(page);
  await page.keyboard.press('p');
  await expect(count(page)).toHaveText('1');
  await page.keyboard.press('m');
  await expect(count(page)).toHaveText('2');
  await page.fill('#note-input', 'pmpm');
  await expect(count(page)).toHaveText('2');
});

test('les réglages survivent à un rechargement', async ({ page }) => {
  await open(page);
  await page.evaluate(() => localStorage.setItem('docmate.settings', JSON.stringify({
    agent: { anthropicKey: 'sk-ant-test', anthropicModel: 'claude-opus-5' },
    transcription: { provider: 'local' },
  })));
  await page.reload();
  const s = await page.evaluate(() => import('/js/core/settings.js').then((m) => m.S));
  expect(s.agent.anthropicKey).toBe('sk-ant-test');
  expect(s.agent.anthropicModel).toBe('claude-opus-5-5'); // ancien modèle par défaut migré
  expect(s.transcription.provider).toBe('local');
});

test('la timeline et la caméra sont retrouvées après rechargement', async ({ page }) => {
  await open(page);
  await addCamera(page);
  await page.click('#btn-photo');
  await expect(count(page)).toHaveText('1');
  await page.reload();
  await expect(count(page)).toHaveText('1');
  await expect(page.locator('.cam')).toHaveCount(1);
});
