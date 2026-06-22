import * as Phaser from 'phaser';
import type { ProductId } from '../types';
import type { ArenaInventoryTile, ArenaReplayDay, ArenaReplayEvent } from './arena-types';

import stageBackdropUrl from '../assets/arena/stage-backdrop.png';
import robotUrl from '../assets/arena/robot-shopkeeper.png';
import customerStudentUrl from '../assets/arena/customer-student.png';
import customerRegularUrl from '../assets/arena/customer-regular.png';
import customerTeenUrl from '../assets/arena/customer-teen.png';
import customerElderUrl from '../assets/arena/customer-elder.png';
import customerFamilyUrl from '../assets/arena/customer-family.png';
import effectCashUrl from '../assets/arena/effect-cash.png';
import effectTrustUrl from '../assets/arena/effect-trust.png';
import effectKhataUrl from '../assets/arena/effect-khata.png';
import effectWarningUrl from '../assets/arena/effect-warning.png';
import effectRewardUrl from '../assets/arena/effect-reward.png';
import phaseMorningUrl from '../assets/arena/phase-morning.png';
import phaseAfternoonUrl from '../assets/arena/phase-afternoon.png';
import phaseEveningUrl from '../assets/arena/phase-evening.png';
import dayStartPanelUrl from '../assets/arena/day-start-panel.png';
import dayCompletePanelUrl from '../assets/arena/day-complete-panel.png';
import customerJholaFullUrl from '../assets/arena/customer-jhola-full.png';
import scoreBurstGoodUrl from '../assets/arena/score-burst-good.png';
import scoreBurstBadUrl from '../assets/arena/score-burst-bad.png';

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
  milk: { x: 1060, y: 126 },
  bread: { x: 1206, y: 128 },
  maggi: { x: 1348, y: 122 },
  chips: { x: 1358, y: 186 },
  cold_drinks: { x: 1498, y: 172 },
  bananas: { x: 1426, y: 308 },
  eggs: { x: 1514, y: 308 },
};

const customerPositions = [
  { x: 248, y: 272 },
  { x: 336, y: 272 },
  { x: 424, y: 272 },
  { x: 512, y: 272 },
  { x: 600, y: 272 },
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
      width: 1600,
      height: 390,
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
  private phaseOverlay?: Phaser.GameObjects.Image;
  private customerSprites: Phaser.GameObjects.Image[] = [];
  private activeCustomerSprites = new Map<number, Phaser.GameObjects.Image>();
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
    this.load.image('stage-backdrop', stageBackdropUrl);
    this.load.image('robot', robotUrl);
    this.load.image('effect-cash', effectCashUrl);
    this.load.image('effect-trust', effectTrustUrl);
    this.load.image('effect-khata', effectKhataUrl);
    this.load.image('effect-warning', effectWarningUrl);
    this.load.image('effect-reward', effectRewardUrl);
    this.load.image('phase-morning', phaseMorningUrl);
    this.load.image('phase-afternoon', phaseAfternoonUrl);
    this.load.image('phase-evening', phaseEveningUrl);
    this.load.image('day-start-panel', dayStartPanelUrl);
    this.load.image('day-complete-panel', dayCompletePanelUrl);
    this.load.image('customer-jhola-full', customerJholaFullUrl);
    this.load.image('score-burst-good', scoreBurstGoodUrl);
    this.load.image('score-burst-bad', scoreBurstBadUrl);
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
    this.addStatic(this.add.image(800, 195, 'stage-backdrop').setDisplaySize(1600, 390));
    this.phaseOverlay = this.add.image(800, 195, 'phase-morning').setDisplaySize(1600, 390).setAlpha(0.2);
    this.addStatic(this.phaseOverlay);
    this.addStatic(this.add.image(800, 205, 'robot').setDisplaySize(190, 228));
    this.modelLabel = this.add.text(800, 244, '', {
      ...arenaText(13, '#fef08a'),
      align: 'center',
    }).setOrigin(0.5);
    this.addStatic(this.modelLabel);
  }

  private renderDayState(day: ArenaReplayDay) {
    this.clearDayObjects();
    this.clearTransient();
    this.modelLabel?.setText(shortModelLabel(day.model));
    this.phaseOverlay?.setTexture('phase-morning').setAlpha(0.2);
    this.renderCustomers(day);
    this.renderInventory(day.inventory);
    this.renderWarnings(day);
  }

  private renderCustomers(day: ArenaReplayDay) {
    this.customerSprites = [];
    this.activeCustomerSprites.clear();

    if (day.visits.length === 0) {
      this.popup('No customer visits', 240, 210, 'neutral');
    }
  }

  private renderInventory(inventory: ArenaInventoryTile[]) {
    inventory.forEach((tile) => {
      const position = productPositions[tile.productId];
      if (!position) return;
      if (tile.status === 'stockout') {
        this.addDay(this.add.image(position.x + 30, position.y - 24, 'effect-warning').setDisplaySize(30, 30));
      } else if (tile.status === 'low') {
        this.addDay(this.add.circle(position.x + 32, position.y - 24, 9, 0xf59e0b, 0.92));
      }
    });
  }

  private renderWarnings(day: ArenaReplayDay) {
    const misses = day.inventory.filter((tile) => tile.status === 'stockout');
    if (misses.length > 0) {
      this.addDay(this.add.image(1550, 54, 'effect-warning').setDisplaySize(48, 48));
    }
  }

  private async handleEvent(event: ArenaReplayEvent, speed: number, token: number) {
    switch (event.type) {
      case 'day_started':
        this.showDayStart();
        break;
      case 'day_phase':
        this.setPhase(event.phase ?? 'morning', event.text ?? 'Day phase');
        break;
      case 'ai_scanned':
        this.flashRobot();
        this.popup('Scanning', 800, 86, 'neutral');
        break;
      case 'customer_entered':
        await this.enterCustomer(event, speed, token);
        break;
      case 'demand_shown':
        this.demandBubble(event.customerIndex ?? 0, event.text ?? 'Demand', event.severity ?? 'neutral');
        break;
      case 'item_conveyed':
        await this.conveyItem(event, speed, token);
        break;
      case 'sale_paid':
        this.effectPopup('effect-cash', event.text ?? 'Paid', 858, 318, 'good');
        break;
      case 'khata_written':
        this.effectPopup('effect-khata', `Khata ${event.text ?? ''}`, 740, 320, 'warn');
        break;
      case 'stockout_missed':
        this.effectPopup('effect-warning', event.text ?? 'Missed', 374, 130, 'bad');
        break;
      case 'trust_changed':
        this.effectPopup('effect-trust', event.text ?? 'Trust changed', 690, 92, event.severity ?? 'neutral');
        break;
      case 'customer_exited':
        await this.exitCustomer(event, speed, token);
        break;
      case 'reward_updated':
        this.effectPopup('effect-reward', event.text ?? 'Reward', 800, 106, event.severity ?? 'neutral');
        break;
      case 'day_complete':
        this.showDayComplete(event);
        break;
    }
  }

  private showDayStart() {
    if (!this.day) return;
    const panel = this.add.container(800, 194).setAlpha(0).setDepth(60);
    this.addCeremonyBacking(panel);
    panel.add(this.add.image(0, 0, 'day-start-panel').setDisplaySize(680, 188).setAlpha(0.55));
    panel.add(this.add.text(0, -44, `DAY ${this.day.day.toString().padStart(2, '0')} BEGINS`, ceremonyText(30, '#ffffff')).setOrigin(0.5));
    panel.add(this.add.text(0, -4, `${this.day.weather} · ${this.day.eventLabel}`, ceremonyText(18, '#dff6ff')).setOrigin(0.5));
    panel.add(this.add.text(0, 36, 'AI reads signals, plans stock, then customers arrive.', ceremonyText(15, '#fff3b0')).setOrigin(0.5));
    this.transientObjects.push(panel);
    this.tweens.add({
      targets: panel,
      alpha: 1,
      y: 186,
      duration: 260,
      ease: 'Sine.easeOut',
    });
    this.time.delayedCall(1150, () => {
      if (!panel.active) return;
      this.tweens.add({
        targets: panel,
        alpha: 0,
        y: 176,
        duration: 220,
        ease: 'Sine.easeIn',
        onComplete: () => panel.destroy(),
      });
    });
  }

  private showDayComplete(event: ArenaReplayEvent) {
    if (!this.day) return;
    const good = (event.severity ?? 'neutral') !== 'bad' && this.day.lastReward >= 0;
    const panel = this.add.container(800, 194).setAlpha(0).setDepth(60);
    this.addCeremonyBacking(panel);
    panel.add(this.add.image(0, 0, 'day-complete-panel').setDisplaySize(680, 188).setAlpha(0.55));
    panel.add(this.add.image(-250, -6, good ? 'score-burst-good' : 'score-burst-bad').setDisplaySize(112, 112));
    panel.add(this.add.text(0, -48, 'DAY COMPLETE', ceremonyText(30, '#ffffff')).setOrigin(0.5));
    panel.add(this.add.text(0, -6, `Reward ${signedNumber(this.day.lastReward)} · Profit ${moneyText(this.day.metrics.profit)}`, ceremonyText(20, good ? '#b7ffc8' : '#ffc4c4')).setOrigin(0.5));
    panel.add(this.add.text(0, 36, `${this.day.metrics.visits} visits · ${this.day.metrics.soldUnits} sold · ${this.day.metrics.missedUnits} missed`, ceremonyText(15, '#dbeafe')).setOrigin(0.5));
    this.transientObjects.push(panel);
    this.tweens.add({
      targets: panel,
      alpha: 1,
      scale: 1.03,
      duration: 320,
      ease: 'Back.easeOut',
    });
    this.time.delayedCall(3400, () => {
      if (!panel.active) return;
      this.tweens.add({
        targets: panel,
        alpha: 0,
        scale: 0.98,
        duration: 260,
        ease: 'Sine.easeIn',
        onComplete: () => panel.destroy(),
      });
    });
  }

  private addCeremonyBacking(panel: Phaser.GameObjects.Container) {
    panel.add(this.add.rectangle(0, 0, 724, 214, 0x020817, 0.92)
      .setStrokeStyle(3, 0xf5c451, 0.72));
    panel.add(this.add.rectangle(0, 0, 686, 170, 0x07182b, 0.88)
      .setStrokeStyle(1, 0x38bdf8, 0.45));
  }

  private setPhase(phase: NonNullable<ArenaReplayEvent['phase']>, label: string) {
    if (!this.phaseOverlay) return;
    this.phaseOverlay.setTexture(`phase-${phase}`);
    this.tweens.add({
      targets: this.phaseOverlay,
      alpha: phase === 'evening' ? 0.42 : phase === 'afternoon' ? 0.25 : 0.2,
      duration: 460,
      ease: 'Sine.easeInOut',
    });
    const x = phase === 'morning' ? 308 : phase === 'afternoon' ? 800 : 1290;
    this.popup(label, x, 88, 'neutral');
  }

  private async enterCustomer(event: ArenaReplayEvent, speed: number, token: number) {
    const index = event.customerIndex ?? 0;
    const position = this.customerPositionForIndex(index);
    this.activeCustomerSprites.get(index)?.destroy();
    const sprite = this.add.image(124, position.y + 10, `customer-${index % customerUrls.length}`).setDisplaySize(82, 136).setAlpha(0);
    this.customerSprites.push(sprite);
    this.activeCustomerSprites.set(index, sprite);
    this.addDay(sprite);
    const divisor = animationDivisor(speed);
    await this.tween(sprite, { x: position.x, y: position.y, alpha: 0.94 }, 420 / divisor, token);
    this.highlightCustomer(index);
    this.popup(event.customerName ?? 'Customer', position.x, 92, event.severity ?? 'neutral');
  }

  private async exitCustomer(event: ArenaReplayEvent, speed: number, token: number) {
    const index = event.customerIndex ?? 0;
    const sprite = this.activeCustomerSprites.get(index);
    if (!sprite) return;

    const exitTargets: Phaser.GameObjects.GameObject[] = [sprite];
    let bag: Phaser.GameObjects.Image | undefined;
    if (event.severity === 'good' || event.severity === 'warn') {
      bag = this.add.image(sprite.x + 34, sprite.y + 48, 'customer-jhola-full').setDisplaySize(42, 42).setAlpha(0.96);
      this.transientObjects.push(bag);
      exitTargets.push(bag);
      this.popup(event.text ?? 'Bag filled', sprite.x, sprite.y - 92, event.severity ?? 'good');
    } else {
      this.effectPopup('effect-warning', event.text ?? 'Missed', sprite.x + 10, sprite.y - 92, 'bad');
    }

    const divisor = animationDivisor(speed);
    await this.tween(exitTargets, { x: 86, alpha: 0 }, 520 / divisor, token);
    sprite.destroy();
    bag?.destroy();
    this.activeCustomerSprites.delete(index);
  }

  private async conveyItem(event: ArenaReplayEvent, speed: number, token: number) {
    if (!event.productId) return;
    const start = productPositions[event.productId] ?? { x: 1040, y: 220 };
    const item = this.add.image(start.x, start.y, productKey(event.productId)).setDisplaySize(48, 48);
    this.transientObjects.push(item);
    const divisor = animationDivisor(speed);
    await this.tween(item, { x: 1220, y: 302, angle: 8 }, 420 / divisor, token);
    await this.tween(item, { x: 852, y: 318, angle: -8 }, 660 / divisor, token);
    this.popup(event.text ?? 'Served', 824, 286, 'good');
    await this.wait(160 / divisor, token);
    item.destroy();
  }

  private highlightCustomer(index: number) {
    this.activeCustomerSprites.forEach((sprite, customerIndex) => {
      const active = customerIndex === index;
      const position = this.customerPositionForIndex(customerIndex);
      sprite.setDisplaySize(active ? 104 : 90, active ? 172 : 150);
      sprite.setAlpha(customerIndex === index ? 1 : 0.78);
      if (position) {
        this.tweens.add({
          targets: sprite,
          x: active ? position.x + 10 : position.x,
          y: active ? position.y - 8 : position.y,
          duration: 220,
          ease: 'Sine.easeOut',
        });
      }
    });
  }

  private demandBubble(index: number, text: string, severity: ArenaReplayEvent['severity']) {
    const sprite = this.activeCustomerSprites.get(index);
    const position = sprite ? { x: sprite.x, y: sprite.y } : this.customerPositionForIndex(index);
    const visit = this.day?.visits[index];
    const lines = visit?.requested.slice(0, 4) ?? [];
    const bubble = this.add.container(position.x, position.y - 126);
    const width = Math.max(74, lines.length * 48 + 20);
    const background = this.add.rectangle(0, 0, width, 60, 0xfffbeb, 0.98).setStrokeStyle(2, statusColor(severity ?? 'neutral'));
    bubble.add(background);
    if (lines.length === 0) {
      bubble.add(this.add.text(0, 0, text, arenaText(13, '#111827')).setOrigin(0.5));
    } else {
      lines.forEach((line, lineIndex) => {
        const x = -width / 2 + 26 + lineIndex * 48;
        bubble.add(this.add.image(x, -4, productKey(line.productId)).setDisplaySize(32, 32));
        bubble.add(this.add.text(x + 14, 16, `${line.quantity}`, arenaText(13, '#111827')).setOrigin(0.5));
      });
    }
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
      ...arenaText(18, popupColor(severity)),
      backgroundColor: 'rgba(2,6,23,0.82)',
      padding: { x: 10, y: 7 },
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
    const icon = this.add.image(x - 44, y, iconKey).setDisplaySize(32, 32);
    const label = this.add.text(x, y, text, {
      ...arenaText(16, popupColor(severity)),
      backgroundColor: 'rgba(6,17,31,0.86)',
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
    const glow = this.add.circle(800, 200, 106, 0x38bdf8, 0.16);
    this.transientObjects.push(glow);
    this.tweens.add({
      targets: glow,
      scale: 1.4,
      alpha: 0,
      duration: 700,
      onComplete: () => glow.destroy(),
    });
  }

  private async tween(
    target: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
    props: { x?: number; y?: number; angle?: number; alpha?: number; scale?: number },
    duration: number,
    token: number
  ) {
    const tweenProps = Object.fromEntries(
      Object.entries(props).filter(([, value]) => value !== undefined)
    ) as typeof props;
    await new Promise<void>((resolve) => {
      this.tweens.add({
        targets: target,
        ...tweenProps,
        ease: 'Cubic.easeInOut',
        duration,
        onComplete: () => resolve(),
      });
    });
    if (this.replayToken !== token) {
      const targets = Array.isArray(target) ? target : [target];
      targets.forEach((item) => item.destroy());
    }
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
    this.activeCustomerSprites.clear();
  }

  private clearTransient() {
    this.transientObjects.forEach((object) => object.destroy());
    this.transientObjects = [];
  }

  private customerPositionForIndex(index: number) {
    const slot = customerPositions.length - 1 - (index % customerPositions.length);
    return customerPositions[slot] ?? customerPositions[customerPositions.length - 1];
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

function ceremonyText(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    ...arenaText(size, color),
    stroke: '#020617',
    strokeThickness: Math.max(4, Math.round(size / 6)),
    shadow: {
      offsetX: 0,
      offsetY: 3,
      color: '#000000',
      blur: 4,
      stroke: true,
      fill: true,
    },
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

function animationDivisor(speed: number) {
  return Math.max(1, Math.sqrt(speed));
}

function signedNumber(value: number) {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

function moneyText(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
