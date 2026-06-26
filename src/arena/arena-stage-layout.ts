import type { ProductId } from '../types';

export type ArenaStageMode = 'desktop' | 'mobile-portrait';

export type StagePoint = { x: number; y: number };

export type StageLayout = {
  mode: ArenaStageMode;
  width: number;
  height: number;
  aspectRatio: number;
  padTop: number;
  backdropHeight: number;
  backdropCenterY: number;
  padBottom: number;
  robotCenter: StagePoint;
  robotSize: { w: number; h: number };
  customerEntry: StagePoint;
  customerExit: StagePoint;
  servicePosition: StagePoint;
  conveyorLaneY: number;
  conveyorBar: { x: number; width: number };
  counterHandoff: StagePoint;
  productPositions: Record<ProductId, StagePoint>;
  liveHud: StagePoint;
  planningPanel: StagePoint;
  restockStartX: number;
  stockWarning: StagePoint;
  marketingBurst: StagePoint;
  phasePopupX: { morning: number; afternoon: number; evening: number };
  thoughtBubbleBounds: { minX: number; maxX: number; minY: number; maxY: number };
  customerSize: { idle: { w: number; h: number }; active: { w: number; h: number } };
  ceremonyPanel: { w: number; h: number; burst: number; line: number };
};

const DESKTOP_PRODUCTS: Record<ProductId, StagePoint> = {
  milk: { x: 1060, y: 211 },
  bread: { x: 1206, y: 213 },
  maggi: { x: 1348, y: 207 },
  chips: { x: 1358, y: 271 },
  cold_drinks: { x: 1498, y: 257 },
  bananas: { x: 1426, y: 393 },
  eggs: { x: 1514, y: 393 },
};

const MOBILE_PRODUCTS: Record<ProductId, StagePoint> = {
  milk: { x: 458, y: 210 },
  bread: { x: 458, y: 268 },
  maggi: { x: 458, y: 326 },
  chips: { x: 408, y: 238 },
  cold_drinks: { x: 408, y: 296 },
  bananas: { x: 408, y: 354 },
  eggs: { x: 458, y: 384 },
};

export const DESKTOP_STAGE_LAYOUT: StageLayout = {
  mode: 'desktop',
  width: 1600,
  height: 560,
  aspectRatio: 1600 / 560,
  padTop: 85,
  backdropHeight: 390,
  backdropCenterY: 85 + 390 / 2,
  padBottom: 560 - 85 - 390,
  robotCenter: { x: 800, y: 290 },
  robotSize: { w: 210, h: 252 },
  customerEntry: { x: 96, y: 377 },
  customerExit: { x: 96, y: 391 },
  servicePosition: { x: 446, y: 353 },
  conveyorLaneY: 387,
  conveyorBar: { x: 620, width: 520 },
  counterHandoff: { x: 538, y: 387 },
  productPositions: DESKTOP_PRODUCTS,
  liveHud: { x: 1408, y: 52 },
  planningPanel: { x: 24, y: 128 },
  restockStartX: 72,
  stockWarning: { x: 1540, y: 187 },
  marketingBurst: { x: 520, y: 398 },
  phasePopupX: { morning: 308, afternoon: 800, evening: 1290 },
  thoughtBubbleBounds: { minX: 90, maxX: 1180, minY: 93, maxY: 520 },
  customerSize: { idle: { w: 90, h: 150 }, active: { w: 104, h: 172 } },
  ceremonyPanel: { w: 860, h: 252, burst: 112, line: 720 },
};

export const MOBILE_PORTRAIT_STAGE_LAYOUT: StageLayout = {
  mode: 'mobile-portrait',
  width: 540,
  height: 960,
  aspectRatio: 9 / 16,
  padTop: 56,
  backdropHeight: 520,
  backdropCenterY: 56 + 520 / 2,
  padBottom: 960 - 56 - 520,
  robotCenter: { x: 270, y: 410 },
  robotSize: { w: 148, h: 178 },
  customerEntry: { x: 270, y: 872 },
  customerExit: { x: 270, y: 910 },
  servicePosition: { x: 270, y: 728 },
  conveyorLaneY: 588,
  conveyorBar: { x: 270, width: 320 },
  counterHandoff: { x: 372, y: 588 },
  productPositions: MOBILE_PRODUCTS,
  liveHud: { x: 378, y: 38 },
  planningPanel: { x: 14, y: 84 },
  restockStartX: 64,
  stockWarning: { x: 462, y: 126 },
  marketingBurst: { x: 270, y: 500 },
  phasePopupX: { morning: 108, afternoon: 270, evening: 432 },
  thoughtBubbleBounds: { minX: 56, maxX: 484, minY: 72, maxY: 820 },
  customerSize: { idle: { w: 72, h: 118 }, active: { w: 84, h: 138 } },
  ceremonyPanel: { w: 500, h: 220, burst: 88, line: 460 },
};

export function getArenaStageLayout(mode: ArenaStageMode): StageLayout {
  return mode === 'mobile-portrait' ? MOBILE_PORTRAIT_STAGE_LAYOUT : DESKTOP_STAGE_LAYOUT;
}

export function resolveArenaStageMode(
  width: number,
  height: number,
  options: { cinema?: boolean; fullscreen?: boolean } = {},
): ArenaStageMode {
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  const mobile = shortEdge <= 768 && longEdge < 1024;
  const portrait = height >= width;
  if (mobile && portrait && !options.cinema && !options.fullscreen) return 'mobile-portrait';
  return 'desktop';
}

export function conveyPath(layout: StageLayout, start: StagePoint, handoff: StagePoint): StagePoint[] {
  if (layout.mode === 'mobile-portrait') {
    return [
      { x: start.x - 20, y: start.y + 34 },
      { x: layout.counterHandoff.x, y: layout.conveyorLaneY },
      { x: layout.robotCenter.x, y: layout.conveyorLaneY },
      handoff,
    ];
  }
  return [
    { x: start.x - 80, y: layout.conveyorLaneY - 8 },
    layout.counterHandoff,
    { x: layout.robotCenter.x - 70, y: layout.conveyorLaneY + 2 },
    handoff,
  ];
}