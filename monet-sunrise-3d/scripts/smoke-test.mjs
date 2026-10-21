import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.SMOKE_URL || 'http://127.0.0.1:4173';
const reportURL = new URL('../artifacts/qa-report.json', import.meta.url);
const artifactDir = new URL('../artifacts/', import.meta.url);
await mkdir(artifactDir, { recursive: true });

const report = {
  baseURL,
  startedAt: new Date().toISOString(),
  browser: 'Chromium',
  checks: [],
  pageErrors: [],
  consoleErrors: [],
  importantConsoleErrors: [],
  requestFailures: [],
  failedResponses: [],
  actionErrors: [],
  screenshots: [],
};
const check = (name, pass, details = '') => {
  report.checks.push({ name, pass: Boolean(pass), details });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${details ? ': ' + details : ''}`);
};

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  // Throttle RAF during CI so SwiftShader can paint screenshots without a hot render loop.
  await page.addInitScript(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 180);
  });
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    report.consoleErrors.push(text);
    if (/shader error|failed to compile|webgl error|uncaught|three\.webglprogram|webglcontext/i.test(text)) {
      report.importantConsoleErrors.push(text);
    }
  });
  page.on('requestfailed', request => report.requestFailures.push({
    url: request.url(), failure: request.failure()?.errorText ?? 'unknown',
  }));
  page.on('response', response => {
    if (response.status() >= 400) report.failedResponses.push({ status: response.status(), url: response.url() });
  });

  let response;
  try {
    response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    check('HTTP response is successful', Boolean(response && response.ok()), String(response?.status()));
  } catch (error) {
    report.actionErrors.push('Navigation: ' + String(error));
    check('HTTP response is successful', false, String(error));
  }

  await page.waitForTimeout(2200);
  // Always save a first-frame screenshot, even when initialization fails.
  const desktopPath = new URL('../artifacts/monet-sunrise-desktop.png', import.meta.url);
  await page.screenshot({ path: desktopPath.pathname, fullPage: false, animations: 'allow', timeout: 15000 });
  report.screenshots.push('monet-sunrise-desktop.png');

  const initial = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    let gl = null;
    try { gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl') || null; } catch {}
    return {
      title: document.title,
      canvasPresent: Boolean(canvas),
      canvasSize: canvas ? [canvas.width, canvas.height] : [0, 0],
      webglAvailable: Boolean(gl),
      webglVersion: gl ? gl.getParameter(gl.VERSION) : 'unavailable',
      loadingClass: document.querySelector('#loading')?.className ?? 'missing',
      loadingVisibility: document.querySelector('#loading') ? getComputedStyle(document.querySelector('#loading')).visibility : 'missing',
      enterButtonPresent: Boolean(document.querySelector('#enter')),
      mainHeading: document.querySelector('h1')?.innerText ?? '',
      scripts: [...document.scripts].map(s => s.src || '[inline]'),
      resources: performance.getEntriesByType('resource').filter(r => r.name.includes('/assets/')).map(r => r.name),
    };
  });
  report.initialState = initial;
  check('Page title is present', initial.title.includes('IMPRESSION'), initial.title);
  check('Loading overlay dismissed', initial.loadingClass.split(' ').includes('gone'), initial.loadingClass);
  check('Three.js canvas is sized', initial.canvasPresent && initial.canvasSize[0] > 0 && initial.canvasSize[1] > 0, initial.canvasSize.join('×'));
  check('WebGL context is available', initial.webglAvailable, initial.webglVersion);
  check('Primary entry control is present', initial.enterButtonPresent);
  check('Hero heading is present', initial.mainHeading.replace(/\s/g, '').length > 5, initial.mainHeading.replace(/\n/g, ' '));

  try {
    await page.locator('#enter').click({ timeout: 4000 });
    await page.waitForTimeout(800);
    check('Enter canvas applies immersive mode', await page.locator('#app').evaluate(el => el.classList.contains('immersed')));
  } catch (error) {
    report.actionErrors.push('Enter canvas: ' + String(error));
    check('Enter canvas applies immersive mode', false, String(error));
  }

  try {
    await page.locator('button[data-camera="drift"]').click({ timeout: 4000 });
    check('Drift camera button becomes active', await page.locator('button[data-camera="drift"]').evaluate(el => el.classList.contains('active')));
  } catch (error) {
    report.actionErrors.push('Drift camera: ' + String(error));
    check('Drift camera button becomes active', false, String(error));
  }

  try {
    await page.mouse.move(1080, 370);
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(700);
    const progressWidth = await page.locator('#progressBar').evaluate(el => getComputedStyle(el).width);
    check('Scroll interaction updates scene progress', parseFloat(progressWidth) > 0, progressWidth);
  } catch (error) {
    report.actionErrors.push('Scroll: ' + String(error));
    check('Scroll interaction updates scene progress', false, String(error));
  }

  const immersedPath = new URL('../artifacts/monet-sunrise-immersed.png', import.meta.url);
  await page.screenshot({ path: immersedPath.pathname, fullPage: false, animations: 'allow', timeout: 15000 });
  report.screenshots.push('monet-sunrise-immersed.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const mobile = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    canvasSize: [document.querySelector('canvas')?.width ?? 0, document.querySelector('canvas')?.height ?? 0],
    appWidth: document.querySelector('#app')?.getBoundingClientRect().width ?? 0,
  }));
  report.mobileState = mobile;
  check('Mobile layout matches viewport width', Math.abs(mobile.appWidth - 390) < 2, JSON.stringify(mobile));
  const mobilePath = new URL('../artifacts/monet-sunrise-mobile.png', import.meta.url);
  await page.screenshot({ path: mobilePath.pathname, fullPage: false, animations: 'allow', timeout: 15000 });
  report.screenshots.push('monet-sunrise-mobile.png');

  try {
    await page.locator('#reset').click({ timeout: 4000 });
    check('Reset returns to opening state', !(await page.locator('#app').evaluate(el => el.classList.contains('immersed'))));
  } catch (error) {
    report.actionErrors.push('Reset: ' + String(error));
    check('Reset returns to opening state', false, String(error));
  }

  report.pageErrors = [...new Set(report.pageErrors)];
  report.consoleErrors = [...new Set(report.consoleErrors)];
  report.importantConsoleErrors = [...new Set(report.importantConsoleErrors)];
  report.result = report.checks.every(c => c.pass)
    && report.pageErrors.length === 0
    && report.importantConsoleErrors.length === 0
    ? 'passed' : 'failed';
  report.finishedAt = new Date().toISOString();
  await writeFile(reportURL, JSON.stringify(report, null, 2));
  console.log('QA report:', JSON.stringify({
    result: report.result, checks: report.checks, pageErrors: report.pageErrors,
    consoleErrors: report.consoleErrors, requestFailures: report.requestFailures,
    failedResponses: report.failedResponses, initialState: report.initialState,
  }, null, 2));
  if (report.result !== 'passed') process.exitCode = 1;
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.result = 'failed';
  report.failure = error instanceof Error ? error.stack ?? error.message : String(error);
  await writeFile(reportURL, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
