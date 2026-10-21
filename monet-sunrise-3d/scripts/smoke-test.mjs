import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.SMOKE_URL || 'http://127.0.0.1:4173';
const artifactDir = new URL('../artifacts/', import.meta.url);
await mkdir(artifactDir, { recursive: true });

const report = {
  baseURL,
  startedAt: new Date().toISOString(),
  browser: 'Chromium',
  checks: [],
  pageErrors: [],
  importantConsoleErrors: [],
  screenshots: [],
};

const check = (name, pass, details = '') => {
  report.checks.push({ name, pass: Boolean(pass), details });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${details ? ': ' + details : ''}`);
  assert.ok(pass, name + (details ? ': ' + details : ''));
};

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/shader error|failed to compile|webgl error|uncaught|three\.webglprogram/i.test(text)) {
      report.importantConsoleErrors.push(text);
    }
  });

  const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  check('HTTP response is successful', Boolean(response && response.ok()), String(response?.status()));
  await page.waitForSelector('#scene', { timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelector('#loading')?.classList.contains('gone'),
    { timeout: 10000 },
  );
  await page.waitForTimeout(1400);

  const initial = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    return {
      title: document.title,
      canvasPresent: Boolean(canvas),
      canvasSize: canvas ? [canvas.width, canvas.height] : [0, 0],
      webglAvailable: Boolean(gl),
      webglVersion: gl ? gl.getParameter(gl.VERSION) : 'unavailable',
      enterButtonPresent: Boolean(document.querySelector('#enter')),
      mainHeading: document.querySelector('h1')?.innerText ?? '',
    };
  });
  report.initialState = initial;
  check('Page title is present', initial.title.includes('IMPRESSION'), initial.title);
  check('Three.js canvas is sized', initial.canvasPresent && initial.canvasSize[0] > 0 && initial.canvasSize[1] > 0, initial.canvasSize.join('×'));
  check('WebGL context is available', initial.webglAvailable, initial.webglVersion);
  check('Primary entry control is present', initial.enterButtonPresent);
  check('Hero heading is visible', initial.mainHeading.replace(/\s/g, '').length > 5, initial.mainHeading.replace(/\n/g, ' '));

  const desktopPath = new URL('../artifacts/monet-sunrise-desktop.png', import.meta.url);
  await page.screenshot({ path: desktopPath.pathname, fullPage: true, animations: 'disabled' });
  report.screenshots.push('monet-sunrise-desktop.png');

  await page.locator('#enter').click();
  await page.waitForTimeout(1100);
  check('Enter canvas interaction applies immersive mode', await page.locator('#app').evaluate(el => el.classList.contains('immersed')));

  await page.locator('button[data-camera="drift"]').click();
  check('Drift camera button becomes active', await page.locator('button[data-camera="drift"]').evaluate(el => el.classList.contains('active')));
  await page.mouse.move(1080, 370);
  await page.mouse.wheel(0, 650);
  await page.waitForTimeout(1100);
  const progressWidth = await page.locator('#progressBar').evaluate(el => getComputedStyle(el).width);
  check('Scroll interaction updates scene progress', parseFloat(progressWidth) > 0, progressWidth);

  const immersedPath = new URL('../artifacts/monet-sunrise-immersed.png', import.meta.url);
  await page.screenshot({ path: immersedPath.pathname, fullPage: true, animations: 'disabled' });
  report.screenshots.push('monet-sunrise-immersed.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    canvasSize: [document.querySelector('canvas')?.width ?? 0, document.querySelector('canvas')?.height ?? 0],
    bodyOverflow: getComputedStyle(document.body).overflow,
    appWidth: document.querySelector('#app')?.getBoundingClientRect().width ?? 0,
  }));
  report.mobileState = mobile;
  check('Mobile layout matches viewport width', Math.abs(mobile.appWidth - 390) < 2, JSON.stringify(mobile));
  const mobilePath = new URL('../artifacts/monet-sunrise-mobile.png', import.meta.url);
  await page.screenshot({ path: mobilePath.pathname, fullPage: true, animations: 'disabled' });
  report.screenshots.push('monet-sunrise-mobile.png');

  await page.locator('#reset').click();
  check('Reset returns to opening state', !(await page.locator('#app').evaluate(el => el.classList.contains('immersed'))));

  report.pageErrors = [...new Set(report.pageErrors)];
  report.importantConsoleErrors = [...new Set(report.importantConsoleErrors)];
  check('No uncaught page exceptions', report.pageErrors.length === 0, report.pageErrors.join(' | ') || 'none');
  check('No important WebGL/shader console errors', report.importantConsoleErrors.length === 0, report.importantConsoleErrors.join(' | ') || 'none');
  report.finishedAt = new Date().toISOString();
  report.result = 'passed';
  await writeFile(new URL('../artifacts/qa-report.json', import.meta.url), JSON.stringify(report, null, 2));
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.result = 'failed';
  report.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  await writeFile(new URL('../artifacts/qa-report.json', import.meta.url), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
