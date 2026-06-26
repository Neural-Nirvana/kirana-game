import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MOBILE_BREAKPOINT_PX,
  closedMobilePanels,
  computeMobileLayoutClasses,
  isMobileCinemaViewport,
  isMobileWatchViewport,
  nextStateOnToggleDetail,
  nextStateOnToggleSidebar,
  openReplayDrawerState,
  panelsForCinemaEntry,
  runLayoutStateSequence,
} from './arena-mobile-layout.ts';

describe('arena-mobile-layout', () => {
  it('detects mobile watch using the smaller viewport edge', () => {
    assert.equal(isMobileWatchViewport(390, 844), true);
    assert.equal(isMobileWatchViewport(844, 390), true);
    assert.equal(isMobileWatchViewport(MOBILE_BREAKPOINT_PX, 900), true);
    assert.equal(isMobileWatchViewport(1024, 768), false);
    assert.equal(isMobileWatchViewport(1200, 800), false);
  });

  it('detects landscape cinema only on mobile landscape', () => {
    assert.equal(isMobileCinemaViewport(844, 390), true);
    assert.equal(isMobileCinemaViewport(390, 844), false);
    assert.equal(isMobileCinemaViewport(1200, 800), false);
  });

  it('toggles sidebar and closes detail when opening drawer', () => {
    const closed = closedMobilePanels();
    const opened = nextStateOnToggleSidebar(closed);
    assert.equal(opened.sidebarCollapsed, false);
    assert.equal(opened.detailPanelOpen, false);

    const withDetail = { sidebarCollapsed: true, detailPanelOpen: true };
    const reopened = nextStateOnToggleSidebar(withDetail);
    assert.equal(reopened.sidebarCollapsed, false);
    assert.equal(reopened.detailPanelOpen, false);
  });

  it('toggles detail and closes sidebar when opening sheet', () => {
    const opened = nextStateOnToggleDetail(closedMobilePanels());
    assert.equal(opened.sidebarCollapsed, true);
    assert.equal(opened.detailPanelOpen, true);

    const closed = nextStateOnToggleDetail(opened);
    assert.equal(closed.detailPanelOpen, false);
  });

  it('open replay drawer resets detail', () => {
    const drawer = openReplayDrawerState();
    assert.deepEqual(drawer, { sidebarCollapsed: false, detailPanelOpen: false });
  });

  it('cinema entry closes panels', () => {
    assert.deepEqual(
      panelsForCinemaEntry({ sidebarCollapsed: false, detailPanelOpen: true }),
      closedMobilePanels(),
    );
  });

  it('computes portrait mobile classes and scrim when panels open', () => {
    const portrait = computeMobileLayoutClasses({
      viewportWidth: 390,
      viewportHeight: 844,
      panels: { sidebarCollapsed: false, detailPanelOpen: false },
      fullscreen: false,
      desktopSidebarCollapsed: true,
    });
    assert.ok(portrait.root.includes('a2-mobile-watch'));
    assert.ok(portrait.root.includes('a2-mobile-portrait'));
    assert.ok(!portrait.root.includes('a2-mobile-cinema'));
    assert.ok(portrait.body.includes('sidebar-open'));
    assert.equal(portrait.scrimVisible, true);

    const detail = computeMobileLayoutClasses({
      viewportWidth: 390,
      viewportHeight: 844,
      panels: { sidebarCollapsed: true, detailPanelOpen: true },
      fullscreen: false,
      desktopSidebarCollapsed: true,
    });
    assert.ok(detail.body.includes('detail-open'));
    assert.equal(detail.scrimVisible, true);
  });

  it('computes landscape cinema classes with larger stage mode', () => {
    const landscape = computeMobileLayoutClasses({
      viewportWidth: 844,
      viewportHeight: 390,
      panels: closedMobilePanels(),
      fullscreen: false,
      desktopSidebarCollapsed: true,
    });
    assert.ok(landscape.root.includes('a2-mobile-watch'));
    assert.ok(landscape.root.includes('a2-mobile-cinema'));
    assert.equal(landscape.scrimVisible, false);
  });

  it('fullscreen suppresses scrim and adds cinema class on mobile', () => {
    const fs = computeMobileLayoutClasses({
      viewportWidth: 390,
      viewportHeight: 844,
      panels: { sidebarCollapsed: false, detailPanelOpen: true },
      fullscreen: true,
      desktopSidebarCollapsed: true,
    });
    assert.ok(fs.root.includes('a2-fullscreen-active'));
    assert.ok(fs.root.includes('a2-mobile-cinema'));
    assert.equal(fs.scrimVisible, false);
  });

  it('runs the no-run → drawer → detail → close state machine on a mock viewport', () => {
    const viewport = { width: 390, height: 844 };
    const trace = runLayoutStateSequence(viewport, [
      'openDrawer',
      'toggleDetail',
      'closePanels',
    ]);

    assert.equal(trace.length, 3);
    assert.ok(trace[0].body.includes('sidebar-open'));
    assert.ok(!trace[0].body.includes('detail-open'));
    assert.ok(trace[1].body.includes('detail-open'));
    assert.ok(!trace[1].body.includes('sidebar-open'));
    assert.deepEqual(trace[2].body, []);
    assert.equal(trace[2].scrimVisible, false);
  });

  it('runs cinema entry after open panels on landscape viewport', () => {
    const trace = runLayoutStateSequence(
      { width: 844, height: 390 },
      ['openDrawer', 'toggleDetail', 'enterCinema'],
    );
    assert.ok(trace[2].root.includes('a2-mobile-cinema'));
    assert.equal(trace[2].scrimVisible, false);
    assert.deepEqual(trace[2].body, []);
  });

  it('desktop layout only toggles sidebar-collapsed', () => {
    const desktop = computeMobileLayoutClasses({
      viewportWidth: 1200,
      viewportHeight: 800,
      panels: closedMobilePanels(),
      fullscreen: false,
      desktopSidebarCollapsed: true,
    });
    assert.deepEqual(desktop.root, []);
    assert.deepEqual(desktop.body, ['sidebar-collapsed']);
    assert.equal(desktop.scrimVisible, false);
  });
});