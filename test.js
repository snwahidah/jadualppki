const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('file:///home/user/jadual/Sistem_Jadual_PPKI.html');
  await page.waitForTimeout(600);

  const pill = await page.textContent('#status-pill');
  console.log('PILL:', pill.trim());

  await page.screenshot({ path: 'shot_kelas.png', fullPage: false });

  await page.click('[data-tab="guru"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot_guru.png', fullPage: false });

  // Editor: buat pertindihan sengaja, semak isu muncul, kemudian undo
  await page.click('[data-tab="editor"]');
  await page.waitForTimeout(300);
  const sel = page.locator('select[data-c="1 KRISTAL"][data-d="1"][data-p="0"]'); // Selasa P1 (BI Fazlina)
  const before = await sel.inputValue();
  await sel.selectOption('PD'); // PD = Auni; Auni mengajar 2 INTAN? semak isu berubah
  await page.waitForTimeout(300);
  const pill2 = await page.textContent('#status-pill');
  console.log('PILL selepas edit sengaja:', pill2.trim());
  const issueText = await page.textContent('.issuebox');
  console.log('ISU (petikan):', issueText.slice(0, 220).replace(/\s+/g, ' '));
  await page.screenshot({ path: 'shot_editor.png', fullPage: false });
  // undo
  await page.locator('select[data-c="1 KRISTAL"][data-d="1"][data-p="0"]').selectOption(before);
  await page.waitForTimeout(300);
  console.log('PILL selepas undo:', (await page.textContent('#status-pill')).trim());

  await page.click('[data-tab="tetapan"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot_tetapan.png', fullPage: false });

  await page.click('[data-tab="panduan"]');
  await page.waitForTimeout(200);

  // Uji penjana dalam pelayar (kekangan penuh)
  await page.click('[data-act="jana"]');
  await page.waitForFunction(
    () => document.getElementById('status-pill').textContent.includes('Sah') &&
          document.getElementById('jana-status').textContent === '',
    null, { timeout: 120000 }
  );
  console.log('JANA: selesai —', (await page.textContent('#status-pill')).trim());
  await page.click('[data-tab="kelas"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot_selepas_jana.png' });

  console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'tiada');
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
