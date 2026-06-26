#!/usr/bin/env node
/**
 * Playwright verification for Arena-2 mobile watch mode.
 * Usage: node scripts/verify-arena-mobile.mjs [--bases=local,prod] [--base=URL] [--run-id=...] [--scratch=...]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DESKTOP_STAGE_ASPECT = 1600 / 560;
const PORTRAIT_STAGE_ASPECT = 9 / 16;
const SCRATCH_DEFAULT = process.env.ARENA_MOBILE_SCRATCH
  ?? '/var/folders/n0/h5ddqnwn5jbd8y0lclpvqs_m0000gn/T/grok-goal-4e0fa7740486/implementer';

const APP_PREFIX = (process.env.KIRANA_BASE_PATH ?? '/dukaanbench').replace(/\/$/, '');

const BASE_PRESETS = {
  local: 'http://127.0.0.1:8787',
  prod: 'http://34.14.197.72',
};

function appUrl(base, subpath) {
  const normalized = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `${base}${APP_PREFIX}${normalized}`;
}

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    bases: { type: 'string', default: 'local,prod' },
    'run-id': { type: 'string' },
    scratch: { type: 'string', default: SCRATCH_DEFAULT },
  },
});

const SCRATCH = path.resolve(values.scratch);
const RUN_ID = values['run-id'];

function resolveBases() {
  if (values.base) return [values.base.replace(/\/$/, '')];
  return values.bases.split(',').map((key) => {
    const trimmed = key.trim();
    return BASE_PRESETS[trimmed] ?? trimmed.replace(/\/$/, '');
  });
}

async function fetchRunId(base) {
  if (RUN_ID) return RUN_ID;
  const res = await fetch(appUrl(base, '/api/arena/replays'));
  if (!res.ok) throw new Error(`Failed to load replays from ${base}: ${res.status}`);
  const data = await res.json();
  const runId = data.replays?.[0]?.runId;
  if (!runId) throw new Error(`No replays available at ${base}`);
  return runId;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPortraitStage(metrics, viewportWidth, viewportHeight, label) {
  assert(metrics.stageWidth >= viewportWidth * 0.92, `${label}: stage width ${metrics.stageWidth} < 92% viewport`);
  const frameAspect = metrics.stageWidth / metrics.stageHeight;
  assert(
    Math.abs(frameAspect - PORTRAIT_STAGE_ASPECT) < 0.08,
    `${label}: portrait frame aspect ${frameAspect.toFixed(3)} expected ~${PORTRAIT_STAGE_ASPECT.toFixed(3)}`,
  );
  assert(
    metrics.canvasWidth === 540 && metrics.canvasHeight === 960,
    `${label}: expected native portrait canvas 540x960, got ${metrics.canvasWidth}x${metrics.canvasHeight}`,
  );
  assert(
    metrics.stageHeight >= viewportHeight * 0.45,
    `${label}: portrait stage height ${metrics.stageHeight} too short for viewport`,
  );
}

function assertCinemaStage(metrics, viewportWidth, viewportHeight, label) {
  assert(metrics.stageWidth >= viewportWidth * 0.95, `${label}: cinema stage width ${metrics.stageWidth} too narrow`);
  assert(metrics.stageHeight >= viewportHeight * 0.55, `${label}: cinema stage height ${metrics.stageHeight} too short`);
  assert(metrics.stageWidth > metrics.stageHeight, `${label}: cinema stage should be landscape-dominant`);
}

async function verifyAppShell(page, lines) {
  const shell = await page.evaluate(() => {
    const hasNodeGlobals = typeof globalThis.require === 'function' || typeof globalThis.module !== 'undefined';
    const verify = window.__dukaanbenchArenaVerify;
    return {
      hasNodeGlobals,
      verifyPresent: Boolean(verify),
      shellReady: verify?.shellReady?.() ?? false,
      shellIds: verify?.shellIds ?? [],
      missingIds: (verify?.shellIds ?? []).filter((id) => !document.getElementById(id)),
      hasMobileWatchClass: document.querySelector('.a2-root')?.classList.contains('a2-mobile-watch') ?? false,
    };
  });
  lines.push(`app-shell: ${JSON.stringify(shell)}`);
  assert(!shell.hasNodeGlobals, 'browser context polluted with node globals');
  assert(shell.verifyPresent, 'missing window.__dukaanbenchArenaVerify');
  assert(shell.shellReady, `renderShell incomplete, missing: ${shell.missingIds.join(', ')}`);
  assert(shell.shellIds.length >= 6, 'shell id manifest too short');
}

async function verifyLayoutStateMachine(page, lines) {
  const sequence = await page.evaluate(() => {
    const layout = window.__dukaanbenchArenaVerify?.mobileLayout;
    if (!layout?.runLayoutStateSequence) return { error: 'mobileLayout hooks missing' };
    const trace = layout.runLayoutStateSequence({ width: 390, height: 844 }, [
      'openDrawer',
      'toggleDetail',
      'closePanels',
    ]);
    return {
      steps: trace.length,
      drawer: trace[0]?.body ?? [],
      detail: trace[1]?.body ?? [],
      closed: trace[2]?.body ?? [],
      scrimAfterClose: trace[2]?.scrimVisible ?? null,
    };
  });
  lines.push(`state-machine: ${JSON.stringify(sequence)}`);
  assert(!sequence.error, sequence.error ?? 'state machine eval failed');
  assert(sequence.steps === 3, 'state machine trace length');
  assert(sequence.drawer.includes('sidebar-open'), 'drawer step missing sidebar-open');
  assert(sequence.detail.includes('detail-open'), 'detail step missing detail-open');
  assert(sequence.closed.length === 0, 'close step should clear body classes');
  assert(sequence.scrimAfterClose === false, 'scrim should be off after close');
}

async function verifyDetailScroll(page, lines) {
  const scroll = await page.evaluate(() => {
    const body = document.querySelector('.a2-detail-body');
    const detail = document.querySelector('.a2-detail');
    if (!body || !detail) return null;
    const bodyRect = body.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    const style = getComputedStyle(body);
    return {
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      overflowY: style.overflowY,
      bodyBottom: bodyRect.bottom,
      detailBottom: detailRect.bottom,
      bodyTop: bodyRect.top,
      detailTop: detailRect.top,
      clipped: bodyRect.bottom > detailRect.bottom + 4 || bodyRect.top < detailRect.top - 4,
      hasTabContent: Boolean(body.querySelector('.a2-tab-content, .a2-tab-head')),
    };
  });
  lines.push(`detail-scroll: ${JSON.stringify(scroll)}`);
  assert(scroll, 'detail body not found while sheet open');
  assert(scroll.overflowY === 'auto' || scroll.overflowY === 'scroll', `detail body overflow-y is ${scroll.overflowY}`);
  assert(scroll.clientHeight >= 100, `detail body readable height too small: ${scroll.clientHeight}`);
  assert(!scroll.clipped, 'detail body clipped outside sheet bounds');
  assert(scroll.hasTabContent, 'detail tab content not rendered inside scroll region');
  assert(scroll.scrollHeight >= scroll.clientHeight, 'detail body scroll metrics inconsistent');
}

async function runPass(page, base, runId, passLabel, log) {
  const lines = [`=== ${base} pass ${passLabel} ===`];
  const consoleErrors = [];
  page.removeAllListeners('console');
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl(base, `/arena-2?runId=${encodeURIComponent(runId)}`), { waitUntil: 'domcontentloaded' });

  await page.locator('.a2-mobile-watch').waitFor({ state: 'attached', timeout: 15000 });
  await page.getByText(/Day 01/).first().waitFor({ state: 'visible', timeout: 45000 });

  await verifyAppShell(page, lines);
  await verifyLayoutStateMachine(page, lines);

  const portrait = await page.evaluate(() => {
    const frame = document.querySelector('.a2-stage-frame');
    const canvas = document.querySelector('#a2-stage canvas');
    const rect = frame?.getBoundingClientRect();
    return {
      mobileWatch: document.querySelector('.a2-root')?.classList.contains('a2-mobile-watch') ?? false,
      hasTopBar: Boolean(document.querySelector('.a2-mobile-bar-btn, .a2-mobile-bar-center')),
      hasScrim: Boolean(document.querySelector('#a2-scrim')),
      hasSheetHandle: Boolean(document.querySelector('.a2-detail-sheet-handle')),
      hasFullscreenBtn: Boolean(document.querySelector('[data-a2-action="toggle-fullscreen"]')),
      hasPortraitClass: document.querySelector('.a2-root')?.classList.contains('a2-mobile-portrait') ?? false,
      stageWidth: rect?.width ?? 0,
      stageHeight: rect?.height ?? 0,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  lines.push(`portrait: ${JSON.stringify(portrait)}`);
  assert(portrait.mobileWatch, 'missing a2-mobile-watch');
  assert(portrait.hasPortraitClass, 'missing a2-mobile-portrait');
  assert(portrait.hasTopBar, 'missing mobile top bar');
  assert(portrait.hasScrim, 'missing scrim');
  assert(portrait.hasFullscreenBtn, 'missing fullscreen control');
  assertPortraitStage(portrait, portrait.viewportWidth, portrait.viewportHeight, 'portrait');

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
  await verifyDetailScroll(page, lines);

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

  const envSlug = base.includes('127.0.0.1') ? 'local' : 'prod';
  await page.screenshot({ path: path.join(SCRATCH, `mobile-portrait-${envSlug}-${passLabel}.png`), scale: 'css' });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);

  const landscape = await page.evaluate(() => {
    const root = document.querySelector('.a2-root');
    const frame = document.querySelector('.a2-stage-frame');
    const canvas = document.querySelector('#a2-stage canvas');
    const rect = frame?.getBoundingClientRect();
    return {
      cinema: root?.classList.contains('a2-mobile-cinema') ?? false,
      stageWidth: rect?.width ?? 0,
      stageHeight: rect?.height ?? 0,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      viewportWidth: window.innerWidth,
      viewportArea: window.innerWidth * window.innerHeight,
      stageArea: (rect?.width ?? 0) * (rect?.height ?? 0),
    };
  });
  lines.push(`landscape: ${JSON.stringify(landscape)}`);
  assert(landscape.cinema, 'missing a2-mobile-cinema in landscape');
  assert(
    landscape.stageWidth > portrait.stageWidth * 1.5,
    `cinema stage should be wider than portrait (${landscape.stageWidth} vs ${portrait.stageWidth})`,
  );
  assert(
    portrait.stageHeight > landscape.stageHeight,
    `portrait stage should use more vertical space (${portrait.stageHeight} vs ${landscape.stageHeight})`,
  );
  assert(
    landscape.canvasWidth === 1600 && landscape.canvasHeight === 560,
    `landscape should use desktop canvas, got ${landscape.canvasWidth}x${landscape.canvasHeight}`,
  );
  assertCinemaStage(landscape, landscape.viewportWidth, 390, 'landscape');
  assert(landscape.stageArea / landscape.viewportArea > 0.55, 'cinema stage should dominate viewport');

  await page.screenshot({ path: path.join(SCRATCH, `mobile-landscape-${envSlug}-${passLabel}.png`), scale: 'css' });

  const fsBtn = page.locator('[data-a2-action="toggle-fullscreen"]').first();
  await fsBtn.waitFor({ state: 'visible', timeout: 5000 });
  await fsBtn.click();
  await page.waitForFunction(() => {
    const theater = document.getElementById('a2-theater');
    return document.fullscreenElement === theater;
  }, { timeout: 5000 });

  const fullscreenResult = await page.evaluate(() => {
    const theater = document.getElementById('a2-theater');
    return {
      active: document.fullscreenElement === theater,
      rootFullscreen: document.querySelector('.a2-root')?.classList.contains('a2-fullscreen-active') ?? false,
      stageWidth: document.querySelector('.a2-stage-frame')?.getBoundingClientRect().width ?? 0,
    };
  });
  lines.push(`fullscreen: ${JSON.stringify(fullscreenResult)}`);
  assert(fullscreenResult.active, 'document.fullscreenElement must be #a2-theater');
  assert(fullscreenResult.rootFullscreen, 'a2-fullscreen-active class missing while fullscreen');
  assert(fullscreenResult.stageWidth > landscape.stageWidth * 0.9, 'fullscreen stage did not expand');

  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement, { timeout: 5000 });
  const restored = await page.evaluate(() => ({
    fullscreen: Boolean(document.fullscreenElement),
    mobileWatch: document.querySelector('.a2-root')?.classList.contains('a2-mobile-watch') ?? false,
  }));
  lines.push(`fullscreen-exit: ${JSON.stringify(restored)}`);
  assert(!restored.fullscreen, 'fullscreen did not exit');
  assert(restored.mobileWatch, 'mobile watch class lost after fullscreen exit');

  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`);
  log.push(...lines, '');
}

async function main() {
  await mkdir(SCRATCH, { recursive: true });
  const bases = resolveBases();
  const log = [
    `timestamp=${new Date().toISOString()}`,
    `appPrefix=${APP_PREFIX}`,
    `bases=${bases.join(',')}`,
    `scratch=${SCRATCH}`,
    '',
  ];

  const browser = await chromium.launch({ headless: true });

  try {
    for (const base of bases) {
      const runId = await fetchRunId(base);
      log.push(`environment=${base}`, `runId=${runId}`, '');
      const page = await browser.newPage();
      try {
        await runPass(page, base, runId, '1', log);
        await runPass(page, base, runId, '2', log);
      } finally {
        await page.close();
      }
    }
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