#!/usr/bin/env node
/**
 * Playwright verification for Arena-2 mobile watch mode.
 * Usage: node scripts/verify-arena-mobile.mjs [--base=http://127.0.0.1:5175] [--run-id=...] [--scratch=...]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://127.0.0.1:8787' },
    'run-id': { type: 'string' },
    scratch: { type: 'string', default: process.env.ARENA_MOBILE_SCRATCH ?? '.' },
  },
});

const BASE = values.base.replace(/\/$/, '');
const SCRATCH = path.resolve(values.scratch);
const RUN_ID = values['run-id'];

async function fetchRunId() {
  if (RUN_ID) return RUN_ID;
  const res = await fetch(`${BASE}/api/arena/replays`);
  if (!res.ok) throw new Error(`Failed to load replays: ${res.status}`);
  const data = await res.json();
  const runId = data.replays?.[0]?.runId;
  if (!runId) throw new Error('No replays available for verification');
  return runId;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runPass(page, runId, passLabel, log) {
  const lines = [`=== pass ${passLabel} ===`];
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/arena-2?runId=${encodeURIComponent(runId)}`, { waitUntil: 'domcontentloaded' });

  await page.locator('.a2-mobile-watch').waitFor({ state: 'attached', timeout: 15000 });
  await page.getByText(/Day 01/).first().waitFor({ state: 'visible', timeout: 45000 });

  const portrait = await page.evaluate(() => {
    const root = document.querySelector('.a2-root');
    const frame = document.querySelector('.a2-stage-frame');
    const rect = frame?.getBoundingClientRect();
    return {
      mobileWatch: root?.classList.contains('a2-mobile-watch') ?? false,
      hasTopBar: Boolean(document.querySelector('.a2-mobile-bar-btn, .a2-mobile-bar-center')),
      hasScrim: Boolean(document.querySelector('#a2-scrim')),
      hasSheetHandle: Boolean(document.querySelector('.a2-detail-sheet-handle')),
      hasFullscreenBtn: Boolean(document.querySelector('[data-a2-action="toggle-fullscreen"]')),
      stageWidth: rect?.width ?? 0,
      stageHeight: rect?.height ?? 0,
    };
  });

  lines.push(`portrait: ${JSON.stringify(portrait)}`);
  assert(portrait.mobileWatch, 'missing a2-mobile-watch');
  assert(portrait.hasTopBar, 'missing mobile top bar');
  assert(portrait.hasScrim, 'missing scrim');
  assert(portrait.hasFullscreenBtn, 'missing fullscreen control');
  assert(portrait.stageWidth > 200, `stage too narrow: ${portrait.stageWidth}`);
  assert(portrait.stageHeight > 80, `stage too short: ${portrait.stageHeight}`);

  await page.getByRole('button', { name: 'Day details' }).click();
  await page.waitForTimeout(400);

  const detailOpen = await page.evaluate(() => ({
    detailOpen: document.querySelector('.a2-body')?.classList.contains('detail-open') ?? false,
    hasHandle: Boolean(document.querySelector('.a2-detail-sheet-handle')),
    hasClose: Boolean(document.querySelector('.a2-detail-close')),
  }));
  lines.push(`detail: ${JSON.stringify(detailOpen)}`);
  assert(detailOpen.detailOpen, 'detail sheet did not open');
  assert(detailOpen.hasHandle, 'missing sheet handle');
  assert(detailOpen.hasClose, 'missing sheet close');

  await page.locator('.a2-detail-close').click();
  await page.waitForTimeout(300);
  const detailClosed = await page.evaluate(() =>
    document.querySelector('.a2-body')?.classList.contains('detail-open') ?? false,
  );
  assert(!detailClosed, 'detail sheet did not close');

  await page.getByRole('button', { name: 'Browse replays' }).click();
  await page.waitForTimeout(300);
  const drawerOpen = await page.evaluate(() =>
    document.querySelector('.a2-body')?.classList.contains('sidebar-open') ?? false,
  );
  assert(drawerOpen, 'replay drawer did not open');
  await page.locator('#a2-scrim').click({ force: true });
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(SCRATCH, `mobile-portrait-${passLabel}.png`), scale: 'css' });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);

  const landscape = await page.evaluate(() => {
    const root = document.querySelector('.a2-root');
    const frame = document.querySelector('.a2-stage-frame');
    const rect = frame?.getBoundingClientRect();
    return {
      cinema: root?.classList.contains('a2-mobile-cinema') ?? false,
      stageWidth: rect?.width ?? 0,
      stageHeight: rect?.height ?? 0,
      viewportArea: window.innerWidth * window.innerHeight,
      stageArea: (rect?.width ?? 0) * (rect?.height ?? 0),
    };
  });
  lines.push(`landscape: ${JSON.stringify(landscape)}`);
  assert(landscape.cinema, 'missing a2-mobile-cinema in landscape');
  assert(landscape.stageHeight > portrait.stageHeight * 1.4, 'cinema stage not taller in landscape');

  await page.screenshot({ path: path.join(SCRATCH, `mobile-landscape-${passLabel}.png`), scale: 'css' });

  let fullscreenResult = 'skipped';
  try {
    const fsBtn = page.locator('[data-a2-action="toggle-fullscreen"]').first();
    await fsBtn.waitFor({ state: 'visible', timeout: 5000 });
    await fsBtn.click();
    await page.waitForTimeout(500);
    fullscreenResult = await page.evaluate(() => {
      const theater = document.getElementById('a2-theater');
      return {
        active: document.fullscreenElement === theater,
        rootFullscreen: document.querySelector('.a2-root')?.classList.contains('a2-fullscreen-active') ?? false,
      };
    });
    lines.push(`fullscreen: ${JSON.stringify(fullscreenResult)}`);
    if (fullscreenResult.active) {
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForTimeout(400);
    }
  } catch (error) {
    fullscreenResult = { error: String(error) };
    lines.push(`fullscreen: ${JSON.stringify(fullscreenResult)}`);
  }

  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`);
  log.push(...lines, '');
}

async function main() {
  await mkdir(SCRATCH, { recursive: true });
  const runId = await fetchRunId();
  const log = [`base=${BASE}`, `runId=${runId}`, `scratch=${SCRATCH}`, ''];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await runPass(page, runId, '1', log);
    await runPass(page, runId, '2', log);
    log.push('RESULT: PASS');
  } catch (error) {
    log.push(`RESULT: FAIL — ${error instanceof Error ? error.message : String(error)}`);
    await writeFile(path.join(SCRATCH, 'arena-mobile-run.log'), log.join('\n'));
    await browser.close();
    process.exitCode = 1;
    throw error;
  }

  await writeFile(path.join(SCRATCH, 'arena-mobile-run.log'), log.join('\n'));
  await browser.close();
  console.log(log.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});