export const MOBILE_BREAKPOINT_PX = 768;

export type MobilePanelState = {
  sidebarCollapsed: boolean;
  detailPanelOpen: boolean;
};

export type MobileLayoutInput = {
  viewportWidth: number;
  viewportHeight: number;
  panels: MobilePanelState;
  fullscreen: boolean;
  desktopSidebarCollapsed: boolean;
};

export type MobileLayoutClasses = {
  root: string[];
  body: string[];
  scrimVisible: boolean;
};

export function isMobileWatchViewport(width: number, height = width) {
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  return shortEdge <= MOBILE_BREAKPOINT_PX && longEdge < 1024;
}

export function isMobileCinemaViewport(width: number, height: number) {
  return isMobileWatchViewport(width, height) && width > height;
}

export function nextStateOnToggleSidebar(state: MobilePanelState): MobilePanelState {
  const opening = state.sidebarCollapsed;
  return {
    sidebarCollapsed: !opening,
    detailPanelOpen: opening ? false : state.detailPanelOpen,
  };
}

export function nextStateOnToggleDetail(state: MobilePanelState): MobilePanelState {
  const opening = !state.detailPanelOpen;
  return {
    sidebarCollapsed: opening ? true : state.sidebarCollapsed,
    detailPanelOpen: opening,
  };
}

export function closedMobilePanels(): MobilePanelState {
  return { sidebarCollapsed: true, detailPanelOpen: false };
}

export function openReplayDrawerState(): MobilePanelState {
  return { sidebarCollapsed: false, detailPanelOpen: false };
}

export function computeMobileLayoutClasses(input: MobileLayoutInput): MobileLayoutClasses {
  const mobile = isMobileWatchViewport(input.viewportWidth, input.viewportHeight);
  const cinema = isMobileCinemaViewport(input.viewportWidth, input.viewportHeight);
  const root: string[] = [];
  const body: string[] = [];

  if (mobile) {
    root.push('a2-mobile-watch');
    if (!cinema && !input.fullscreen && input.viewportHeight >= input.viewportWidth) {
      root.push('a2-mobile-portrait');
    }
    if (cinema || input.fullscreen) root.push('a2-mobile-cinema');
    if (input.fullscreen) root.push('a2-fullscreen-active');

    if (!input.panels.sidebarCollapsed) body.push('sidebar-open');
    if (input.panels.detailPanelOpen) body.push('detail-open');
    const panelsOpen = !input.panels.sidebarCollapsed || input.panels.detailPanelOpen;
    if (panelsOpen) body.push('panels-open');

    return { root, body, scrimVisible: panelsOpen && !input.fullscreen };
  }

  if (input.desktopSidebarCollapsed) body.push('sidebar-collapsed');
  return { root, body, scrimVisible: false };
}

export function panelsForCinemaEntry(_panels: MobilePanelState): MobilePanelState {
  return closedMobilePanels();
}

export type LayoutStateOp = 'openDrawer' | 'toggleDetail' | 'closePanels' | 'enterCinema';

export function runLayoutStateSequence(
  viewport: { width: number; height: number },
  ops: LayoutStateOp[],
  desktopSidebarCollapsed = true,
) {
  let panels = closedMobilePanels();
  return ops.map((op) => {
    if (op === 'openDrawer') panels = openReplayDrawerState();
    if (op === 'toggleDetail') panels = nextStateOnToggleDetail(panels);
    if (op === 'closePanels') panels = closedMobilePanels();
    if (op === 'enterCinema') panels = panelsForCinemaEntry(panels);
    return computeMobileLayoutClasses({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      panels,
      fullscreen: false,
      desktopSidebarCollapsed,
    });
  });
}