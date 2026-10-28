// Disposition : caméras sans défilement, timeline repliable, barre flottante.
import { test, expect } from '@playwright/test';
import { open, addCamera, fakePip } from './helpers.mjs';

const fit = (page) => page.evaluate(() => {
  const v = document.querySelector('.viewport-area');
  return {
    scroll: v.scrollHeight - v.clientHeight,
    tiles: [...document.querySelectorAll('.cam')].map((e) => Math.round(e.getBoundingClientRect().width)),
    cols: getComputedStyle(document.querySelector('#cams')).getPropertyValue('--cols').trim(),
  };
});

test('les caméras tiennent dans la zone libre, sans défilement', async ({ page }) => {
  await page.setViewportSize({ width: 1860, height: 930 });
  await open(page);
  await addCamera(page);
  expect(await fit(page)).toMatchObject({ scroll: 0, cols: '1' });
  await addCamera(page);
  await addCamera(page);
  const three = await fit(page);
  expect(three.scroll).toBe(0);
  expect(three.cols).toBe('2');

  await page.click('#btn-tl-toggle');
  await expect(page.locator('#main')).toHaveClass(/left-collapsed/);
  expect((await fit(page)).scroll).toBe(0);

  await page.setViewportSize({ width: 760, height: 900 });
  await page.waitForTimeout(300);
  expect((await fit(page)).scroll).toBe(0);
});

test('page ouverte en file:// : explication au lieu d\'une page cassée', async ({ page }) => {
  await page.goto('file://' + process.cwd() + '/index.html');
  await expect(page.locator('#banner')).toContainText('file://');
  const top = await page.evaluate(() => ({
    bar: document.querySelector('#topbar').getBoundingClientRect().bottom,
    panel: document.querySelector('#tl-panel').getBoundingClientRect().top,
  }));
  expect(top.panel).toBeGreaterThan(top.bar);
});

test('barre flottante : même ordre que la barre principale, état et retours', async ({ page, context }) => {
  await fakePip(page);
  await open(page);
  const popup = context.waitForEvent('page');
  await page.click('#btn-pip');
  const pip = await popup;
  await expect(pip.locator('.pip-tools [data-a]')).toHaveCount(5);
  expect(await pip.locator('.pip-tools [data-a]').evaluateAll((b) => b.map((x) => x.dataset.a))).toEqual(['narrate', 'photo', 'clip', 'marker', 'screen']);

  await pip.click('[data-a=photo]'); // sans caméra : signalé sur le bouton
  await expect(pip.locator('[data-a=photo]')).toHaveClass(/fail/);

  await pip.click('[data-a=marker]');
  await expect(pip.locator('.pip-count span')).toHaveText('1');
  await pip.click('[data-a=narrate]');
  await expect(pip.locator('[data-a=narrate]')).toHaveClass(/rec/);
  await expect(pip.locator('.pip-state .dot')).toHaveClass(/rec/);
  await pip.waitForTimeout(2000); // un segment trop court (quelques millisecondes) est ignoré
  await pip.click('[data-a=narrate]');
  await expect(pip.locator('.pip-count span')).toHaveText('2');
});
