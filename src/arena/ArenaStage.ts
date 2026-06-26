import * as Phaser from 'phaser';
import type { ProductId } from '../types';
import type { ArenaInventoryTile, ArenaLiveMetrics, ArenaReplayDay, ArenaReplayEvent } from './arena-types';
import {
  conveyPath,
  getArenaStageLayout,
  type ArenaStageMode,
  type StageLayout,
} from './arena-stage-layout';

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
import effectCustomersUrl from '../assets/arena/effect-customers.png';
import phaseMorningUrl from '../assets/arena/phase-morning.png';
import phaseAfternoonUrl from '../assets/arena/phase-afternoon.png';
import phaseEveningUrl from '../assets/arena/phase-evening.png';
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

const DEPTH = {
  customer: 18,
  itemTransit: 26,
  thoughtBubble: 34,
  itemBurst: 28,
  planningHud: 48,
  liveHud: 55,
  ceremony: 60,
} as const;

interface ThoughtBubbleItem {
  plate: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  qtyText: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  requested: number;
  served: number;
  missed: number;
}

interface CustomerThoughtBubble {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  tail: Phaser.GameObjects.Triangle;
  headerText: Phaser.GameObjects.Text;
  feedbackBar: Phaser.GameObjects.Rectangle;
  feedbackText: Phaser.GameObjects.Text;
  feedbackIcon: Phaser.GameObjects.Image | null;
  items: Map<ProductId, ThoughtBubbleItem>;
  width: number;
  height: number;
}

export class ArenaStage {
  private readonly container: HTMLElement;
  private readonly onLiveMetrics?: (metrics: ArenaLiveMetrics) => void;
  private game?: Phaser.Game;
  private scene?: ArenaReplayScene;
  private mode: ArenaStageMode = 'desktop';

  constructor(container: HTMLElement, onLiveMetrics?: (metrics: ArenaLiveMetrics) => void) {
    this.container = container;
    this.onLiveMetrics = onLiveMetrics;
  }

  getStageMode() {
    return this.mode;
  }

  mount(day: ArenaReplayDay | undefined, mode: ArenaStageMode = 'desktop') {
    this.destroy();
    this.mode = mode;
    const layout = getArenaStageLayout(mode);
    this.scene = new ArenaReplayScene(day, layout, this.onLiveMetrics);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.container,
      width: layout.width,
      height: layout.height,
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

  refreshScale() {
    this.game?.scale.refresh();
  }

  destroy() {
    this.game?.destroy(true);
    this.game = undefined;
    this.scene = undefined;
  }
}

class ArenaReplayScene extends Phaser.Scene {
  private readonly layout: StageLayout;
  private readonly onLiveMetrics?: (metrics: ArenaLiveMetrics) => void;
  private day?: ArenaReplayDay;
  private modelLabel?: Phaser.GameObjects.Text;
  private phaseOverlay?: Phaser.GameObjects.Image;
  private liveStatusPanel?: Phaser.GameObjects.Container;
  private liveStatusTitle?: Phaser.GameObjects.Text;
  private liveStatusDetail?: Phaser.GameObjects.Text;
  private customerSprites: Phaser.GameObjects.Image[] = [];
  private activeCustomerSprites = new Map<number, Phaser.GameObjects.Image>();
  private thoughtBubbles = new Map<number, CustomerThoughtBubble>();
  private staticObjects: Phaser.GameObjects.GameObject[] = [];
  private dayObjects: Phaser.GameObjects.GameObject[] = [];
  private transientObjects: Phaser.GameObjects.GameObject[] = [];
  private planningObjects: Phaser.GameObjects.GameObject[] = [];
  private planningPanel?: Phaser.GameObjects.Container;
  private planningRows: Phaser.GameObjects.Container[] = [];
  private robotPlanningThought?: Phaser.GameObjects.Container;
  private paused = false;
  private replayToken = 0;

  constructor(
    initialDay: ArenaReplayDay | undefined,
    layout: StageLayout,
    onLiveMetrics?: (metrics: ArenaLiveMetrics) => void,
  ) {
    super('ArenaReplayScene');
    this.day = initialDay;
    this.layout = layout;
    this.onLiveMetrics = onLiveMetrics;
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
    this.load.image('day-complete-panel', dayCompletePanelUrl);
    this.load.image('customer-jhola-full', customerJholaFullUrl);
    this.load.image('score-burst-good', scoreBurstGoodUrl);
    this.load.image('score-burst-bad', scoreBurstBadUrl);
    this.load.image('effect-customers', effectCustomersUrl);
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
    this.clearThoughtBubbles();
  }

  async playDay(day: ArenaReplayDay, speed: number) {
    const token = this.replayToken + 1;
    this.replayToken = token;
    this.setPaused(false);
    this.setDay(day);
    this.clearTransient();

    const playbackSpeed = playbackSpeedMultiplier(speed);
    const events = [...day.events].sort((a, b) => a.at - b.at);
    let previousAt = 0;
    for (const event of events) {
      if (token !== this.replayToken) return;
      await this.wait(Math.max(40, event.at - previousAt) / playbackSpeed, token);
      if (token !== this.replayToken) return;
      await this.handleEvent(event, speed, token);
      previousAt = event.at;
    }
  }

  private drawStaticStage() {
    this.staticObjects.forEach((object) => object.destroy());
    this.staticObjects = [];
    this.drawStageExtensionBands();
    this.addStatic(this.add.image(this.layout.width / 2, this.layout.backdropCenterY, 'stage-backdrop')
      .setDisplaySize(this.layout.width, this.layout.backdropHeight));
    this.phaseOverlay = this.add.image(this.layout.width / 2, this.layout.backdropCenterY, 'phase-morning')
      .setDisplaySize(this.layout.width, this.layout.backdropHeight)
      .setAlpha(0.2);
    this.addStatic(this.phaseOverlay);
    this.addStatic(this.add.image(this.layout.robotCenter.x, this.layout.robotCenter.y, 'robot')
      .setDisplaySize(this.layout.robotSize.w, this.layout.robotSize.h));
    this.addStatic(this.add.rectangle(
      this.layout.conveyorBar.x,
      this.layout.conveyorLaneY,
      this.layout.conveyorBar.width,
      8,
      0x1e293b,
      0.85,
    ).setStrokeStyle(1, 0x475569, 0.8));
    this.addStatic(this.add.rectangle(
      this.layout.conveyorBar.x,
      this.layout.conveyorLaneY,
      this.layout.conveyorBar.width - 40,
      2,
      0x334155,
      0.5,
    ));
    this.modelLabel = this.add.text(this.layout.robotCenter.x, this.layout.robotCenter.y + 44, '', {
      ...arenaText(this.layout.mode === 'mobile-portrait' ? 13 : 16, '#fef08a'),
      align: 'center',
    }).setOrigin(0.5);
    this.addStatic(this.modelLabel);
    this.createLiveStatusPanel();
  }

  private drawStageExtensionBands() {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x120a1f, 0x120a1f, 0x1c1230, 0x1c1230, 1);
    sky.fillRect(0, 0, this.layout.width, this.layout.padTop);
    sky.fillStyle(0xf5c451, 0.08);
    sky.fillRect(0, this.layout.padTop - 10, this.layout.width, 10);
    this.addStatic(sky);

    const signWidth = this.layout.mode === 'mobile-portrait' ? 260 : 360;
    const sign = this.add.rectangle(this.layout.width / 2, 34, signWidth, 42, 0x0f172a, 0.88)
      .setStrokeStyle(2, 0xf5c451, 0.65);
    this.addStatic(sign);
    this.addStatic(this.add.text(this.layout.width / 2, 34, 'SHREE SHYAM BHANDAR', {
      ...arenaText(this.layout.mode === 'mobile-portrait' ? 13 : 15, '#fef08a'),
      align: 'center',
    }).setOrigin(0.5));
    this.addStatic(this.add.text(this.layout.width / 2, 54, 'Nehru Colony School Road', {
      ...arenaText(this.layout.mode === 'mobile-portrait' ? 9 : 11, '#94a3b8'),
      align: 'center',
      fontStyle: '500',
    }).setOrigin(0.5));

    const lightXs = this.layout.mode === 'mobile-portrait'
      ? [this.layout.width * 0.22, this.layout.width * 0.5, this.layout.width * 0.78]
      : [220, 480, 800, 1120, 1380];
    lightXs.forEach((x) => {
      const cord = this.add.rectangle(x, 18, 2, 22, 0x475569, 0.8);
      const shade = this.add.ellipse(x, 42, 28, 14, 0xfef3c7, 0.22);
      const glow = this.add.circle(x, 46, 10, 0xfbbf24, 0.18);
      this.addStatic(cord);
      this.addStatic(shade);
      this.addStatic(glow);
    });

    const floorTop = this.layout.padTop + this.layout.backdropHeight;
    const floor = this.add.graphics();
    floor.fillGradientStyle(0x1a1410, 0x1a1410, 0x0d0907, 0x0d0907, 1);
    floor.fillRect(0, floorTop, this.layout.width, this.layout.padBottom);
    for (let tileX = 0; tileX < this.layout.width; tileX += 64) {
      const shade = (tileX / 64) % 2 === 0 ? 0x241c16 : 0x1c1510;
      floor.fillStyle(shade, 0.55);
      floor.fillRect(tileX, floorTop + 8, 64, 34);
    }
    floor.fillStyle(0x334155, 0.35);
    floor.fillRect(0, this.layout.height - 18, this.layout.width, 18);
    this.addStatic(floor);

    const matX = this.layout.mode === 'mobile-portrait' ? this.layout.width * 0.5 : 118;
    const mat = this.add.rectangle(matX, floorTop + 42, 96, 28, 0x7c2d12, 0.82)
      .setStrokeStyle(2, 0xfbbf24, 0.45);
    this.addStatic(mat);
    this.addStatic(this.add.text(matX, floorTop + 42, 'WELCOME', {
      ...arenaText(10, '#fde68a'),
      align: 'center',
      fontStyle: '700',
    }).setOrigin(0.5));

    const crateStack = this.layout.mode === 'mobile-portrait'
      ? [
        { x: this.layout.restockStartX - 8, y: floorTop + 30, w: 30, h: 24 },
        { x: this.layout.restockStartX + 20, y: floorTop + 24, w: 26, h: 20 },
        { x: this.layout.restockStartX + 6, y: floorTop + 8, w: 22, h: 18 },
      ]
      : [
        { x: 54, y: floorTop + 30, w: 34, h: 28 },
        { x: 88, y: floorTop + 24, w: 30, h: 24 },
        { x: 72, y: floorTop + 8, w: 26, h: 22 },
      ];
    crateStack.forEach((crate, index) => {
      const color = index === 0 ? 0x92400e : index === 1 ? 0xb45309 : 0x78350f;
      this.addStatic(this.add.rectangle(crate.x, crate.y, crate.w, crate.h, color, 0.92)
        .setStrokeStyle(1, 0xfde68a, 0.35));
    });
    this.addStatic(this.add.text(crateStack[1].x, floorTop + 56, 'Supplier drop', {
      ...arenaText(10, '#cbd5e1'),
      align: 'center',
      fontStyle: '500',
    }).setOrigin(0.5));
  }

  private renderDayState(day: ArenaReplayDay) {
    this.clearDayObjects();
    this.clearTransient();
    this.modelLabel?.setText(shortModelLabel(day.model));
    this.phaseOverlay?.setTexture('phase-morning').setAlpha(0.2);
    this.updateLiveStatus(day, 'READY', 'Plan loaded', false);
    this.renderCustomers(day);
    this.renderInventory(day.inventory);
    this.renderWarnings(day);
  }

  private renderCustomers(day: ArenaReplayDay) {
    this.customerSprites = [];
    this.activeCustomerSprites.clear();

    if (day.visits.length === 0) {
      this.popup('No customer visits', this.layout.robotCenter.x, this.layout.robotCenter.y - 40, 'neutral');
    }
  }

  private renderInventory(inventory: ArenaInventoryTile[]) {
    inventory.forEach((tile) => {
      const position = this.layout.productPositions[tile.productId];
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
      this.addDay(this.add.image(this.layout.stockWarning.x, this.layout.stockWarning.y, 'effect-warning')
        .setDisplaySize(this.layout.mode === 'mobile-portrait' ? 34 : 42, this.layout.mode === 'mobile-portrait' ? 34 : 42));
    }
  }

  private async handleEvent(event: ArenaReplayEvent, speed: number, token: number) {
    switch (event.type) {
      case 'day_started':
        this.emitLiveMetrics(event.liveMetrics);
        this.updateLiveStatus(this.day, 'LIVE', 'Day opening', true);
        break;
      case 'day_phase':
        this.setPhase(event.phase ?? 'morning', event.text ?? 'Day phase');
        break;
      case 'ai_scanned':
        this.flashRobot();
        this.popup('Scanning', this.layout.robotCenter.x, this.layout.padTop + 18, 'neutral');
        break;
      case 'ai_planning_start':
        this.showPlanningPanel();
        this.updateLiveStatus(this.day, 'LIVE', 'AI planning day', true);
        this.popup(event.text ?? 'Planning day', this.layout.robotCenter.x, this.layout.padTop + 18, 'neutral');
        break;
      case 'ai_env_review':
        this.addPlanningRow(event.text ?? 'Reviewing', event.severity ?? 'neutral');
        if (event.productId) this.pulseProductOnShelf(event.productId);
        this.flashRobot();
        break;
      case 'ai_thinking':
        this.showRobotPlanningThought(event.text ?? 'Thinking…');
        this.updateLiveStatus(this.day, 'LIVE', 'Weighing stock & marketing', true);
        break;
      case 'ai_plan_ready':
        this.hideRobotPlanningThought();
        this.updateLiveStatus(this.day, 'LIVE', 'Plan locked', true);
        this.popup(event.text ?? 'Plan locked', this.layout.robotCenter.x, this.layout.padTop + 18, 'good');
        this.time.delayedCall(420, () => this.fadePlanningPanel());
        break;
      case 'ai_restock_order':
        if (event.productId) {
          this.animateRestockOrder(event.productId, event.quantity ?? 0);
          this.updateLiveStatus(
            this.day,
            'LIVE',
            compactStageText(event.text ?? `Order ${event.productName ?? 'stock'}`, 42),
            true
          );
        }
        break;
      case 'ai_marketing_launch':
        this.animateMarketingLaunch(event.text ?? 'Campaign');
        this.updateLiveStatus(
          this.day,
          'LIVE',
          compactStageText(`Marketing · ${event.text ?? 'Campaign'}`, 42),
          true
        );
        break;
      case 'customer_entered':
        this.clearPlanningHud();
        await this.enterCustomer(event, speed, token);
        break;
      case 'demand_shown':
        this.showThoughtBubble(
          event.customerIndex ?? 0,
          event.customerName ?? 'Customer',
          event.text ?? 'Demand',
          event.severity ?? 'neutral'
        );
        break;
      case 'item_conveyed':
        await this.conveyItem(event, speed, token);
        break;
      case 'sale_paid':
        this.setThoughtFeedback(event.customerIndex ?? 0, `Paid ${event.text ?? ''}`, 'good', 'effect-cash');
        break;
      case 'khata_written':
        this.setThoughtFeedback(event.customerIndex ?? 0, `Khata ${event.text ?? ''}`, 'warn', 'effect-khata');
        break;
      case 'stockout_missed':
        this.markThoughtItem(event.customerIndex ?? 0, event.productId, 'missed', event.quantity);
        this.setThoughtFeedback(event.customerIndex ?? 0, missedLabel(event), 'bad', 'effect-warning');
        break;
      case 'trust_changed':
        this.setThoughtFeedback(event.customerIndex ?? 0, trustReaction(event), event.severity ?? 'neutral', 'effect-trust');
        break;
      case 'customer_exited':
        await this.exitCustomer(event, speed, token);
        break;
      case 'metrics_changed':
        this.emitLiveMetrics(event.liveMetrics);
        break;
      case 'reward_updated':
        this.emitLiveMetrics(event.liveMetrics);
        this.effectPopup('effect-reward', event.text ?? 'Reward', this.layout.robotCenter.x, this.layout.padTop + 38, event.severity ?? 'neutral');
        break;
      case 'day_complete':
        this.updateLiveStatus(this.day, 'COMPLETE', dayCompleteStatus(event), true);
        this.showDayComplete(event);
        break;
    }
  }

  private createLiveStatusPanel() {
    const compact = this.layout.mode === 'mobile-portrait';
    const panel = this.add.container(this.layout.liveHud.x, this.layout.liveHud.y).setDepth(DEPTH.liveHud);
    const backing = this.add.rectangle(0, 0, compact ? 250 : 340, compact ? 58 : 72, 0x061221, 0.92)
      .setStrokeStyle(2, 0xf5c451, 0.74);
    const glow = this.add.rectangle(0, compact ? 20 : 26, compact ? 220 : 308, 4, 0x22d3ee, 0.3);
    this.liveStatusTitle = this.add.text(0, compact ? -12 : -15, 'DAY --/--', {
      ...arenaText(compact ? 16 : 22, '#fef08a'),
      align: 'center',
      fixedWidth: compact ? 228 : 312,
    }).setOrigin(0.5);
    this.liveStatusDetail = this.add.text(0, compact ? 12 : 16, 'Ready', {
      ...arenaText(compact ? 11 : 14, '#dbeafe'),
      align: 'center',
      fixedWidth: compact ? 228 : 312,
    }).setOrigin(0.5);
    panel.add([backing, glow, this.liveStatusTitle, this.liveStatusDetail]);
    this.liveStatusPanel = panel;
    this.addStatic(panel);
  }

  private updateLiveStatus(
    day: ArenaReplayDay | undefined,
    state: 'READY' | 'LIVE' | 'COMPLETE',
    detail: string,
    pulse = false
  ) {
    if (!day || !this.liveStatusTitle || !this.liveStatusDetail) return;
    this.liveStatusTitle.setText(`${state} · DAY ${day.day.toString().padStart(2, '0')}/${day.maxDays}`);
    this.liveStatusDetail.setText(compactStageText(`${detail} · ${day.weather} · ${day.eventLabel}`, 42));

    if (pulse && this.liveStatusPanel) {
      this.liveStatusPanel.setScale(1);
      this.tweens.add({
        targets: this.liveStatusPanel,
        scale: 1.045,
        duration: 130,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    }
  }

  private showDayComplete(event: ArenaReplayEvent) {
    if (!this.day) return;
    const good = (event.severity ?? 'neutral') !== 'bad' && this.day.lastReward >= 0;
    const panel = this.add.container(this.layout.width / 2, this.layout.backdropCenterY - 1).setAlpha(0).setDepth(60);
    this.addCeremonyBacking(panel);
    const ceremony = this.layout.ceremonyPanel;
    const compact = this.layout.mode === 'mobile-portrait';
    panel.add(this.add.image(0, 0, 'day-complete-panel')
      .setDisplaySize(compact ? ceremony.w - 40 : 760, compact ? ceremony.h - 34 : 218)
      .setAlpha(0.18));
    panel.add(this.add.image(compact ? -ceremony.w * 0.34 : -310, -6, good ? 'score-burst-good' : 'score-burst-bad')
      .setDisplaySize(ceremony.burst, ceremony.burst));
    panel.add(this.ceremonyLine(0, compact ? -58 : -72, 'DAY COMPLETE', compact ? 22 : 30, '#ffffff', ceremony.line));
    panel.add(this.ceremonyLine(0, compact ? -28 : -34, `${this.day.weather} · ${this.day.eventLabel}`, compact ? 13 : 16, '#dff6ff', ceremony.line - 20));
    panel.add(this.ceremonyLine(0, 0, `Reward ${signedNumber(this.day.lastReward)} · Profit ${moneyText(this.day.metrics.profit)}`, compact ? 16 : 20, good ? '#b7ffc8' : '#ffc4c4', ceremony.line));
    panel.add(this.ceremonyLine(0, compact ? 24 : 34, `${this.day.metrics.visits} visits · ${this.day.metrics.soldUnits} sold · ${this.day.metrics.missedUnits} missed · Khata ${moneyText(this.day.metrics.khata)}`, compact ? 12 : 16, '#f8fafc', ceremony.line, compact));
    panel.add(this.ceremonyLine(0, compact ? 48 : 62, `Cash ${moneyText(this.day.cash)} · Trust ${this.day.trust}% (${signedNumber(this.day.trustDelta)})`, compact ? 11 : 14, '#fef3c7', ceremony.line, compact));
    this.transientObjects.push(panel);
    this.tweens.add({
      targets: panel,
      alpha: 1,
      scale: 1.03,
      duration: 320,
      ease: 'Back.easeOut',
    });
    this.time.delayedCall(5200, () => {
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
    const ceremony = this.layout.ceremonyPanel;
    panel.add(this.add.rectangle(0, 0, ceremony.w, ceremony.h, 0x020817, 0.98)
      .setStrokeStyle(3, 0xf5c451, 0.72));
    panel.add(this.add.rectangle(0, 0, ceremony.w - 56, ceremony.h - 44, 0x07182b, 0.96)
      .setStrokeStyle(1, 0x38bdf8, 0.45));
  }

  private ceremonyLine(
    x: number,
    y: number,
    text: string,
    size: number,
    color: string,
    width: number,
    wrap = false
  ) {
    return this.add.text(x, y, text, {
      ...ceremonyText(size, color),
      align: 'center',
      fixedWidth: width,
      wordWrap: wrap ? { width, useAdvancedWrap: true } : undefined,
    }).setOrigin(0.5);
  }

  private setPhase(phase: NonNullable<ArenaReplayEvent['phase']>, label: string) {
    if (!this.phaseOverlay) return;
    this.phaseOverlay.setTexture(`phase-${phase}`);
    this.updateLiveStatus(this.day, 'LIVE', `${capitalizeWord(phase)} · ${label}`, true);
    this.tweens.add({
      targets: this.phaseOverlay,
      alpha: phase === 'evening' ? 0.42 : phase === 'afternoon' ? 0.25 : 0.2,
      duration: 460,
      ease: 'Sine.easeInOut',
    });
    const x = phase === 'morning'
      ? this.layout.phasePopupX.morning
      : phase === 'afternoon'
        ? this.layout.phasePopupX.afternoon
        : this.layout.phasePopupX.evening;
    this.popup(label, x, this.layout.padTop + 20, 'neutral');
  }

  private async enterCustomer(event: ArenaReplayEvent, speed: number, token: number) {
    const index = event.customerIndex ?? 0;
    const position = this.customerPositionForIndex(index);
    this.activeCustomerSprites.get(index)?.destroy();
    const sprite = this.add.image(this.layout.customerEntry.x, this.layout.customerEntry.y, `customer-${index % customerUrls.length}`)
      .setDisplaySize(this.layout.customerSize.idle.w, this.layout.customerSize.idle.h)
      .setAlpha(0)
      .setDepth(DEPTH.customer);
    this.customerSprites.push(sprite);
    this.activeCustomerSprites.set(index, sprite);
    this.addDay(sprite);
    const divisor = animationDivisor(speed);
    await this.tween(sprite, { x: position.x, y: position.y, alpha: 1 }, 470 / divisor, token);
    this.highlightCustomer(index);
    this.showThinkingBubble(index, event.customerName ?? 'Customer');
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
      this.setThoughtFeedback(
        index,
        `${event.severity === 'good' ? '🙂' : '😐'} ${event.text ?? 'Bag filled'}`,
        event.severity ?? 'good'
      );
    } else {
      this.setThoughtFeedback(index, `😠 ${event.text ?? 'Left unhappy'}`, 'bad');
    }

    await this.wait(420 / animationDivisor(speed), token);
    this.dismissThoughtBubble(index, 260 / animationDivisor(speed));
    const divisor = animationDivisor(speed);
    await this.tween(exitTargets, {
      x: this.layout.customerExit.x,
      y: this.layout.customerExit.y,
      alpha: 0,
    }, 560 / divisor, token);
    sprite.destroy();
    bag?.destroy();
    this.activeCustomerSprites.delete(index);
  }

  private async conveyItem(event: ArenaReplayEvent, speed: number, token: number) {
    if (!event.productId) return;
    const customerIndex = event.customerIndex ?? 0;
    const customer = this.activeCustomerSprites.get(customerIndex);
    const start = this.layout.productPositions[event.productId] ?? { x: 1040, y: 305 };
    const handoff = customer
      ? { x: customer.x + 18, y: customer.y + 24 }
      : { x: this.layout.servicePosition.x + 12, y: this.layout.servicePosition.y + 30 };

    this.setThoughtFeedback(customerIndex, `Packing ${event.text ?? 'item'}…`, 'neutral');

    const item = this.add.image(start.x, start.y, productKey(event.productId))
      .setDisplaySize(36, 36)
      .setScale(0.72)
      .setDepth(DEPTH.itemTransit);
    this.transientObjects.push(item);

    const divisor = animationDivisor(speed);
    const path = conveyPath(this.layout, start, handoff);
    await this.tween(item, { x: start.x, y: start.y - 18, scale: 1.08, angle: -6 }, 180 / divisor, token);
    for (let index = 0; index < path.length; index += 1) {
      const waypoint = path[index];
      const isLast = index === path.length - 1;
      if (isLast) this.flashRobot();
      await this.tween(item, {
        x: waypoint.x,
        y: waypoint.y,
        angle: isLast ? 0 : 4,
        scale: isLast ? 0.82 : 1,
      }, (isLast ? 340 : 280) / divisor, token);
    }

    this.markThoughtItem(customerIndex, event.productId, 'served', event.quantity);
    this.setThoughtFeedback(customerIndex, `Here you go — ${event.text ?? 'served'}`, 'good');
    this.spawnHandoffBurst(handoff.x, handoff.y);

    await this.wait(140 / divisor, token);
    await this.tween(item, { alpha: 0, scale: 0.45, y: handoff.y + 10 }, 160 / divisor, token);
    item.destroy();
  }

  private highlightCustomer(index: number) {
    this.activeCustomerSprites.forEach((sprite, customerIndex) => {
      const active = customerIndex === index;
      const position = this.customerPositionForIndex(customerIndex);
      sprite.setDisplaySize(
        active ? this.layout.customerSize.active.w : this.layout.customerSize.idle.w,
        active ? this.layout.customerSize.active.h : this.layout.customerSize.idle.h,
      );
      sprite.setAlpha(customerIndex === index ? 1 : 0.78);
      if (position) {
        this.tweens.add({
          targets: sprite,
          x: active ? position.x + 8 : position.x,
          y: active ? position.y - 8 : position.y,
          duration: 220,
          ease: 'Sine.easeOut',
          onComplete: () => this.repositionThoughtBubble(customerIndex),
        });
      }
    });
    this.repositionThoughtBubble(index);
  }

  private showThinkingBubble(index: number, customerName: string) {
    this.dismissThoughtBubble(index, 0);
    const anchor = this.customerAnchor(index);
    const width = 168;
    const height = 62;
    const position = this.thoughtBubblePosition(anchor, width, height);
    const container = this.add.container(position.x, position.y).setAlpha(0).setDepth(DEPTH.thoughtBubble);
    const background = this.add.rectangle(0, 0, width, height, 0xfffbeb, 0.98)
      .setStrokeStyle(2, statusColor('neutral'));
    const tail = this.thoughtBubbleTail(width, height, statusColor('neutral'));
    const headerText = this.add.text(0, -8, compactStageText(customerName, 16), {
      ...thoughtText(14, '#0f172a'),
      align: 'center',
      fixedWidth: width - 20,
    }).setOrigin(0.5);
    const feedbackBar = this.add.rectangle(0, 14, width - 16, 20, 0xf8fafc, 0.95)
      .setStrokeStyle(1, 0xe2e8f0, 1);
    const feedbackText = this.add.text(-width / 2 + 16, 14, '…', {
      ...thoughtText(13, '#64748b'),
      align: 'left',
      fixedWidth: width - 36,
    }).setOrigin(0, 0.5);

    container.add([background, tail, headerText, feedbackBar, feedbackText]);
    this.thoughtBubbles.set(index, {
      container,
      background,
      tail,
      headerText,
      feedbackBar,
      feedbackText,
      feedbackIcon: null,
      items: new Map(),
      width,
      height,
    });
    this.tweens.add({
      targets: container,
      alpha: 1,
      y: position.y - 6,
      duration: 200,
      ease: 'Sine.easeOut',
    });
  }

  private showThoughtBubble(
    index: number,
    customerName: string,
    orderText: string,
    severity: ArenaReplayEvent['severity']
  ) {
    this.dismissThoughtBubble(index, 0);
    const anchor = this.customerAnchor(index);
    const visit = this.day?.visits[index];
    const lines = visit?.requested.slice(0, 4) ?? [];
    const itemColumns = Math.max(lines.length, 1);
    const width = Math.min(310, Math.max(210, itemColumns * 62 + 48));
    const height = lines.length > 0 ? 132 : 88;
    const position = this.thoughtBubblePosition(anchor, width, height);
    const stroke = statusColor(severity ?? 'neutral');

    const container = this.add.container(position.x, position.y).setAlpha(0).setDepth(DEPTH.thoughtBubble);
    const background = this.add.rectangle(0, 0, width, height, 0xfffbeb, 0.98).setStrokeStyle(3, stroke);
    const tail = this.thoughtBubbleTail(width, height, stroke);
    const headerText = this.add.text(0, -height / 2 + 18, compactStageText(customerName, 18), {
      ...thoughtText(15, '#0f172a'),
      align: 'center',
      fixedWidth: width - 24,
    }).setOrigin(0.5);
    const feedbackBar = this.add.rectangle(0, height / 2 - 18, width - 14, 24, 0xf8fafc, 0.96)
      .setStrokeStyle(1, 0xe2e8f0, 1);
    const feedbackText = this.add.text(8, height / 2 - 18, compactStageText(orderText, 34), {
      ...thoughtText(13, '#334155'),
      align: 'left',
      fixedWidth: width - 40,
    }).setOrigin(0, 0.5);
    const feedbackIcon: Phaser.GameObjects.Image | null = null;
    const items = new Map<ProductId, ThoughtBubbleItem>();

    container.add([background, tail, headerText, feedbackBar, feedbackText]);

    if (lines.length === 0) {
      container.add(this.add.text(0, 2, orderText, {
        ...thoughtText(14, '#111827'),
        align: 'center',
        fixedWidth: width - 30,
        wordWrap: { width: width - 30, useAdvancedWrap: true },
      }).setOrigin(0.5));
    } else {
      const rowWidth = lines.length * 58;
      const startX = -rowWidth / 2 + 28;
      lines.forEach((line, lineIndex) => {
        const x = startX + lineIndex * 58;
        const y = -4;
        const plate = this.add.rectangle(x, y, 50, 46, 0xffffff, 0.82).setStrokeStyle(1, 0xe5e7eb, 1);
        const icon = this.add.image(x, y - 2, productKey(line.productId)).setDisplaySize(32, 32);
        const qtyText = this.add.text(x, y + 18, `x${line.quantity}`, thoughtText(13, '#111827')).setOrigin(0.5);
        const badge = this.add.text(x + 18, y - 20, '', {
          ...thoughtText(12, '#ffffff'),
          backgroundColor: '#16a34a',
          padding: { x: 4, y: 1 },
        }).setOrigin(0.5).setVisible(false);
        container.add([plate, icon, qtyText, badge]);
        items.set(line.productId, {
          plate,
          icon,
          qtyText,
          badge,
          requested: line.quantity,
          served: 0,
          missed: 0,
        });
      });
      if ((visit?.requested.length ?? 0) > lines.length) {
        container.add(this.add.text(width / 2 - 18, -2, `+${(visit?.requested.length ?? 0) - lines.length}`, thoughtText(13, '#64748b')).setOrigin(0.5));
      }
    }

    this.thoughtBubbles.set(index, {
      container,
      background,
      tail,
      headerText,
      feedbackBar,
      feedbackText,
      feedbackIcon,
      items,
      width,
      height,
    });

    this.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1.02,
      duration: 240,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: container,
          scale: 1,
          duration: 120,
          ease: 'Sine.easeOut',
        });
      },
    });
  }

  private setThoughtFeedback(
    index: number,
    text: string,
    severity: ArenaReplayEvent['severity'],
    iconKey?: string
  ) {
    const bubble = this.thoughtBubbles.get(index);
    if (!bubble) return;

    if (bubble.feedbackIcon) {
      bubble.feedbackIcon.destroy();
      bubble.feedbackIcon = null;
    }

    const iconOffset = iconKey ? 18 : 0;
    if (iconKey) {
      bubble.feedbackIcon = this.add.image(-bubble.width / 2 + 22, bubble.feedbackText.y, iconKey)
        .setDisplaySize(18, 18);
      bubble.container.add(bubble.feedbackIcon);
    }

    bubble.feedbackBar
      .setFillStyle(feedbackBarColor(severity), 0.96)
      .setStrokeStyle(1, statusColor(severity ?? 'neutral'), 0.55);
    bubble.feedbackText
      .setText(compactStageText(text, 38))
      .setColor(feedbackTextColor(severity))
      .setX(-bubble.width / 2 + 16 + iconOffset);

    bubble.container.setScale(1);
    this.tweens.add({
      targets: bubble.container,
      scale: 1.03,
      duration: 110,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  private markThoughtItem(index: number, productId: ProductId | undefined, status: 'served' | 'missed', quantity = 0) {
    if (!productId) return;
    const bubble = this.thoughtBubbles.get(index);
    const item = bubble?.items.get(productId);
    if (!item) return;

    if (status === 'served') item.served += quantity || item.requested;
    else item.missed += quantity || Math.max(0, item.requested - item.served);

    const partial = item.served > 0 && item.missed > 0;
    const good = item.served > 0 && item.missed === 0;
    const missedOnly = item.missed > 0 && item.served === 0;

    item.plate
      .setFillStyle(partial ? 0xfffbeb : good ? 0xecfdf5 : 0xfff1f2, 0.9)
      .setStrokeStyle(2, partial ? 0xf59e0b : good ? 0x22c55e : 0xef4444, 1);
    item.badge
      .setText(partial ? '½' : good ? '✓' : '✕')
      .setBackgroundColor(partial ? '#d97706' : good ? '#16a34a' : '#dc2626')
      .setVisible(true);

    this.tweens.add({
      targets: [item.icon, item.badge],
      scale: 1.12,
      duration: 140,
      yoyo: true,
      ease: 'Back.easeOut',
    });

    if (missedOnly) {
      this.tweens.add({
        targets: item.icon,
        angle: -8,
        duration: 90,
        yoyo: true,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private emitLiveMetrics(metrics: ArenaLiveMetrics | undefined) {
    if (metrics) this.onLiveMetrics?.(metrics);
  }

  private dismissThoughtBubble(index: number, duration = 180) {
    const bubble = this.thoughtBubbles.get(index);
    if (!bubble) return;
    this.thoughtBubbles.delete(index);
    if (duration <= 0) {
      bubble.container.destroy();
      return;
    }
    this.tweens.add({
      targets: bubble.container,
      alpha: 0,
      y: bubble.container.y - 16,
      scale: 0.96,
      duration,
      ease: 'Sine.easeIn',
      onComplete: () => bubble.container.destroy(),
    });
  }

  private repositionThoughtBubble(index: number) {
    const bubble = this.thoughtBubbles.get(index);
    if (!bubble) return;
    const anchor = this.customerAnchor(index);
    const position = this.thoughtBubblePosition(anchor, bubble.width, bubble.height);
    this.tweens.add({
      targets: bubble.container,
      x: position.x,
      y: position.y,
      duration: 180,
      ease: 'Sine.easeOut',
    });
  }

  private customerAnchor(index: number) {
    const sprite = this.activeCustomerSprites.get(index);
    return sprite ? { x: sprite.x, y: sprite.y } : this.customerPositionForIndex(index);
  }

  private thoughtBubblePosition(anchor: { x: number; y: number }, width: number, height: number) {
    const bounds = this.layout.thoughtBubbleBounds;
    const x = Phaser.Math.Clamp(anchor.x + 24, width / 2 + bounds.minX, bounds.maxX - width / 2);
    const y = Phaser.Math.Clamp(
      anchor.y - height / 2 - 72,
      height / 2 + bounds.minY,
      bounds.maxY - height / 2 - 12,
    );
    return { x, y };
  }

  private thoughtBubbleTail(width: number, height: number, stroke: number) {
    return this.add.triangle(-width * 0.18, height / 2 - 4, 0, 0, 14, 0, 7, 16, 0xfffbeb, 0.98)
      .setStrokeStyle(2, stroke);
  }

  private spawnHandoffBurst(x: number, y: number) {
    const burst = this.add.circle(x, y, 10, 0x4ade80, 0.55).setDepth(DEPTH.itemBurst);
    const ring = this.add.circle(x, y, 6, 0x22c55e, 0).setDepth(DEPTH.itemBurst)
      .setStrokeStyle(2, 0x86efac, 0.9);
    this.transientObjects.push(burst, ring);
    this.tweens.add({
      targets: [burst, ring],
      scale: 2.2,
      alpha: 0,
      duration: 320,
      ease: 'Sine.easeOut',
      onComplete: () => {
        burst.destroy();
        ring.destroy();
      },
    });
  }

  private popup(text: string, x: number, y: number, severity: ArenaReplayEvent['severity']) {
    const label = this.add.text(x, y, text, {
      ...arenaText(22, popupColor(severity)),
      backgroundColor: 'rgba(2,6,23,0.82)',
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
    const icon = this.add.image(x - 44, y, iconKey).setDisplaySize(32, 32);
    const label = this.add.text(x, y, text, {
      ...arenaText(19, popupColor(severity)),
      backgroundColor: 'rgba(6,17,31,0.86)',
      padding: { x: 12, y: 8 },
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
    const glowRadius = this.layout.mode === 'mobile-portrait' ? 78 : 116;
    const glow = this.add.circle(this.layout.robotCenter.x, this.layout.robotCenter.y - 5, glowRadius, 0x38bdf8, 0.16);
    this.transientObjects.push(glow);
    this.tweens.add({
      targets: glow,
      scale: 1.4,
      alpha: 0,
      duration: 700,
      onComplete: () => glow.destroy(),
    });
  }

  private clearPlanningHud() {
    this.planningRows.forEach((row) => row.destroy());
    this.planningRows = [];
    if (this.planningPanel) {
      this.planningPanel.destroy();
      this.planningPanel = undefined;
    }
    if (this.robotPlanningThought) {
      this.robotPlanningThought.destroy();
      this.robotPlanningThought = undefined;
    }
    this.planningObjects.forEach((object) => object.destroy());
    this.planningObjects = [];
  }

  private trackPlanning(object: Phaser.GameObjects.GameObject) {
    this.planningObjects.push(object);
    return object;
  }

  private showPlanningPanel() {
    if (this.planningPanel) return;
    const compact = this.layout.mode === 'mobile-portrait';
    const panel = this.add.container(this.layout.planningPanel.x, this.layout.planningPanel.y).setDepth(DEPTH.planningHud);
    const panelW = compact ? 220 : 278;
    const panelH = compact ? 250 : 360;
    const bg = this.add.graphics();
    bg.fillStyle(0x061221, 0.94);
    bg.fillRoundedRect(0, 0, panelW, panelH, 12);
    bg.lineStyle(2, 0x38bdf8, 0.55);
    bg.strokeRoundedRect(0, 0, panelW, panelH, 12);
    panel.add(bg);
    panel.add(this.add.text(16, 14, 'AI DAY PLAN', {
      ...arenaText(compact ? 13 : 15, '#7dd3fc'),
    }));
    panel.add(this.add.text(16, 36, 'Env review → stock & ads', {
      ...arenaText(compact ? 10 : 12, '#94a3b8'),
      fontStyle: '500',
    }));
    this.planningPanel = panel;
    this.trackPlanning(panel);
    panel.setAlpha(0);
    this.tweens.add({
      targets: panel,
      alpha: 1,
      duration: 260,
      ease: 'Sine.easeOut',
    });
  }

  private addPlanningRow(text: string, severity: ArenaReplayEvent['severity']) {
    if (!this.planningPanel) this.showPlanningPanel();
    const rowIndex = this.planningRows.length;
    const rowY = 64 + rowIndex * 28;
    if (rowY > (this.layout.mode === 'mobile-portrait' ? 220 : 322)) return;

    const row = this.add.container(0, rowY);
    const highlight = severity === 'good' || severity === 'warn' || severity === 'bad';
    const dotColor = severity === 'good' ? 0x22c55e : severity === 'warn' ? 0xf59e0b : severity === 'bad' ? 0xef4444 : 0x38bdf8;
    row.add(this.add.circle(20, 10, 4, dotColor, 1));
    row.add(this.add.text(32, 0, compactStageText(text, 52), {
      ...arenaText(13, highlight ? '#e2e8f0' : '#cbd5e1'),
      fontStyle: '500',
      wordWrap: { width: 228, useAdvancedWrap: true },
    }));
    row.setAlpha(0);
    this.planningPanel?.add(row);
    this.planningRows.push(row);
    this.trackPlanning(row);
    this.tweens.add({
      targets: row,
      alpha: 1,
      x: 4,
      duration: 220,
      ease: 'Quad.easeOut',
    });
  }

  private showRobotPlanningThought(text: string) {
    if (this.robotPlanningThought) {
      this.robotPlanningThought.destroy();
      this.robotPlanningThought = undefined;
    }
    const bubble = this.add.container(this.layout.robotCenter.x, this.layout.robotCenter.y - 58).setDepth(DEPTH.thoughtBubble);
    const width = 300;
    const height = 76;
    const bg = this.add.rectangle(0, 0, width, height, 0x07182b, 0.96)
      .setStrokeStyle(2, 0x38bdf8, 0.7);
    const tail = this.add.triangle(0, height / 2 - 2, -8, 0, 8, 0, 0, 14, 0x07182b, 0.96)
      .setStrokeStyle(2, 0x38bdf8, 0.7);
    const thought = this.add.text(0, 0, compactStageText(text, 110), {
      ...thoughtText(14, '#e2e8f0'),
      align: 'center',
      fixedWidth: width - 28,
      wordWrap: { width: width - 28, useAdvancedWrap: true },
    }).setOrigin(0.5);
    bubble.add([bg, tail, thought]);
    bubble.setAlpha(0).setScale(0.92);
    this.robotPlanningThought = bubble;
    this.trackPlanning(bubble);
    this.tweens.add({
      targets: bubble,
      alpha: 1,
      scale: 1,
      duration: 280,
      ease: 'Back.easeOut',
    });
    this.flashRobot();
  }

  private hideRobotPlanningThought() {
    if (!this.robotPlanningThought) return;
    const bubble = this.robotPlanningThought;
    this.robotPlanningThought = undefined;
    this.tweens.add({
      targets: bubble,
      alpha: 0,
      y: bubble.y - 10,
      duration: 200,
      onComplete: () => bubble.destroy(),
    });
  }

  private fadePlanningPanel() {
    if (!this.planningPanel) return;
    const panel = this.planningPanel;
    this.tweens.add({
      targets: panel,
      alpha: 0.35,
      duration: 320,
      ease: 'Sine.easeInOut',
    });
  }

  private pulseProductOnShelf(productId: ProductId) {
    const position = this.layout.productPositions[productId];
    if (!position) return;
    const pulse = this.add.image(position.x, position.y, productKey(productId))
      .setDisplaySize(40, 40)
      .setDepth(DEPTH.itemBurst);
    this.transientObjects.push(pulse);
    this.tweens.add({
      targets: pulse,
      scale: 1.35,
      alpha: 0,
      duration: 480,
      onComplete: () => pulse.destroy(),
    });
  }

  private animateRestockOrder(productId: ProductId, quantity: number) {
    const position = this.layout.productPositions[productId];
    if (!position) return;

    const startX = this.layout.restockStartX;
    const startY = position.y + 6;
    const crate = this.add.image(startX, startY, productKey(productId))
      .setDisplaySize(34, 34)
      .setDepth(DEPTH.itemTransit);
    const label = this.add.text(startX, startY - 24, `+${quantity}`, {
      ...arenaText(16, '#4ade80'),
      stroke: '#020617',
      strokeThickness: 3,
    }).setDepth(DEPTH.itemTransit).setAlpha(0);
    this.transientObjects.push(crate, label);
    this.tweens.add({ targets: label, alpha: 1, duration: 160 });

    this.tweens.add({
      targets: crate,
      x: position.x,
      y: position.y,
      duration: 520,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        this.pulseProductOnShelf(productId);
        this.popup(`Restocked ${productId} +${quantity}`, position.x, position.y - 34, 'good');
        this.tweens.add({
          targets: crate,
          alpha: 0,
          scale: 1.2,
          duration: 180,
          onComplete: () => crate.destroy(),
        });
      },
    });
    this.tweens.add({
      targets: label,
      x: position.x,
      y: position.y - 38,
      duration: 520,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        this.tweens.add({
          targets: label,
          alpha: 0,
          duration: 200,
          onComplete: () => label.destroy(),
        });
      },
    });
    this.flashRobot();
  }

  private animateMarketingLaunch(campaignLabel: string) {
    const x = this.layout.marketingBurst.x;
    const y = this.layout.marketingBurst.y;
    const burstSize = this.layout.mode === 'mobile-portrait' ? 108 : 140;
    const burst = this.add.image(x, y, 'effect-customers')
      .setDisplaySize(burstSize, burstSize)
      .setAlpha(0)
      .setDepth(DEPTH.itemBurst);
    this.transientObjects.push(burst);
    this.tweens.add({
      targets: burst,
      alpha: 0.9,
      scale: 1.15,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: burst,
          alpha: 0,
          scale: 1.35,
          duration: 480,
          delay: 360,
          onComplete: () => burst.destroy(),
        });
      },
    });
    this.popup(`📣 ${campaignLabel}`, x, y - 54, 'good');
    this.flashRobot();
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
    let remaining = ms;
    let previous = performance.now();
    while (remaining > 0) {
      if (this.replayToken !== token) return;
      await sleep(this.paused ? 80 : 40);
      const now = performance.now();
      if (!this.paused) remaining -= now - previous;
      previous = now;
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
    this.clearThoughtBubbles();
    this.dayObjects.forEach((object) => object.destroy());
    this.dayObjects = [];
    this.customerSprites = [];
    this.activeCustomerSprites.clear();
  }

  private clearTransient() {
    this.clearPlanningHud();
    this.transientObjects.forEach((object) => object.destroy());
    this.transientObjects = [];
  }

  private clearThoughtBubbles() {
    this.thoughtBubbles.forEach((bubble) => bubble.container.destroy());
    this.thoughtBubbles.clear();
  }

  private customerPositionForIndex(_index: number) {
    return this.layout.servicePosition;
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

function thoughtText(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: `${size}px`,
    fontStyle: '600',
    color,
  };
}

function feedbackBarColor(severity: ArenaReplayEvent['severity']) {
  if (severity === 'good') return 0xecfdf5;
  if (severity === 'warn') return 0xfffbeb;
  if (severity === 'bad') return 0xfff1f2;
  return 0xf8fafc;
}

function feedbackTextColor(severity: ArenaReplayEvent['severity']) {
  if (severity === 'good') return '#166534';
  if (severity === 'warn') return '#92400e';
  if (severity === 'bad') return '#991b1b';
  return '#334155';
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

function missedLabel(event: ArenaReplayEvent) {
  const product = event.productName ?? event.productId ?? 'Item';
  const quantity = event.quantity ? ` x${event.quantity}` : '';
  return `Out of stock: ${product}${quantity}`;
}

function trustReaction(event: ArenaReplayEvent) {
  const delta = Math.round(event.trustDelta ?? 0);
  if (delta > 0) return `Trust +${delta}`;
  if (delta < 0) return `Trust ${delta}`;
  return 'Trust stable';
}

function dayCompleteStatus(event: ArenaReplayEvent) {
  const reward = event.liveMetrics ? `Score ${event.liveMetrics.score}` : event.text ?? 'Report ready';
  return compactStageText(reward, 22);
}

function compactStageText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}...`;
}

function capitalizeWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function animationDivisor(speed: number) {
  return playbackSpeedMultiplier(speed);
}

function playbackSpeedMultiplier(speed: number) {
  if (speed <= 1) return 0.24;
  if (speed <= 5) return 1.15;
  return 5.8;
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
