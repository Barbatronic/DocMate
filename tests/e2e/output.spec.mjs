// Export : jamais d'écrasement dans le site, temps de travail.
import { test, expect } from '@playwright/test';

test('deux générations le même jour : document et médias suffixés, rien d\'écrasé', async ({ page }) => {
  await page.goto('/phone.html'); // page légère, même origine (IndexedDB de l'application)
  const written = await page.evaluate(async () => {
    const { putBlob } = await import('/js/core/store.js');
    const { assemble, writeToDir } = await import('/js/output/export.js');
    const { PRESETS } = await import('/js/output/profiles.js');
    // Dossier de site en mémoire (API File System Access).
    class Dir {
      constructor() { this.d = new Map(); }
      async getDirectoryHandle(n, o = {}) {
        let x = this.d.get(n);
        if (!x) { if (!o.create) throw new Error('NotFound'); x = new Dir(); this.d.set(n, x); }
        return x;
      }
      async getFileHandle(n, o = {}) {
        let x = this.d.get(n);
        if (!x) { if (!o.create) throw new Error('NotFound'); x = {}; this.d.set(n, x); }
        return { getFile: async () => new Blob([x.data ?? '']), createWritable: async () => ({ write: async (v) => (x.data = v), close: async () => {} }) };
      }
    }
    const png = await (await fetch('/icon.svg')).blob();
    const events = [
      { id: 'ph1', type: 'photo', t: 1, blobId: await putBlob(new Blob([png], { type: 'image/png' })) },
      { id: 'ph2', type: 'photo', t: 2, blobId: await putBlob(new Blob([png], { type: 'image/png' })) },
    ];
    const session = { started: Date.UTC(2026, 9, 28, 10), project: '' };
    const draft = { title: 'Mon test', slug: 'mon-test', description: '', state: '', next_step: '', body: 'a\n[[media:ph1]]\nb\n[[media:ph2]]\n',
      media: [{ id: 'ph1', filename: 'vis', alt: 'A', caption: 'C' }, { id: 'ph2', filename: 'vis', alt: 'A', caption: 'C' }] };
    const root = new Dir();
    const p = { ...PRESETS[0], webMaxPx: 0 };
    const out = [];
    for (let k = 0; k < 2; k++) out.push(await writeToDir(root, await assemble(p, session, events, draft, root), p));
    return out;
  });
  expect(written[0]).toEqual(['_posts/1970-01-01-mon-test.md', 'assets/images/1970-01-01-mon-test/vis.png', 'assets/images/1970-01-01-mon-test/vis-2.png']);
  expect(written[1]).toEqual(['_posts/1970-01-01-mon-test-2.md', 'assets/images/1970-01-01-mon-test-2/vis.png', 'assets/images/1970-01-01-mon-test-2/vis-2.png']);
});

test('temps de travail : les pauses de plus de 30 min ne comptent pas', async ({ page }) => {
  await page.goto('/phone.html');
  const ms = await page.evaluate(async () => {
    const { workTime } = await import('/js/output/export.js');
    const min = 60_000;
    return workTime([
      { t: 0, tEnd: 10 * min }, // 10 min de narration
      { t: 20 * min }, // photo 10 min plus tard (compte)
      { t: 24 * 60 * min }, // le lendemain (pause non comptée)
      { t: 24 * 60 * min + 5 * min },
    ]);
  });
  expect(ms).toBe(25 * 60_000);
});
