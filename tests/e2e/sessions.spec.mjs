// Modèle de session : toujours une session courante, on n'en change que sur demande.
import { test, expect } from '@playwright/test';
import { open, addCamera, count, dbCount, acceptDialogs } from './helpers.mjs';

test('une seule session, retrouvée au rechargement, renommable', async ({ page }) => {
  await open(page);
  expect(await dbCount(page, 'sessions')).toBe(1);
  await page.click('#btn-marker');
  await page.fill('#session-title', 'Support moteur NEMA 17');
  await page.press('#session-title', 'Enter');
  await page.reload();
  await expect(page.locator('#session-title')).toHaveValue('Support moteur NEMA 17');
  await expect(count(page)).toHaveText('1');
  expect(await dbCount(page, 'sessions')).toBe(1);
});

test('« Nouvelle » demande confirmation et ne crée pas de session vide en plus', async ({ page }) => {
  const dialogs = acceptDialogs(page);
  await open(page);
  // Session vide : pas de nouvelle session.
  await page.click('#btn-session');
  expect(await dbCount(page, 'sessions')).toBe(1);
  await expect(page.locator('.toast')).toContainText('encore vide');

  await page.click('#btn-marker');
  await page.click('#btn-session');
  await expect(count(page)).toHaveText('0');
  expect(dialogs.at(-1)).toContain('Commencer une nouvelle session');
  expect(await dbCount(page, 'sessions')).toBe(2);
});

test('ouvrir une autre session, supprimer la session courante', async ({ page }) => {
  acceptDialogs(page);
  await open(page);
  await page.fill('#session-title', 'Ancienne');
  await page.press('#session-title', 'Enter');
  await page.click('#btn-marker');
  await page.click('#btn-session');
  await page.click('#btn-marker');
  await page.click('#btn-marker');

  await page.click('#btn-sessions');
  await expect(page.locator('#sessions-list li')).toHaveCount(2);
  await expect(page.locator('#sessions-list li.current')).toHaveCount(1);
  await page.click('#sessions-list li:not(.current) [data-a=open]');
  await expect(page.locator('#session-title')).toHaveValue('Ancienne');
  await expect(count(page)).toHaveText('1');

  await page.click('#btn-sessions');
  await page.click('#sessions-list li.current [data-a=del]');
  await expect(page.locator('#sessions-list li')).toHaveCount(1);
  await expect(count(page)).toHaveText('2'); // bascule sur la session restante
});

test('la narration en cours est terminée dans la session qu\'on quitte', async ({ page }) => {
  acceptDialogs(page);
  await open(page);
  await page.click('#btn-marker');
  await page.click('#btn-narrate');
  await page.waitForTimeout(2000);
  await page.click('#btn-session');
  await expect(count(page)).toHaveText('0');
  await page.waitForTimeout(500);
  await expect(count(page)).toHaveText('0'); // le dernier segment n'arrive pas ici…
  await page.click('#btn-sessions');
  await expect(page.locator('#sessions-list li:not(.current) .hint')).toContainText('2 éléments'); // …mais là
});
