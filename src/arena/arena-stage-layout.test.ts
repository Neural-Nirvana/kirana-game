import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DESKTOP_STAGE_LAYOUT,
  MOBILE_PORTRAIT_STAGE_LAYOUT,
  getArenaStageLayout,
  resolveArenaStageMode,
} from './arena-stage-layout.ts';

describe('arena-stage-layout', () => {
  it('exposes a portrait-native canvas size', () => {
    const mobile = getArenaStageLayout('mobile-portrait');
    assert.equal(mobile.width, 540);
    assert.equal(mobile.height, 960);
    assert.ok(mobile.aspectRatio < 1);
    assert.ok(mobile.height > mobile.width);
  });

  it('keeps desktop layout landscape', () => {
    const desktop = getArenaStageLayout('desktop');
    assert.equal(desktop.width, DESKTOP_STAGE_LAYOUT.width);
    assert.ok(desktop.width > desktop.height);
  });

  it('resolves portrait stage mode on mobile portrait viewports', () => {
    assert.equal(resolveArenaStageMode(390, 844), 'mobile-portrait');
    assert.equal(resolveArenaStageMode(844, 390, { cinema: true }), 'desktop');
    assert.equal(resolveArenaStageMode(1200, 800), 'desktop');
  });

  it('places mobile gameplay anchors in a vertical shop flow', () => {
    const mobile = MOBILE_PORTRAIT_STAGE_LAYOUT;
    assert.ok(mobile.customerEntry.y > mobile.robotCenter.y);
    assert.ok(mobile.servicePosition.y > mobile.robotCenter.y);
    assert.ok(mobile.productPositions.milk.x > mobile.robotCenter.x);
  });
});