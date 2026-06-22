import * as Phaser from 'phaser';
import type { ProductId } from '../types';
import type { ArenaInventoryTile, ArenaReplayDay, ArenaReplayEvent } from './arena-types';

import floorUrl from '../assets/arena/shop-floor.png';
import robotUrl from '../assets/arena/robot-shopkeeper.png';
import kioskUrl from '../assets/arena/ai-kiosk.png';
import customerStudentUrl from '../assets/arena/customer-student.png';
import customerRegularUrl from '../assets/arena/customer-regular.png';
import customerTeenUrl from '../assets/arena/customer-teen.png';
import customerElderUrl from '../assets/arena/customer-elder.png';
import customerFamilyUrl from '../assets/arena/customer-family.png';
import rackGroceryUrl from '../assets/arena/rack-milk.png';
import rackSnacksUrl from '../assets/arena/rack-snacks.png';
import fridgeUrl from '../assets/arena/fridge.png';
import conveyorUrl from '../assets/arena/conveyor.png';
import effectCashUrl from '../assets/arena/effect-cash.png';
import effectTrustUrl from '../assets/arena/effect-trust.png';
import effectKhataUrl from '../assets/arena/effect-khata.png';
import effectWarningUrl from '../assets/arena/effect-warning.png';
import effectRewardUrl from '../assets/arena/effect-reward.png';

import milkUrl from '../assets/arena/product-milk.png';
import breadUrl from '../assets/arena/product-bread.png';
import eggsUrl from '../assets/arena/product-eggs.png';
import maggiUrl from '../assets/arena/product-maggi.png';
import chipsUrl from '../assets/arena/product-chips.png';
import coldDrinksUrl from '../assets/arena/product-cold-drinks.png';
import bananasUrl from '../assets/arena/product-bananas.png';

const customerUrls = [
  customerStudentUrl,
  customerRegularUrl,
  customerTeenUrl,
  customerElderUrl,
  customerFamilyUrl,
] as const;

const productUrls: Record<ProductId, string> = {
  milk: milkUrl,
  bread: breadUrl,
  eggs: eggsUrl,
  maggi: maggiUrl,
  chips: chipsUrl,
  cold_drinks: coldDrinksUrl,
  bananas: bananasUrl,
};

const productPositions: Record<ProductId, { x: number; y: number }> = {
  milk: { x: 840, y: 100 },
  bread: { x: 950, y: 100 },
  maggi: { x: 1060, y: 100 },
  chips: { x: 840, y: 178 },
  cold_drinks: { x: 1204, y: 176 },
  bananas: { x: 1052, y: 278 },
  eggs: { x: 1168, y: 278 },
};

const customerPositions = [
  { x: 102, y: 252 },
  { x: 190, y: 252 },
  { x: 278, y: 252 },
  { x: 366, y: 252 },
  { x: 454, y: 252 },
];

export class ArenaStage {
  private readonly container: HTMLElement;
  private game?: Phaser.Game;
  private scene?: ArenaReplayScene;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  mount(day: ArenaReplayDay | undefined) {
    this.destroy();
    this.scene = new ArenaReplayScene(day);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.container,
      width: 1280,
      height: 360,
      backgroundColor: '#130d0a',
      scene: this.scene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });
  }

  setDay(day: ArenaReplayDay) {
    this.scene?.setDay(day);
  }

  async playDay(day: ArenaReplayDay, speed: number) {
    await this.scene?.playDay(day, speed);
  }

  setPaused(paused: boolean) {
    this.scene?.setPaused(paused);
  }

  stopReplay() {
    this.scene?.stopReplay();
  }

  destroy() {
    this.game?.destroy(true);
    this.game = undefined;
    this.scene = undefined;
  }
}

class ArenaReplayScene extends Phaser.Scene {
  private day?: ArenaReplayDay;
  private modelLabel?: Phaser.GameObjects.Text;
  private speechText?: Phaser.GameObjects.Text;
  private customerSprites: Phaser.GameObjects.Image[] = [];
  private staticObjects: Phaser.GameObjects.GameObject[] = [];
  private dayObjects: Phaser.GameObjects.GameObject[] = [];
  private transientObjects: Phaser.GameObjects.GameObject[] = [];
  private paused = false;
  private replayToken = 0;

  constructor(initialDay: ArenaReplayDay | undefined) {
    super('ArenaReplayScene');
    this.day = initialDay;
  }

  preload() {
    this.load.image('floor', floorUrl);
    this.load.image('robot', robotUrl);
    this.load.image('kiosk', kioskUrl);
    this.load.image('rack-grocery', rackGroceryUrl);
    this.load.image('rack-snacks', rackSnacksUrl);
    this.load.image('fridge', fridgeUrl);
    this.load.image('conveyor', conveyorUrl);
    this.load.image('effect-cash', effectCashUrl);
    this.load.image('effect-trust', effectTrustUrl);
    this.load.image('effect-khata', effectKhataUrl);
    this.load.image('effect-warning', effectWarningUrl);
    this.load.image('effect-reward', effectRewardUrl);
    customerUrls.forEach((url, index) => this.load.image(`customer-${index}`, url));
    Object.entries(productUrls).forEach(([productId, url]) => this.load.image(productKey(productId as ProductId), url));
  }

  create() {
    this.drawStaticStage();
    if (this.day) this.renderDayState(this.day);
  }

  setDay(day: ArenaReplayDay) {
    this.day = day;
    if (this.scene.isActive()) this.renderDayState(day);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }

  stopReplay() {
    this.replayToken += 1;
    this.setPaused(false);
    this.clearTransient();
  }

  async playDay(day: ArenaReplayDay, speed: number) {
    const token = this.replayToken + 1;
    this.replayToken = token;
    this.setPaused(false);
    this.setDay(day);
    this.clearTransient();
    this.say(`Scanning ${day.weather.toLowerCase()} demand...`);

    const events = [...day.events].sort((a, b) => a.at - b.at);
    let previousAt = 0;
    for (const event of events) {
      if (token !== this.replayToken) return;
      await this.wait(Math.max(40, event.at - previousAt) / speed, token);
      if (token !== this.replayToken) return;
      await this.handleEvent(event, speed, token);
      previousAt = event.at;
    }
  }

  private drawStaticStage() {
    this.staticObjects.forEach((object) => object.destroy());
    this.staticObjects = [];
    this.addStatic(this.add.image(640, 180, 'floor').setDisplaySize(1280, 360));
    this.addPanel(18, 12, 430, 330, '#0b2239', '#38bdf8');
    this.addPanel(470, 12, 300, 330, '#291043', '#a855f7');
    this.addPanel(790, 12, 472, 330, '#15321f', '#22c55e');
    this.addZoneLabel(60, 24, '1  CUSTOMER QUEUE', '#38bdf8');
    this.addZoneLabel(520, 24, '2  AI KIOSK', '#a855f7');
    this.addZoneLabel(900, 24, '3  RACKS + CONVEYOR', '#22c55e');
    this.addStatic(this.add.image(615, 230, 'kiosk').setDisplaySize(292, 188));
    this.addStatic(this.add.image(640, 176, 'robot').setDisplaySize(208, 234));
    this.addStatic(this.add.image(890, 142, 'rack-grocery').setDisplaySize(238, 198));
    this.addStatic(this.add.image(1088, 142, 'rack-snacks').setDisplaySize(238, 198));
    this.addStatic(this.add.image(1203, 176, 'fridge').setDisplaySize(118, 220));
    this.addStatic(this.add.image(1010, 310, 'conveyor').setDisplaySize(410, 112));
    this.addStatic(this.add.text(600, 286, 'KHATA', arenaText(18, '#fde68a')).setOrigin(0.5));
    this.addStatic(this.add.text(662, 310, 'PAYTM', arenaText(15, '#86efac')).setOrigin(0.5));
    this.modelLabel = this.add.text(640, 218, '', {
      ...arenaText(16, '#fef08a'),
      align: 'center',
    }).setOrigin(0.5);
    this.addStatic(this.modelLabel);
    this.speechText = this.add.text(640, 70, 'Ready', {
      ...arenaText(18, '#0f172a'),
      backgroundColor: '#fff7ed',
      padding: { x: 12, y: 8 },
      align: 'center',
    }).setOrigin(0.5);
    this.addStatic(this.speechText);
  }

  private renderDayState(day: ArenaReplayDay) {
    this.clearDayObjects();
    this.clearTransient();
    this.modelLabel?.setText(`MODEL:\n${shortModelLabel(day.model)}`);
    this.say(day.validationStatus === 'valid' ? 'Action valid. Ready to replay.' : 'Fallback action selected.');
    this.renderCustomers(day);
    this.renderInventory(day.inventory);
    this.renderWarnings(day);
  }

  private renderCustomers(day: ArenaReplayDay) {
    this.customerSprites = [];
    day.visits.slice(0, 5).forEach((visit, index) => {
      const position = customerPositions[index];
      const sprite = this.add.image(position.x, position.y, `customer-${index % customerUrls.length}`).setDisplaySize(82, 136);
      sprite.setAlpha(0.92);
      this.customerSprites.push(sprite);
      this.addDay(sprite);
      this.addDay(this.add.text(position.x, position.y + 84, `${index + 1}`, arenaText(16, '#f8fafc')).setOrigin(0.5));
      this.addDay(this.add.rectangle(position.x, position.y + 66, 52, 8, 0x334155, 0.9));
      this.addDay(this.add.rectangle(position.x - 14, position.y + 66, 24, 8, statusColor(visit.outcome), 1));
    });

    if (day.visits.length === 0) {
      this.addDay(this.add.text(224, 196, 'No customer visits recorded', arenaText(22, '#e2e8f0')).setOrigin(0.5));
    }
  }

  private renderInventory(inventory: ArenaInventoryTile[]) {
    inventory.forEach((tile) => {
      const position = productPositions[tile.productId];
      if (!position) return;
      const fillPct = Math.min(1, tile.closing / Math.max(1, tile.openingShelf || tile.ordered || tile.sold || 1));
      this.addDay(this.add.image(position.x, position.y - 12, productKey(tile.productId)).setDisplaySize(42, 42));
      this.addDay(this.add.text(position.x, position.y + 20, tile.name, arenaText(12, '#f8fafc')).setOrigin(0.5));
      this.addDay(this.add.text(position.x, position.y + 40, `${tile.closing} ${unitShort(tile.unit)}`, arenaText(17, '#fef3c7')).setOrigin(0.5));
      this.addDay(this.add.rectangle(position.x, position.y + 58, 70, 10, 0x1f2937, 0.94));
      this.addDay(this.add.rectangle(position.x - 35 + 35 * fillPct, position.y + 58, 70 * fillPct, 10, statusColor(tile.status), 1));
    });
  }

  private renderWarnings(day: ArenaReplayDay) {
    const misses = day.inventory.filter((tile) => tile.status === 'stockout');
    if (misses.length > 0) {
      this.addDay(this.add.image(1220, 52, 'effect-warning').setDisplaySize(40, 40));
      this.addDay(this.add.text(1182, 86, 'LOW\nSTOCK', arenaText(18, '#fef08a')).setAlign('center').setOrigin(0.5));
    }
  }

  private async handleEvent(event: ArenaReplayEvent, speed: number, token: number) {
    switch (event.type) {
      case 'ai_scanned':
        this.say(event.text ?? 'Scanning demand...');
        this.flashRobot();
        break;
      case 'customer_entered':
        this.highlightCustomer(event.customerIndex ?? 0);
        this.popup(event.text ?? 'Customer', 230, 82, event.severity ?? 'neutral');
        break;
      case 'demand_shown':
        this.demandBubble(event.customerIndex ?? 0, event.text ?? 'Demand', event.severity ?? 'neutral');
        break;
      case 'item_conveyed':
        await this.conveyItem(event, speed, token);
        break;
      case 'sale_paid':
        this.effectPopup('effect-cash', event.text ?? 'Paid', 690, 308, 'good');
        break;
      case 'khata_written':
        this.effectPopup('effect-khata', `Khata ${event.text ?? ''}`, 604, 314, 'warn');
        break;
      case 'stockout_missed':
        this.effectPopup('effect-warning', event.text ?? 'Missed', 224, 130, 'bad');
        break;
      case 'trust_changed':
        this.effectPopup('effect-trust', event.text ?? 'Trust changed', 552, 90, event.severity ?? 'neutral');
        break;
      case 'reward_updated':
        this.effectPopup('effect-reward', event.text ?? 'Reward', 640, 112, event.severity ?? 'neutral');
        break;
      case 'day_complete':
        this.say(event.text ?? 'Day complete');
        this.popup('DAY COMPLETE', 640, 326, event.severity ?? 'neutral');
        break;
    }
  }

  private async conveyItem(event: ArenaReplayEvent, speed: number, token: number) {
    if (!event.productId) return;
    const start = productPositions[event.productId] ?? { x: 1040, y: 220 };
    const item = this.add.image(start.x, start.y, productKey(event.productId)).setDisplaySize(48, 48);
    this.transientObjects.push(item);
    await this.tween(item, { x: 650, y: 310, angle: 12 }, 680 / speed, token);
    this.popup(event.text ?? 'Served', 650, 268, 'good');
    await this.wait(140 / speed, token);
    item.destroy();
  }

  private highlightCustomer(index: number) {
    this.customerSprites.forEach((sprite, customerIndex) => {
      sprite.setScale(customerIndex === index ? 0.53 : 0.46);
      sprite.setAlpha(customerIndex === index ? 1 : 0.78);
    });
  }

  private demandBubble(index: number, text: string, severity: ArenaReplayEvent['severity']) {
    const position = customerPositions[Math.min(index, customerPositions.length - 1)] ?? customerPositions[0];
    const bubble = this.add.container(position.x, position.y - 122);
    const width = Math.max(96, Math.min(170, text.length * 6));
    const background = this.add.rectangle(0, 0, width, 54, 0xfffbeb, 0.97).setStrokeStyle(2, statusColor(severity ?? 'neutral'));
    const label = this.add.text(0, 0, text, {
      ...arenaText(13, '#111827'),
      align: 'center',
      wordWrap: { width: width - 14 },
    }).setOrigin(0.5);
    bubble.add([background, label]);
    this.transientObjects.push(bubble);
    this.tweens.add({
      targets: bubble,
      y: bubble.y - 10,
      alpha: 0,
      delay: 920,
      duration: 420,
      onComplete: () => bubble.destroy(),
    });
  }

  private popup(text: string, x: number, y: number, severity: ArenaReplayEvent['severity']) {
    const label = this.add.text(x, y, text, {
      ...arenaText(22, popupColor(severity)),
      backgroundColor: '#020617',
      padding: { x: 12, y: 8 },
    }).setOrigin(0.5);
    this.transientObjects.push(label);
    this.tweens.add({
      targets: label,
      y: y - 28,
      alpha: 0,
      duration: 900,
      onComplete: () => label.destroy(),
    });
  }

  private effectPopup(iconKey: string, text: string, x: number, y: number, severity: ArenaReplayEvent['severity']) {
    const icon = this.add.image(x - 54, y, iconKey).setDisplaySize(34, 34);
    const label = this.add.text(x, y, text, {
      ...arenaText(18, popupColor(severity)),
      backgroundColor: '#06111f',
      padding: { x: 10, y: 7 },
    }).setOrigin(0, 0.5);
    this.transientObjects.push(icon, label);
    this.tweens.add({
      targets: [icon, label],
      y: y - 30,
      alpha: 0,
      duration: 980,
      onComplete: () => {
        icon.destroy();
        label.destroy();
      },
    });
  }

  private flashRobot() {
    const glow = this.add.circle(640, 176, 96, 0x38bdf8, 0.18);
    this.transientObjects.push(glow);
    this.tweens.add({
      targets: glow,
      scale: 1.4,
      alpha: 0,
      duration: 700,
      onComplete: () => glow.destroy(),
    });
  }

  private say(text: string) {
    this.speechText?.setText(text);
  }

  private addPanel(x: number, y: number, w: number, h: number, fill: string, stroke: string) {
    const panel = this.add.graphics();
    panel.fillStyle(Number.parseInt(fill.slice(1), 16), 0.56);
    panel.fillRoundedRect(x, y, w, h, 16);
    panel.lineStyle(2, Number.parseInt(stroke.slice(1), 16), 0.85);
    panel.strokeRoundedRect(x, y, w, h, 16);
    this.addStatic(panel);
  }

  private addZoneLabel(x: number, y: number, text: string, color: string) {
    const label = this.add.text(x, y, text, {
      ...arenaText(22, '#ffffff'),
      backgroundColor: '#0f172a',
      padding: { x: 14, y: 8 },
    });
    label.setStroke(color, 4);
    this.addStatic(label);
  }

  private async tween(
    target: Phaser.GameObjects.GameObject,
    props: { x?: number; y?: number; angle?: number },
    duration: number,
    token: number
  ) {
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: target,
        x: props.x,
        y: props.y,
        angle: props.angle,
        ease: 'Cubic.easeInOut',
        duration,
        onComplete: () => resolve(),
      });
    });
    if (this.replayToken !== token) target.destroy();
  }

  private async wait(ms: number, token: number) {
    const start = performance.now();
    while (performance.now() - start < ms) {
      if (this.replayToken !== token) return;
      if (!this.paused) await sleep(40);
      else await sleep(80);
    }
  }

  private addStatic(object: Phaser.GameObjects.GameObject) {
    this.staticObjects.push(object);
    return object;
  }

  private addDay(object: Phaser.GameObjects.GameObject) {
    this.dayObjects.push(object);
    return object;
  }

  private clearDayObjects() {
    this.dayObjects.forEach((object) => object.destroy());
    this.dayObjects = [];
    this.customerSprites = [];
  }

  private clearTransient() {
    this.transientObjects.forEach((object) => object.destroy());
    this.transientObjects = [];
  }
}

function productKey(productId: ProductId) {
  return `product-${productId}`;
}

function arenaText(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
    fontSize: `${size}px`,
    fontStyle: '700',
    color,
  };
}

function statusColor(status: string) {
  if (status === 'good' || status === 'fulfilled') return 0x22c55e;
  if (status === 'low' || status === 'partial' || status === 'warn') return 0xf59e0b;
  if (status === 'stockout' || status === 'missed' || status === 'bad') return 0xef4444;
  return 0x38bdf8;
}

function popupColor(severity: ArenaReplayEvent['severity']) {
  if (severity === 'good') return '#86efac';
  if (severity === 'warn') return '#fcd34d';
  if (severity === 'bad') return '#fca5a5';
  return '#bae6fd';
}

function shortModelLabel(model: string) {
  const lastPart = model.split('/').pop() ?? model;
  return lastPart.replace(/-/g, ' ').slice(0, 16).toUpperCase();
}

function unitShort(unit: string) {
  const map: Record<string, string> = {
    bottles: 'bt',
    packets: 'pk',
    packs: 'pk',
  };
  return map[unit] ?? unit;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
