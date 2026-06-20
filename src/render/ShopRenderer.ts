import type { ProductId, ShopVisualState } from '../types';
import { PRODUCTS, COLORS, PRODUCT_COLORS } from '../constants/products';
import { GameState } from '../game/GameState';

type VisualItemId =
  | 'rice'
  | 'atta'
  | 'dal'
  | 'oil'
  | 'sugar'
  | 'salt'
  | 'masala'
  | 'tea'
  | 'biscuits'
  | 'soap'
  | 'detergent'
  | 'toothpaste'
  | 'shampoo'
  | 'matchbox'
  | 'agarbatti';

type RackItemId = ProductId | VisualItemId;

const SHOP_BOARD_BG_URL = new URL('../assets/shop-rack-bg.png', import.meta.url).href;
const PRODUCT_SPRITE_URLS: Record<RackItemId, string> = {
  milk: new URL('../assets/items/milk.png', import.meta.url).href,
  bread: new URL('../assets/items/bread.png', import.meta.url).href,
  eggs: new URL('../assets/items/eggs.png', import.meta.url).href,
  maggi: new URL('../assets/items/maggi.png', import.meta.url).href,
  chips: new URL('../assets/items/chips.png', import.meta.url).href,
  cold_drinks: new URL('../assets/items/cold-drinks.png', import.meta.url).href,
  bananas: new URL('../assets/items/bananas.png', import.meta.url).href,
  rice: new URL('../assets/items/rice.png', import.meta.url).href,
  atta: new URL('../assets/items/atta.png', import.meta.url).href,
  dal: new URL('../assets/items/dal.png', import.meta.url).href,
  oil: new URL('../assets/items/oil.png', import.meta.url).href,
  sugar: new URL('../assets/items/sugar.png', import.meta.url).href,
  salt: new URL('../assets/items/salt.png', import.meta.url).href,
  masala: new URL('../assets/items/masala.png', import.meta.url).href,
  tea: new URL('../assets/items/tea.png', import.meta.url).href,
  biscuits: new URL('../assets/items/biscuits.png', import.meta.url).href,
  soap: new URL('../assets/items/soap.png', import.meta.url).href,
  detergent: new URL('../assets/items/detergent.png', import.meta.url).href,
  toothpaste: new URL('../assets/items/toothpaste.png', import.meta.url).href,
  shampoo: new URL('../assets/items/shampoo.png', import.meta.url).href,
  matchbox: new URL('../assets/items/matchbox.png', import.meta.url).href,
  agarbatti: new URL('../assets/items/agarbatti.png', import.meta.url).href,
};

const VISUAL_ITEM_INFO: Record<VisualItemId, { stock: number; unit: string; color: string }> = {
  rice: { stock: 18, unit: 'kg', color: '#F8FAFC' },
  atta: { stock: 16, unit: 'kg', color: '#FDE68A' },
  dal: { stock: 22, unit: 'pk', color: '#FACC15' },
  oil: { stock: 14, unit: 'bt', color: '#F59E0B' },
  sugar: { stock: 15, unit: 'kg', color: '#DBEAFE' },
  salt: { stock: 28, unit: 'pk', color: '#BAE6FD' },
  masala: { stock: 34, unit: 'pk', color: '#FB923C' },
  tea: { stock: 20, unit: 'pk', color: '#B45309' },
  biscuits: { stock: 30, unit: 'pk', color: '#D97706' },
  soap: { stock: 24, unit: 'pc', color: '#F9A8D4' },
  detergent: { stock: 18, unit: 'pk', color: '#38BDF8' },
  toothpaste: { stock: 12, unit: 'pc', color: '#60A5FA' },
  shampoo: { stock: 26, unit: 'pc', color: '#A78BFA' },
  matchbox: { stock: 40, unit: 'bx', color: '#EF4444' },
  agarbatti: { stock: 15, unit: 'pk', color: '#C084FC' },
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Zone extends Rect {
  id: string;
  label: string;
  color: string;
}

const RACK_ZONES = {
  fridge: { id: 'fridge', label: 'FRIDGE', x: 0.035, y: 0.155, w: 0.205, h: 0.61, color: '#3B82F6' },
  shelves: { id: 'shelves', label: 'RACK FACE', x: 0.275, y: 0.16, w: 0.66, h: 0.53, color: '#F59E0B' },
  crates: { id: 'crates', label: 'CRATES', x: 0.43, y: 0.73, w: 0.53, h: 0.15, color: '#10B981' },
  supply: { id: 'supply', label: 'SUPPLY', x: 0.035, y: 0.84, w: 0.33, h: 0.1, color: '#F97316' },
  customers: { id: 'customers', label: 'CUSTOMERS', x: 0.38, y: 0.89, w: 0.36, h: 0.075, color: '#8B5CF6' },
  waste: { id: 'waste', label: 'WASTE', x: 0.83, y: 0.71, w: 0.135, h: 0.13, color: '#F43F5E' },
} satisfies Record<string, Zone>;

type ZoneKey = keyof typeof RACK_ZONES;

interface RackProductSlot extends Rect {
  pid: RackItemId;
  zone: ZoneKey;
  label: string;
}

interface RackPage {
  title: string;
  subtitle: string;
  accent: string;
  slots: RackProductSlot[];
}

const RACK_PAGES = [
  {
    title: 'Daily Breakfast',
    subtitle: 'milk bread eggs tea biscuits',
    accent: '#10B981',
    slots: [
      { pid: 'milk', label: 'MILK', zone: 'fridge', x: 0.15, y: 0.12, w: 0.28, h: 0.17 },
      { pid: 'bread', label: 'BREAD', zone: 'shelves', x: 0.07, y: 0.04, w: 0.2, h: 0.17 },
      { pid: 'eggs', label: 'EGGS', zone: 'shelves', x: 0.39, y: 0.04, w: 0.19, h: 0.17 },
      { pid: 'tea', label: 'TEA', zone: 'shelves', x: 0.7, y: 0.04, w: 0.18, h: 0.17 },
      { pid: 'biscuits', label: 'BISCUITS', zone: 'shelves', x: 0.1, y: 0.29, w: 0.2, h: 0.15 },
      { pid: 'sugar', label: 'SUGAR', zone: 'shelves', x: 0.42, y: 0.29, w: 0.18, h: 0.16 },
      { pid: 'bananas', label: 'BANANAS', zone: 'crates', x: 0.68, y: 0.03, w: 0.22, h: 0.74 },
    ],
  },
  {
    title: 'Staple Shelf',
    subtitle: 'rice atta dal oil salt masala',
    accent: '#F59E0B',
    slots: [
      { pid: 'rice', label: 'RICE', zone: 'shelves', x: 0.07, y: 0.04, w: 0.2, h: 0.18 },
      { pid: 'atta', label: 'ATTA', zone: 'shelves', x: 0.39, y: 0.04, w: 0.2, h: 0.18 },
      { pid: 'dal', label: 'DAL', zone: 'shelves', x: 0.7, y: 0.04, w: 0.19, h: 0.18 },
      { pid: 'oil', label: 'OIL', zone: 'shelves', x: 0.08, y: 0.29, w: 0.17, h: 0.2 },
      { pid: 'salt', label: 'SALT', zone: 'shelves', x: 0.42, y: 0.3, w: 0.17, h: 0.17 },
      { pid: 'masala', label: 'MASALA', zone: 'shelves', x: 0.7, y: 0.31, w: 0.21, h: 0.16 },
    ],
  },
  {
    title: 'Snacks & Drinks',
    subtitle: 'chips noodles drinks biscuits',
    accent: '#F97316',
    slots: [
      { pid: 'cold_drinks', label: 'COLD DRINKS', zone: 'fridge', x: 0.47, y: 0.38, w: 0.36, h: 0.21 },
      { pid: 'chips', label: 'CHIPS', zone: 'shelves', x: 0.07, y: 0.04, w: 0.2, h: 0.17 },
      { pid: 'maggi', label: 'MAGGI', zone: 'shelves', x: 0.39, y: 0.04, w: 0.2, h: 0.17 },
      { pid: 'biscuits', label: 'BISCUITS', zone: 'shelves', x: 0.68, y: 0.04, w: 0.22, h: 0.16 },
      { pid: 'tea', label: 'TEA', zone: 'shelves', x: 0.11, y: 0.29, w: 0.18, h: 0.17 },
      { pid: 'masala', label: 'MASALA', zone: 'shelves', x: 0.43, y: 0.31, w: 0.2, h: 0.16 },
    ],
  },
  {
    title: 'Home & Care',
    subtitle: 'soap detergent toothpaste shampoo',
    accent: '#38BDF8',
    slots: [
      { pid: 'soap', label: 'SOAP', zone: 'shelves', x: 0.07, y: 0.04, w: 0.2, h: 0.17 },
      { pid: 'detergent', label: 'DETERGENT', zone: 'shelves', x: 0.38, y: 0.04, w: 0.2, h: 0.18 },
      { pid: 'toothpaste', label: 'TOOTHPASTE', zone: 'shelves', x: 0.69, y: 0.05, w: 0.21, h: 0.15 },
      { pid: 'shampoo', label: 'SHAMPOO', zone: 'shelves', x: 0.09, y: 0.3, w: 0.2, h: 0.18 },
      { pid: 'agarbatti', label: 'AGARBATTI', zone: 'shelves', x: 0.4, y: 0.31, w: 0.23, h: 0.15 },
      { pid: 'matchbox', label: 'MATCHBOX', zone: 'shelves', x: 0.72, y: 0.31, w: 0.18, h: 0.15 },
    ],
  },
  {
    title: 'Full Kirana Wall',
    subtitle: 'fast scan of active shop stock',
    accent: '#8B5CF6',
    slots: [
      { pid: 'milk', label: 'MILK', zone: 'fridge', x: 0.16, y: 0.12, w: 0.25, h: 0.16 },
      { pid: 'cold_drinks', label: 'COLD', zone: 'fridge', x: 0.48, y: 0.39, w: 0.34, h: 0.19 },
      { pid: 'rice', label: 'RICE', zone: 'shelves', x: 0.05, y: 0.03, w: 0.15, h: 0.15 },
      { pid: 'atta', label: 'ATTA', zone: 'shelves', x: 0.25, y: 0.03, w: 0.15, h: 0.15 },
      { pid: 'dal', label: 'DAL', zone: 'shelves', x: 0.45, y: 0.03, w: 0.15, h: 0.15 },
      { pid: 'oil', label: 'OIL', zone: 'shelves', x: 0.67, y: 0.03, w: 0.13, h: 0.17 },
      { pid: 'sugar', label: 'SUGAR', zone: 'shelves', x: 0.07, y: 0.3, w: 0.14, h: 0.15 },
      { pid: 'salt', label: 'SALT', zone: 'shelves', x: 0.26, y: 0.3, w: 0.14, h: 0.15 },
      { pid: 'masala', label: 'MASALA', zone: 'shelves', x: 0.45, y: 0.31, w: 0.17, h: 0.14 },
      { pid: 'soap', label: 'SOAP', zone: 'shelves', x: 0.68, y: 0.31, w: 0.16, h: 0.14 },
      { pid: 'bananas', label: 'BANANAS', zone: 'crates', x: 0.28, y: 0.04, w: 0.2, h: 0.7 },
      { pid: 'matchbox', label: 'MATCH', zone: 'crates', x: 0.58, y: 0.08, w: 0.16, h: 0.58 },
    ],
  },
] satisfies RackPage[];

export class ShopRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private animFrame: number = 0;
  private bgImage: HTMLImageElement = new Image();
  private bgReady = false;
  private productSprites: Partial<Record<RackItemId, HTMLImageElement>> = {};
  private spritesReady: Partial<Record<RackItemId, boolean>> = {};
  private lastState?: GameState;
  private lastVisualState?: ShopVisualState;
  private activeRackIndex = 0;
  private rackSlide = 0;
  private navButtons: { prev?: Rect; next?: Rect } = {};
  private customers: Array<{ offset: number; color: string }> = [];

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.tabIndex = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('click', this.handleCanvasClick);
    this.canvas.addEventListener('mousemove', this.handleCanvasMove);
    this.canvas.addEventListener('keydown', this.handleCanvasKeydown);
    this.initCustomers();
    this.loadBackground();
    this.loadProductSprites();
    requestAnimationFrame(() => this.animate());
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width * window.devicePixelRatio;
    this.canvas.height = this.height * window.devicePixelRatio;
    this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    if (this.lastState) {
      this.draw(this.lastState, this.lastVisualState);
    }
  }

  private loadBackground() {
    this.bgImage.onload = () => {
      this.bgReady = true;
      if (this.lastState) {
        this.draw(this.lastState, this.lastVisualState);
      }
    };
    this.bgImage.src = SHOP_BOARD_BG_URL;
  }

  private loadProductSprites() {
    (Object.entries(PRODUCT_SPRITE_URLS) as Array<[RackItemId, string]>).forEach(([pid, url]) => {
      const image = new Image();
      this.productSprites[pid] = image;
      image.onload = () => {
        this.spritesReady[pid] = true;
        if (this.lastState) {
          this.draw(this.lastState, this.lastVisualState);
        }
      };
      image.src = url;
    });
  }

  private initCustomers() {
    const colors = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0F766E'];
    this.customers = colors.map((color) => ({
      color,
      offset: Math.random() * Math.PI * 2,
    }));
  }

  render(state: GameState, visualState?: ShopVisualState) {
    this.lastState = state;
    this.lastVisualState = visualState;
    this.draw(state, visualState);
  }

  private animate() {
    this.animFrame += 0.018;
    this.rackSlide *= 0.82;
    if (Math.abs(this.rackSlide) < 0.005) {
      this.rackSlide = 0;
    }

    if (this.lastState) {
      this.draw(this.lastState, this.lastVisualState);
    }
    requestAnimationFrame(() => this.animate());
  }

  private handleCanvasClick = (event: MouseEvent) => {
    const point = this.getCanvasPoint(event);
    if (this.navButtons.prev && this.isInRect(point.x, point.y, this.navButtons.prev)) {
      this.switchRack(-1);
      return;
    }
    if (this.navButtons.next && this.isInRect(point.x, point.y, this.navButtons.next)) {
      this.switchRack(1);
    }
  };

  private handleCanvasMove = (event: MouseEvent) => {
    const point = this.getCanvasPoint(event);
    const overPrev = this.navButtons.prev && this.isInRect(point.x, point.y, this.navButtons.prev);
    const overNext = this.navButtons.next && this.isInRect(point.x, point.y, this.navButtons.next);
    this.canvas.style.cursor = overPrev || overNext ? 'pointer' : 'default';
  };

  private handleCanvasKeydown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.switchRack(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.switchRack(1);
    }
  };

  private getCanvasPoint(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private switchRack(delta: number) {
    this.activeRackIndex = (this.activeRackIndex + delta + RACK_PAGES.length) % RACK_PAGES.length;
    this.rackSlide = delta > 0 ? 1 : -1;

    if (this.lastState) {
      this.draw(this.lastState, this.lastVisualState);
    }
  }

  private draw(state: GameState, visualState?: ShopVisualState) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);
    this.drawCanvasBackdrop(w, h);

    const board = this.getBoardRect();
    this.drawBoardImage(board);
    this.drawZoneGuides(board);
    this.drawRackPage(board, state);
    this.drawRackNavigation(board);
    this.drawCustomerMood(board, state.trust);
    this.drawSupplyActivity(board, state);
    this.drawWasteActivity(board, state);

    if (visualState?.complaintBubbles?.length) {
      this.drawComplaintBubbles(board, visualState.complaintBubbles);
    }

    this.drawBoardHud(board, state);
  }

  private drawCanvasBackdrop(w: number, h: number) {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#F8F3ED');
    gradient.addColorStop(0.55, '#F2E9DF');
    gradient.addColorStop(1, '#E6D6C5');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  private getBoardRect(): Rect {
    const pad = Math.max(14, Math.min(this.width, this.height) * 0.025);
    const aspect = 4 / 3;
    const maxW = this.width - pad * 2;
    const maxH = this.height - pad * 2;

    let boardW = maxW;
    let boardH = boardW / aspect;
    if (boardH > maxH) {
      boardH = maxH;
      boardW = boardH * aspect;
    }

    return {
      x: (this.width - boardW) / 2,
      y: Math.max(pad, (this.height - boardH) / 2),
      w: boardW,
      h: boardH,
    };
  }

  private drawBoardImage(board: Rect) {
    const ctx = this.ctx;

    ctx.save();
    ctx.shadowColor = 'rgba(30,41,59,0.22)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    this.roundRect(board.x, board.y, board.w, board.h, 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    this.roundRect(board.x, board.y, board.w, board.h, 18);
    ctx.clip();

    if (this.bgReady) {
      ctx.drawImage(this.bgImage, board.x, board.y, board.w, board.h);
    } else {
      ctx.fillStyle = COLORS.shopFloor;
      ctx.fillRect(board.x, board.y, board.w, board.h);
    }

    ctx.fillStyle = 'rgba(15,23,42,0.03)';
    ctx.fillRect(board.x, board.y, board.w, board.h);
    ctx.restore();

    ctx.strokeStyle = 'rgba(30,41,59,0.18)';
    ctx.lineWidth = 1;
    this.roundRect(board.x, board.y, board.w, board.h, 18);
    ctx.stroke();
  }

  private drawZoneGuides(board: Rect) {
    (Object.values(RACK_ZONES) as Zone[]).forEach((zone) => {
      const rect = this.toBoardRect(board, zone);
      this.drawZoneFrame(rect, zone);
    });
  }

  private drawZoneFrame(rect: Rect, zone: Zone) {
    const ctx = this.ctx;
    const pulse = 0.32 + Math.sin(this.animFrame * 2 + rect.x * 0.01) * 0.08;

    ctx.save();
    ctx.fillStyle = this.hexToRgba(zone.color, 0.035);
    ctx.strokeStyle = this.hexToRgba(zone.color, pulse);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 7]);
    this.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    const rel = `r(${Math.round(zone.x * 100)},${Math.round(zone.y * 100)})`;
    const px = `p(${Math.round(rect.x)},${Math.round(rect.y)})`;
    this.drawLabel(zone.label, `${rel} ${px}`, rect.x + 6, rect.y + 7, zone.color, 0.72);
    ctx.restore();
  }

  private drawRackPage(board: Rect, state: GameState) {
    const page = RACK_PAGES[this.activeRackIndex];
    const ctx = this.ctx;
    const slide = this.rackSlide * board.w * 0.13;
    this.updateRackMetadata(page);

    ctx.save();
    this.roundRect(board.x, board.y, board.w, board.h, 18);
    ctx.clip();
    ctx.translate(slide, 0);
    page.slots.forEach((slot, index) => this.drawProductSlot(board, slot, state, page.accent, index));
    ctx.restore();

    this.drawRackTitle(board, page);
  }

  private updateRackMetadata(page: RackPage) {
    this.canvas.dataset.rackIndex = String(this.activeRackIndex);
    this.canvas.dataset.rackTitle = page.title;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `Kirana inventory rack ${this.activeRackIndex + 1} of ${RACK_PAGES.length}: ${page.title}`);
  }

  private drawProductSlot(board: Rect, slot: RackProductSlot, state: GameState, accent: string, index: number) {
    const zone = this.toBoardRect(board, RACK_ZONES[slot.zone]);
    const rect = this.toBoardRect(zone, slot);
    const product = this.isGameProduct(slot.pid) ? PRODUCTS.find((p) => p.id === slot.pid) : undefined;
    const stock = this.getRackItemStock(slot.pid, state);
    const lowThreshold = product ? product.baseDemand * 0.6 : 1;
    const status = stock <= 0 ? 'out' : stock < lowThreshold ? 'low' : 'ok';
    const color = this.getRackItemColor(slot.pid, accent);
    const bob = Math.sin(this.animFrame * 1.8 + index * 0.7) * 1.2;
    const drawRect = { ...rect, y: rect.y + bob };
    const opacity = status === 'out' ? 0.48 : 1;

    this.drawSlotShadow(drawRect, color, status);

    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    this.drawSpriteFit(slot.pid, drawRect.x + drawRect.w * 0.08, drawRect.y + drawRect.h * 0.08, drawRect.w * 0.84, drawRect.h * 0.78);
    this.ctx.restore();

    this.drawCountBubble(drawRect, this.formatStock(slot.pid, stock), status);
    this.drawMicroText(slot.label, drawRect.x + 2, drawRect.y + drawRect.h + 11, color);

    if (status === 'out') {
      this.drawWarningDot(drawRect.x + drawRect.w * 0.5, drawRect.y + drawRect.h * 0.52, 'OUT');
    }
  }

  private drawSlotShadow(rect: Rect, color: string, status: 'ok' | 'low' | 'out') {
    const ctx = this.ctx;
    const stroke = status === 'out' ? '#F43F5E' : status === 'low' ? '#F59E0B' : color;

    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.18)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = this.hexToRgba(color, status === 'out' ? 0.14 : 0.24);
    this.roundRect(rect.x, rect.y, rect.w, rect.h, 9);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.hexToRgba(stroke, status === 'ok' ? 0.38 : 0.68);
    ctx.lineWidth = status === 'ok' ? 1 : 2;
    this.roundRect(rect.x, rect.y, rect.w, rect.h, 9);
    ctx.stroke();
    ctx.restore();
  }

  private drawCountBubble(rect: Rect, text: string, status: 'ok' | 'low' | 'out') {
    const ctx = this.ctx;
    const fill = status === 'out' ? '#F43F5E' : status === 'low' ? '#F59E0B' : '#10B981';

    ctx.save();
    ctx.font = '800 10px JetBrains Mono, monospace';
    const bubbleW = Math.max(28, ctx.measureText(text).width + 14);
    const bubbleH = 22;
    const x = rect.x + rect.w - bubbleW + 7;
    const y = rect.y - 8;

    ctx.shadowColor = 'rgba(15,23,42,0.2)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = fill;
    this.roundRect(x, y, bubbleW, bubbleH, 11);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    this.roundRect(x, y, bubbleW, bubbleH, 11);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + bubbleW / 2, y + bubbleH / 2 + 0.5);
    ctx.restore();
  }

  private drawSpriteFit(pid: RackItemId, x: number, y: number, w: number, h: number): boolean {
    const image = this.productSprites[pid];
    if (!image || !this.spritesReady[pid] || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      this.drawFallbackSprite(pid, x, y, w, h);
      return false;
    }

    const imageAspect = image.naturalWidth / image.naturalHeight;
    const boxAspect = w / h;
    let drawW = w;
    let drawH = h;

    if (imageAspect > boxAspect) {
      drawH = w / imageAspect;
    } else {
      drawW = h * imageAspect;
    }

    this.ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
    return true;
  }

  private drawFallbackSprite(pid: RackItemId, x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = this.getRackItemColor(pid, '#E2E8F0');
    this.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(15,23,42,0.62)';
    ctx.font = '800 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.shortProductLabel(pid), x + w / 2, y + h / 2);
    ctx.restore();
  }

  private drawRackTitle(board: Rect, page: RackPage) {
    const ctx = this.ctx;
    const title = page.title.toUpperCase();
    const detail = `RACK ${this.activeRackIndex + 1}/${RACK_PAGES.length} | ${page.subtitle.toUpperCase()}`;
    const x = board.x + board.w * 0.405;
    const y = board.y + board.h * 0.055;

    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.8)';
    this.roundRect(x, y, board.w * 0.34, 38, 10);
    ctx.fill();
    ctx.fillStyle = page.accent;
    ctx.fillRect(x, y, 5, 38);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, x + 14, y + 7);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '700 8px JetBrains Mono, monospace';
    ctx.fillText(detail, x + 14, y + 22);
    ctx.restore();
  }

  private drawRackNavigation(board: Rect) {
    const size = Math.max(38, Math.min(50, board.w * 0.065));
    const prev = { x: board.x + 12, y: board.y + board.h * 0.45, w: size, h: size };
    const next = { x: board.x + board.w - size - 12, y: board.y + board.h * 0.45, w: size, h: size };
    this.navButtons = {
      prev,
      next,
    };

    this.drawNavButton(prev, '<');
    this.drawNavButton(next, '>');
    this.drawRackDots(board);
  }

  private drawNavButton(rect: Rect, label: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.26)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = 'rgba(15,23,42,0.78)';
    this.roundRect(rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    this.roundRect(rect.x, rect.y, rect.w, rect.h, 14);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 - 1);
    ctx.restore();
  }

  private drawRackDots(board: Rect) {
    const ctx = this.ctx;
    const cx = board.x + board.w * 0.5;
    const y = board.y + board.h * 0.94;

    ctx.save();
    RACK_PAGES.forEach((page, index) => {
      const active = index === this.activeRackIndex;
      ctx.fillStyle = active ? page.accent : 'rgba(255,255,255,0.72)';
      ctx.strokeStyle = 'rgba(15,23,42,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx + (index - 1) * 18, y, active ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  private drawSupplyActivity(board: Rect, state: GameState) {
    const zone = this.toBoardRect(board, RACK_ZONES.supply);
    const hasOrders = Object.values(state.currentActions.orders).some((q) => q && q > 0);
    const ctx = this.ctx;

    ctx.save();
    const glow = hasOrders ? 0.48 + Math.sin(this.animFrame * 4) * 0.16 : 0.22;
    ctx.fillStyle = this.hexToRgba(RACK_ZONES.supply.color, glow);
    this.roundRect(zone.x, zone.y + zone.h * 0.2, zone.w * 0.74, zone.h * 0.5, 11);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hasOrders ? 'RESTOCK INBOUND' : 'SUPPLIER READY', zone.x + zone.w * 0.37, zone.y + zone.h * 0.45);

    if (hasOrders) {
      const arrowX = zone.x + zone.w * (0.12 + (Math.sin(this.animFrame * 2) + 1) * 0.18);
      this.drawArrow(arrowX, zone.y + zone.h * 0.83, arrowX + zone.w * 0.3, zone.y + zone.h * 0.83, RACK_ZONES.supply.color);
    }
    ctx.restore();
  }

  private drawCustomerMood(board: Rect, trust: number) {
    const zone = this.toBoardRect(board, RACK_ZONES.customers);
    const count = Math.min(6, Math.max(2, Math.round(trust / 16)));
    const mood = trust < 50 ? '#F43F5E' : trust < 75 ? '#F59E0B' : '#10B981';
    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = 'rgba(139,92,246,0.38)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(zone.x + zone.w * 0.05, zone.y + zone.h * 0.7);
    ctx.lineTo(zone.x + zone.w * 0.95, zone.y + zone.h * 0.7);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const cx = zone.x + zone.w * (0.08 + t * 0.84);
      const cy = zone.y + zone.h * (0.56 + Math.sin(this.animFrame * 1.5 + this.customers[i].offset) * 0.08);
      this.drawCustomer(cx, cy, this.customers[i].color, mood);
    }

    this.drawLabel('CUSTOMERS', `trust ${Math.round(trust)}%`, zone.x + 4, zone.y - 18, RACK_ZONES.customers.color, 0.78);
    ctx.restore();
  }

  private drawCustomer(cx: number, cy: number, bodyColor: string, moodColor: string) {
    const ctx = this.ctx;

    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bodyColor;
    this.roundRect(cx - 7, cy - 2, 14, 17, 7);
    ctx.fill();

    ctx.fillStyle = '#F5B27B';
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = moodColor;
    ctx.beginPath();
    ctx.arc(cx + 8, cy - 14, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawWasteActivity(board: Rect, state: GameState) {
    const zone = this.toBoardRect(board, RACK_ZONES.waste);
    let nearExpiry = 0;

    for (const [pid, inv] of state.inventory) {
      const prod = PRODUCTS.find((p) => p.id === pid);
      if (!prod || prod.shelfLife > 5) continue;
      nearExpiry += inv.buckets.filter((b) => state.day - b.dayAdded >= prod.shelfLife - 1)
        .reduce((sum, b) => sum + b.quantity, 0);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = nearExpiry > 0 ? 'rgba(244,63,94,0.18)' : 'rgba(16,185,129,0.16)';
    this.roundRect(zone.x, zone.y + zone.h * 0.25, zone.w, zone.h * 0.5, 11);
    ctx.fill();
    ctx.restore();

    if (nearExpiry > 0) {
      this.drawWarningDot(zone.x + zone.w * 0.5, zone.y + zone.h * 0.24, `${nearExpiry}`);
    }
    this.drawZoneValue(zone, nearExpiry > 0 ? 'expiry risk' : 'clear', RACK_ZONES.waste.color);
  }

  private drawComplaintBubbles(board: Rect, complaints: string[]) {
    const zone = this.toBoardRect(board, RACK_ZONES.customers);
    complaints.slice(0, 3).forEach((_, index) => {
      this.drawWarningDot(zone.x + zone.w * (0.7 + index * 0.08), zone.y - 10 - index * 7, '!');
    });
  }

  private drawBoardHud(board: Rect, state: GameState) {
    const ctx = this.ctx;
    const weather = state.weather.replace('_', ' ').toUpperCase();
    const line1 = `DAY ${String(state.day).padStart(2, '0')}/30`;
    const line2 = `${weather} | CASH ${Math.round(state.cash).toLocaleString()} | TRUST ${Math.round(state.trust)}%`;

    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.84)';
    this.roundRect(board.x + 12, board.y + 12, Math.min(board.w - 24, 340), 54, 12);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 16px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(line1, board.x + 28, board.y + 22);

    ctx.fillStyle = 'rgba(255,255,255,0.76)';
    ctx.font = '700 10px JetBrains Mono, monospace';
    ctx.fillText(line2, board.x + 28, board.y + 44);
    ctx.restore();
  }

  private drawZoneValue(rect: Rect, text: string, color: string) {
    this.drawLabel(text.toUpperCase(), `p(${Math.round(rect.x + rect.w)},${Math.round(rect.y + rect.h)})`, rect.x + 5, rect.y + rect.h - 23, color, 0.8);
  }

  private drawLabel(title: string, detail: string, x: number, y: number, color: string, alpha = 0.82) {
    const ctx = this.ctx;
    ctx.font = '800 9px Inter, sans-serif';
    const titleW = ctx.measureText(title).width;
    ctx.font = '600 8px JetBrains Mono, monospace';
    const detailW = ctx.measureText(detail).width;
    const width = Math.max(titleW + 22, detailW + 18, 84);
    const height = 28;
    const safeX = Math.max(4, Math.min(x, this.width - width - 4));
    const safeY = Math.max(4, Math.min(y, this.height - height - 4));

    ctx.save();
    ctx.fillStyle = `rgba(15,23,42,${alpha})`;
    this.roundRect(safeX, safeY, width, height, 7);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(safeX, safeY, 4, height);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, safeX + 10, safeY + 5);

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 8px JetBrains Mono, monospace';
    ctx.fillText(detail, safeX + 10, safeY + 16);
    ctx.restore();
  }

  private drawMicroText(text: string, x: number, y: number, color: string) {
    const ctx = this.ctx;
    const fontSize = 10;
    const pillHeight = 18;

    ctx.save();
    ctx.font = `800 ${fontSize}px JetBrains Mono, monospace`;
    const pillWidth = Math.max(58, ctx.measureText(text).width + 14);
    ctx.fillStyle = 'rgba(15,23,42,0.78)';
    this.roundRect(x - 4, y - 12, pillWidth, pillHeight, 5);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 3, y - 3);
    ctx.restore();
  }

  private drawWarningDot(x: number, y: number, text: string) {
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(this.animFrame * 4) * 0.12;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#F43F5E';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 7px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
  }

  private drawArrow(x1: number, y1: number, x2: number, y2: number, color: string) {
    const ctx = this.ctx;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 9;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private toBoardRect(board: Rect, rect: Rect): Rect {
    return {
      x: board.x + board.w * rect.x,
      y: board.y + board.h * rect.y,
      w: board.w * rect.w,
      h: board.h * rect.h,
    };
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  private isInRect(x: number, y: number, rect: Rect): boolean {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  private isGameProduct(pid: RackItemId): pid is ProductId {
    return PRODUCTS.some((product) => product.id === pid);
  }

  private getRackItemStock(pid: RackItemId, state: GameState): number {
    if (this.isGameProduct(pid)) {
      return state.getProductInventory(pid)?.totalStock ?? 0;
    }
    return VISUAL_ITEM_INFO[pid].stock;
  }

  private getRackItemColor(pid: RackItemId, fallback: string): string {
    if (this.isGameProduct(pid)) {
      return PRODUCT_COLORS[pid] ?? fallback;
    }
    return VISUAL_ITEM_INFO[pid].color;
  }

  private formatStock(pid: RackItemId, stock: number): string {
    const rounded = Math.round(stock);
    const suffixes: Record<ProductId, string> = {
      milk: 'L',
      bread: 'pk',
      eggs: '',
      maggi: '',
      chips: '',
      cold_drinks: 'bt',
      bananas: 'kg',
    };
    const unit = this.isGameProduct(pid) ? suffixes[pid] : VISUAL_ITEM_INFO[pid].unit;
    return `${rounded}${unit}`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private shortProductLabel(pid: RackItemId): string {
    const labels: Record<RackItemId, string> = {
      milk: 'M',
      bread: 'B',
      eggs: 'E',
      maggi: 'Mg',
      chips: 'C',
      cold_drinks: 'Cd',
      bananas: 'Bn',
      rice: 'Rc',
      atta: 'At',
      dal: 'Dl',
      oil: 'Ol',
      sugar: 'Sg',
      salt: 'St',
      masala: 'Ms',
      tea: 'Te',
      biscuits: 'Bs',
      soap: 'Sp',
      detergent: 'Dt',
      toothpaste: 'Tp',
      shampoo: 'Sh',
      matchbox: 'Mt',
      agarbatti: 'Ag',
    };
    return labels[pid];
  }
}
