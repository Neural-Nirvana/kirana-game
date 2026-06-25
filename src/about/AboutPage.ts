import './about.css';
import '../arena/provider-brand.css';
import { PRODUCT_NAME, PRODUCT_TAGLINE, SHOP_NAME, SHOP_LOCATION } from '../constants/brand';
import { DEFAULT_NEIGHBORHOOD_PROFILE } from '../constants/neighborhood';
import {
  DEFAULT_MODEL_PRESETS,
  money,
  requestJson,
  signed,
} from '../arena/arena-shared';
import { initProviderLogoFallbacks, renderBenchmarkModelCell } from '../arena/provider-brand';
import type { ArenaScoreboardResponse } from '../arena/arena-types';

import stageBackdropUrl from '../assets/arena/stage-backdrop.png';
import robotUrl from '../assets/arena/robot-shopkeeper.png';
import aiKioskUrl from '../assets/arena/ai-kiosk.png';
import effectCashUrl from '../assets/arena/effect-cash.png';
import effectTrustUrl from '../assets/arena/effect-trust.png';
import effectKhataUrl from '../assets/arena/effect-khata.png';
import effectWarningUrl from '../assets/arena/effect-warning.png';
import effectCustomersUrl from '../assets/arena/effect-customers.png';
import effectRewardUrl from '../assets/arena/effect-reward.png';

import customerStudentUrl from '../assets/arena/customer-student.png';
import customerFamilyUrl from '../assets/arena/customer-family.png';
import customerRegularUrl from '../assets/arena/customer-regular.png';
import customerTeenUrl from '../assets/arena/customer-teen.png';

import productMilkUrl from '../assets/arena/product-milk.png';
import productBreadUrl from '../assets/arena/product-bread.png';
import productChipsUrl from '../assets/arena/product-chips.png';
import productMaggiUrl from '../assets/arena/product-maggi.png';

import morningUrl from '../assets/live-shop/morning.webp';
import afternoonUrl from '../assets/live-shop/afternoon.webp';
import eveningUrl from '../assets/live-shop/evening.webp';
import dukaanbenchLogoUrl from '../assets/dukaanbench-logo.png';

export class AboutPage {
  private readonly root: HTMLElement;
  private phaseTimer?: number;
  private scrollListener?: () => void;
  private scoreboardRows: ArenaScoreboardResponse['rows'] = [];
  private scoreboardLoading = true;
  private scoreboardError = false;

  constructor(rootId: string) {
    const root = document.getElementById(rootId);
    if (!root) throw new Error(`Missing about root: ${rootId}`);
    this.root = root;
  }

  start() {
    this.enableScrollRoute();
    this.root.innerHTML = this.renderPage();
    this.bindScrollReveal();
    this.bindNavigation();
    this.startPhaseRotation();
    void this.loadScoreboard();
  }

  private async loadScoreboard() {
    try {
      const response = await requestJson<ArenaScoreboardResponse>('/api/arena/scoreboard?limit=20');
      this.scoreboardRows = response.rows;
      this.scoreboardError = false;
    } catch {
      this.scoreboardRows = [];
      this.scoreboardError = true;
    } finally {
      this.scoreboardLoading = false;
      const mount = this.root.querySelector('#about-leaderboard-mount');
      if (mount) {
        mount.innerHTML = this.renderLeaderboardBlock();
        initProviderLogoFallbacks(mount);
        this.bindScrollReveal();
      }
    }
  }

  destroy() {
    if (this.phaseTimer) window.clearInterval(this.phaseTimer);
    if (this.scrollListener) window.removeEventListener('scroll', this.scrollListener);
    this.disableScrollRoute();
  }

  private enableScrollRoute() {
    document.documentElement.classList.add('about-route');
    document.body.classList.add('about-route');
    this.root.classList.add('about-route');
  }

  private disableScrollRoute() {
    document.documentElement.classList.remove('about-route');
    document.body.classList.remove('about-route');
    this.root.classList.remove('about-route');
  }

  private renderPage() {
    const profile = DEFAULT_NEIGHBORHOOD_PROFILE;
    const school = profile.nearbyPlaces.find((p) => p.type === 'school');
    const societies = profile.nearbyPlaces.filter((p) => p.type === 'residential_society');
    const households = societies.reduce((sum, p) => sum + (p.households ?? 0), 0);

    return `
      <div class="about-root" id="top">
        <nav class="about-nav" id="about-nav" aria-label="Page sections">
          <div class="about-nav-progress" aria-hidden="true">
            <div class="about-nav-progress-fill" id="about-progress"></div>
          </div>
          <div class="about-nav-inner">
            <div class="about-brand">
              <a href="#top" class="about-brand-link">
                <img class="about-brand-logo" src="${dukaanbenchLogoUrl}" alt="${PRODUCT_NAME}" width="168" height="48" decoding="async" />
                <span class="about-brand-tagline">${PRODUCT_TAGLINE}</span>
              </a>
            </div>
            <div class="about-nav-sections">
              <a href="#leaderboard" data-section="leaderboard">Leaderboard</a>
              <a href="#challenge" data-section="challenge">Challenge</a>
              <a href="#how-it-works" data-section="how-it-works">How it works</a>
              <a href="#system" data-section="system">Harness</a>
              <a href="#world" data-section="world">World</a>
              <a href="#proof" data-section="proof">Proof</a>
              <a href="#metrics" data-section="metrics">Scores</a>
              <a href="#arena" data-section="arena">Arena</a>
            </div>
            <div class="about-nav-cta">
              <a class="about-btn about-btn-primary" href="/arena-2">Open AI Arena</a>
            </div>
          </div>
        </nav>

        <button class="about-back-top" id="about-back-top" type="button" aria-label="Back to top">↑</button>

        <header class="about-hero" id="hero">
          <div class="about-hero-grid">
            <div class="about-hero-copy about-reveal visible">
              <span class="about-eyebrow">
                <span class="about-eyebrow-dot" aria-hidden="true"></span>
                AI business operator benchmark
              </span>
              <img class="about-hero-logo" src="${dukaanbenchLogoUrl}" alt="${PRODUCT_NAME}" width="360" height="103" decoding="async" />
              <p class="about-hero-lead">
                Can an AI keep a neighborhood <em>kirana</em> alive for 30 days?
                Models run ${SHOP_NAME}, a fixed Indian shop on ${SHOP_LOCATION}, by submitting
                one executable JSON plan each morning. Customers, cash, stockouts, credit, waste,
                trust, and marketing are then scored by the backend.
              </p>
              <div class="about-hero-actions">
                <a class="about-btn about-btn-primary about-btn-lg" href="/arena-2">Watch AI Arena</a>
                <a class="about-btn about-btn-ghost about-btn-lg" href="/play">Play the shop</a>
              </div>
              <div class="about-hero-stats">
                <div class="about-stat"><strong>30</strong><span>Simulated shop days</span></div>
                <div class="about-stat"><strong>1</strong><span>Action JSON per day</span></div>
                <div class="about-stat"><strong>${households}</strong><span>Nearby homes</span></div>
                <div class="about-stat"><strong>7</strong><span>Scoring buckets</span></div>
              </div>
            </div>
            <div class="about-hero-leaderboard about-reveal visible" id="leaderboard">
              <div class="about-section-head about-hero-leaderboard-head">
                <span>Current benchmark board</span>
                <h2>Which model actually runs the shop?</h2>
                <p>Completed 30-day runs on the same ${SHOP_NAME} world, ranked by backend reward and business health.</p>
              </div>
              <div id="about-leaderboard-mount">
                ${this.renderLeaderboardBlock()}
              </div>
              <div class="about-home-cta">
                <a class="about-btn about-btn-primary about-btn-lg" href="/arena-2">Open AI Arena</a>
                <p>Replay saved runs, inspect the model's action JSON, and watch the day play out customer by customer.</p>
              </div>
            </div>
            <div class="about-hero-visual about-reveal about-reveal-delay-1 visible">
              <div
                class="about-collage-bg"
                style="background-image:linear-gradient(145deg, rgba(255,253,248,0.92), rgba(250,246,240,0.65)), url('${stageBackdropUrl}')"
                aria-hidden="true"
              ></div>
              <div class="about-collage-tag">
                ${escapeHtml(SHOP_NAME)}
                <small>${escapeHtml(SHOP_LOCATION)}</small>
              </div>
              <div class="about-collage-orbit" aria-hidden="true">
                <img class="about-orbit-item" src="${productMilkUrl}" alt="" />
                <img class="about-orbit-item" src="${productChipsUrl}" alt="" />
                <img class="about-orbit-item" src="${productBreadUrl}" alt="" />
                <img class="about-orbit-item" src="${productMaggiUrl}" alt="" />
              </div>
              <img class="about-collage-robot" src="${robotUrl}" alt="AI shopkeeper" />
              <img class="about-collage-kiosk" src="${aiKioskUrl}" alt="AI kiosk" />
            </div>
          </div>
        </header>

        <section class="about-quote-band about-reveal">
          <p>
            DukaanBench turns an LLM from an answer engine into an operator.
            <em>The model does not get marks for sounding smart.</em> It gets marks for keeping shelves useful,
            cash liquid, customers served, khata under control, and trust alive.
          </p>
        </section>

        <section class="about-section about-section--alt" id="challenge">
          <div class="about-section-head about-reveal">
            <span>The operating problem</span>
            <h2>Small shops make hard decisions every morning</h2>
            <p>
              Indian kiranas look simple from the outside. Inside, every day is a tight operating problem:
              buy enough to serve demand, avoid dead stock, keep regulars happy, and never run out of cash.
            </p>
          </div>
          <div class="about-bento">
            ${bentoCard(effectWarningUrl, 'Thin-margin tradeoffs', 'Understock essentials and trust falls. Overstock perishables and cash quietly leaks away.', 'featured', 0)}
            ${bentoCard(effectKhataUrl, 'Credit is relationship capital', 'Khata can save a sale and protect loyalty, but unpaid balances weaken tomorrow\'s buying power.', 'wide', 1)}
            ${bentoCard(effectCustomersUrl, 'Neighborhood rhythm', 'Families, students, commuters, and walk-ins peak at different hours. The AI gets one morning plan for all of them.', '', 2)}
            ${bentoCard(effectTrustUrl, 'Trust compounds', 'A missed packet of milk is not only a lost sale. For regulars, it changes whether they come back.', '', 3)}
            ${bentoCard(effectCashUrl, 'Marketing can backfire', 'A discount campaign helps only when the promoted items are actually available on the shelf.', 'wide', 1)}
            ${bentoCard(effectRewardUrl, 'Auditable outcomes', 'Actions, validation, simulation results, provider responses, retries, and replays are saved for inspection.', '', 2)}
          </div>
        </section>

        <section class="about-section" id="how-it-works">
          <div class="about-section-head about-reveal">
            <span>The benchmark loop</span>
            <h2>One episode is a full month of shopkeeping</h2>
            <p>
              The AI cannot puppet customers or edit the day after it starts. It reads the morning state,
              submits a shopkeeper plan, and the backend tests that plan against simulated customer visits.
            </p>
          </div>
          <div class="about-loop-layout about-reveal">
            <div class="about-timeline">
              <div class="about-timeline-step">
                <strong>Step 01</strong>
                <h3>Observe</h3>
                <p>Day, weather, events, inventory, cash, trust, khata, active marketing, and recent history.</p>
              </div>
              <div class="about-timeline-step">
                <strong>Step 02</strong>
                <h3>Decide</h3>
                <p>One executable JSON action: restock, discounts, marketing, khata reminders, and cash discipline.</p>
              </div>
              <div class="about-timeline-step">
                <strong>Step 03</strong>
                <h3>Simulate</h3>
                <p>Customers arrive, ask for baskets, receive or miss items, pay by cash or khata, and update trust.</p>
              </div>
              <div class="about-timeline-step">
                <strong>Step 04</strong>
                <h3>Score</h3>
                <p>The day reward measures service, inventory, money, relationships, marketing, operations, and penalties.</p>
              </div>
            </div>
            <aside class="about-loop-aside about-reveal about-reveal-delay-1">
              <h3>Agent-friendly, backend-owned</h3>
              <p>
                The API is shaped like an environment loop, but the game state lives on the backend.
                That keeps model runs resumable, replayable, and comparable across providers.
              </p>
              <div class="about-terms">
                ${term('Episode', '30 shop days')}
                ${term('Step', '1 business day')}
                ${term('Action', 'Pre-day JSON')}
                ${term('Reward', 'Post-day score')}
                ${term('Audit', 'SQLite replay')}
              </div>
            </aside>
          </div>
        </section>

        <section class="about-section about-section--alt" id="system">
          <div class="about-section-head about-reveal">
            <span>The harness</span>
            <h2>How a model becomes a shop operator</h2>
            <p>
              DukaanBench is a structured decision environment. The model receives business context,
              returns a valid action JSON, and the simulator turns that choice into consequences.
            </p>
          </div>
          <div class="about-system-grid about-reveal">
            ${systemCard('01', 'Fixed world', 'The same neighborhood, societies, school, road flow, weather schedule, events, and customer segments for fair runs.')}
            ${systemCard('02', 'Observation packet', 'Cash, trust, shelf stock, perishability, khata, active marketing, recent history, and planning signals.')}
            ${systemCard('03', 'Action contract', 'The AI must emit executable JSON: product orders, discounts, campaigns, khata reminders, and cash reserve.')}
            ${systemCard('04', 'Validation layer', 'Malformed JSON, impossible quantities, over-budget plans, and action/rationale mismatches are caught early.')}
            ${systemCard('05', 'Simulation engine', 'Customers arrive with baskets, stock is fulfilled or missed, payments land, waste appears, and trust moves.')}
            ${systemCard('06', 'Replay database', 'Runs, day results, decisions, provider responses, retries, fallbacks, and timelines are persisted in SQLite.')}
          </div>
        </section>

        <section class="about-section about-section--alt" id="world">
          <div class="about-section-head about-reveal">
            <span>Fair test world</span>
            <h2>${escapeHtml(SHOP_NAME)} · ${escapeHtml(profile.name)}</h2>
            <p>
              Every model faces the same fictional Indian neighborhood: a ${profile.shopLocation.catchmentRadiusMeters}m catchment,
              ${societies.length} nearby societies, ${school?.population ?? 0} school students,
              and ${profile.commuteFlow.dailyPassersby.toLocaleString('en-IN')} daily road passers.
            </p>
          </div>
          <div class="about-world-stats about-reveal">
            <div class="about-world-stat"><strong>${profile.shopLocation.catchmentRadiusMeters}m</strong><span>Catchment radius</span></div>
            <div class="about-world-stat"><strong>${households}</strong><span>Households nearby</span></div>
            <div class="about-world-stat"><strong>${school?.population ?? 0}</strong><span>School students</span></div>
            <div class="about-world-stat"><strong>${profile.commuteFlow.dailyPassersby.toLocaleString('en-IN')}</strong><span>Daily passersby</span></div>
          </div>
          <div class="about-world">
            <div class="about-world-map about-reveal">
              <div class="about-world-shop">Your<br/>Kirana</div>
              ${profile.nearbyPlaces.slice(0, 5).map((place, i) => `
                <div class="about-place-pin" style="animation-delay:${i * 0.4}s">
                  ${escapeHtml(place.name)}
                  <small>${place.distanceMeters}m · ${escapeHtml(place.demandSignals[0] ?? '')}</small>
                </div>
              `).join('')}
            </div>
            <div class="about-segments about-reveal about-reveal-delay-1">
              ${segment(customerFamilyUrl, 'Families', 'Milk, bread, eggs — high trust sensitivity')}
              ${segment(customerStudentUrl, 'Students', 'Afternoon snack bursts after school')}
              ${segment(customerTeenUrl, 'Commuters', 'Impulse buys at morning & evening peaks')}
              ${segment(customerRegularUrl, 'Known regulars', 'Habit-led essentials & khata')}
              ${segment(customerTeenUrl, 'Road walk-ins', 'Weather-driven drinks & quick baskets')}
            </div>
          </div>
        </section>

        <section class="about-section" id="proof">
          <div class="about-section-head about-reveal">
            <span>Plan versus reality</span>
            <h2>The model's plan is only half the story</h2>
            <p>The interesting question is not what the AI says it will do. It is what happens after customers arrive.</p>
          </div>
          <div class="about-proof-grid about-reveal">
            <div class="about-proof-panel ai">
              <h3>What the AI receives</h3>
              <ul>
                <li>Day, cash, trust, and cumulative score</li>
                <li>Inventory on shelf and in storage</li>
                <li>Weather forecast and event context</li>
                <li>Neighborhood places, segments, and demand signals</li>
                <li>Active marketing, khata exposure, recent day history</li>
                <li>Per-product service rates and waste risk</li>
              </ul>
            </div>
            <div class="about-proof-panel sim">
              <h3>What the backend tests</h3>
              <ul>
                <li>Who actually visits the shop?</li>
                <li>Which requests are fulfilled, partial, or missed?</li>
                <li>How much revenue, khata, and waste result?</li>
                <li>Does trust rise or fall — and why?</li>
                <li>How does the day score across all reward buckets?</li>
                <li>Can the run be replayed and audited later?</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="about-section about-section--alt" id="metrics">
          <div class="about-section-head about-reveal">
            <span>How to judge a run</span>
            <h2>Good operators protect more than profit</h2>
            <p>
              DukaanBench separates daily reward from final business health. A model can make money today
              and still lose if it breaks customer trust or leaves tomorrow understocked.
            </p>
          </div>
          <div class="about-metric-board about-reveal">
            ${metricCard(effectRewardUrl, 'Service', 'Primary', 'Fulfill demand, especially essentials and weather-sensitive items during rush days.')}
            ${metricCard(effectCashUrl, 'Money', 'Primary', 'Grow revenue and profit while keeping enough liquid cash for tomorrow.')}
            ${metricCard(effectWarningUrl, 'Inventory', 'Discipline', 'Avoid stockouts, missed demand, dead cash, and perishable waste.')}
            ${metricCard(effectTrustUrl, 'Relationships', 'Long-term', 'Repeated misses for regulars reduce future visits. Trust is the real moat.')}
            ${metricCard(effectCustomersUrl, 'Marketing', 'Conditional', 'Campaigns score only when promoted demand is served profitably.')}
            ${metricCard(effectKhataUrl, 'Khata', 'Risk', 'Credit can protect loyalty, but unpaid balances reduce restocking power.')}
            ${metricCard(effectWarningUrl, 'Penalties', 'Reliability', 'Invalid JSON, impossible plans, fallbacks, and brittle reasoning hurt the run.')}
            ${metricCard(effectRewardUrl, 'Final health', 'Outcome', 'A strong run ends with profit, cash, trust, low waste, high service, and few stockouts.')}
          </div>
        </section>

        <section class="about-theater-section" id="arena">
          <div class="about-section-head about-reveal">
            <span>${PRODUCT_NAME} Arena</span>
            <h2>The benchmark is replayable</h2>
            <p>
              Scores are useful, but replays make model behavior legible. The Arena turns saved backend logs
              into a watchable day: customers ask, shelves respond, trust changes, and reward moves.
            </p>
          </div>
          <div class="about-arena-showcase about-reveal">
            <div class="about-arena-screen" id="about-arena-screen">
              <img id="about-phase-img" src="${morningUrl}" alt="Shop day phase" />
              <div class="about-arena-phases">
                <div class="about-phase-thumb active" data-phase="0"><img src="${morningUrl}" alt="Morning" /></div>
                <div class="about-phase-thumb" data-phase="1"><img src="${afternoonUrl}" alt="Afternoon" /></div>
                <div class="about-phase-thumb" data-phase="2"><img src="${eveningUrl}" alt="Evening" /></div>
              </div>
            </div>
            <div class="about-arena-features">
              ${feature(effectCustomersUrl, 'Customer-by-customer playback', 'Demand bubbles, fulfilled items, misses, payments, and exits animate from saved day logs.')}
              ${feature(robotUrl, 'Model comparison', 'Replay GPT, Gemini, DeepSeek, GLM, Claude, and local baselines on the same 30-day shop world.')}
              ${feature(effectRewardUrl, 'Reward trace', 'Service, inventory, money, relationships, marketing, operations, and penalties come from the backend.')}
              ${feature(effectTrustUrl, 'Trust memory', 'See how stockouts, khata, and regular-customer service compound over the month.')}
            </div>
          </div>
        </section>

        <section class="about-cta about-reveal" id="cta">
          <h2>The goal is bigger than a game</h2>
          <p>
            For researchers, DukaanBench is an agent benchmark with compounding consequences.
            For viewers, it is a readable business game. For kirana owners, it points toward
            AI copilots that can read demand, protect cash, plan offers, and learn from yesterday's sales.
          </p>
          <div class="about-cta-actions">
            <a class="about-btn about-btn-primary about-btn-lg" href="/arena-2">Open AI Arena</a>
            <a class="about-btn about-btn-warm about-btn-lg" href="/play">Try the human game</a>
          </div>
        </section>

        <footer class="about-footer">
          ${PRODUCT_NAME} · ${SHOP_NAME} · OpenEnv-shaped APIs · backend-owned truth · SQLite replays
        </footer>
      </div>
    `;
  }

  private bindNavigation() {
    const nav = this.root.querySelector<HTMLElement>('#about-nav');
    const progress = this.root.querySelector<HTMLElement>('#about-progress');
    const backTop = this.root.querySelector<HTMLButtonElement>('#about-back-top');
    const sectionLinks = this.root.querySelectorAll<HTMLAnchorElement>('.about-nav-sections a[data-section]');
    const sections = ['leaderboard', 'challenge', 'how-it-works', 'system', 'world', 'proof', 'metrics', 'arena', 'cta']
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    const update = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (progress) progress.style.width = `${docHeight > 0 ? (scrollTop / docHeight) * 100 : 0}%`;
      nav?.classList.toggle('is-scrolled', scrollTop > 24);
      backTop?.classList.toggle('visible', scrollTop > 480);

      const marker = scrollTop + 120;
      let activeId = 'hero';
      for (const section of sections) {
        if (section.offsetTop <= marker) activeId = section.id;
      }
      sectionLinks.forEach((link) => {
        link.classList.toggle('active', link.dataset.section === activeId);
      });
    };

    this.scrollListener = update;
    window.addEventListener('scroll', update, { passive: true });
    update();

    backTop?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    sectionLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        const href = link.getAttribute('href');
        if (!href?.startsWith('#')) return;
        const target = document.querySelector<HTMLElement>(href);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', href);
      });
    });
  }

  private bindScrollReveal() {
    const reveals = this.root.querySelectorAll('.about-reveal:not(.visible)');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach((el) => observer.observe(el));
  }

  private renderLeaderboardBlock(): string {
    if (this.scoreboardLoading) {
      return `
        <div class="about-leaderboard-panel about-leaderboard-loading">
          <span class="about-leaderboard-spinner" aria-hidden="true"></span>
          <p>Loading leaderboard…</p>
        </div>
      `;
    }

    if (this.scoreboardError || this.scoreboardRows.length === 0) {
      return `
        <div class="about-leaderboard-panel about-leaderboard-empty">
          <p>${this.scoreboardError ? 'Leaderboard could not load right now.' : 'No completed benchmark runs yet.'}</p>
          <span>Start a run in AI Replay Theatre to populate the board.</span>
        </div>
      `;
    }

    return `
      <div class="about-leaderboard-panel">
        <div class="about-leaderboard-scroll">
          <table class="about-leaderboard-table">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Reward</th>
                <th scope="col">Final Cash</th>
                <th scope="col">Final Trust</th>
                <th scope="col">Profit</th>
                <th scope="col">Sold Units</th>
                <th scope="col">Missed Units</th>
              </tr>
            </thead>
            <tbody>
              ${this.scoreboardRows.map((row, index) => `
                <tr>
                  <td class="about-model-cell">${renderBenchmarkModelCell(row.model, DEFAULT_MODEL_PRESETS, { rank: index + 1 })}</td>
                  <td class="${row.score >= 0 ? 'good' : 'bad'}">${signed(row.score)}</td>
                  <td>${money(row.finalCash)}</td>
                  <td>${row.finalTrust}%</td>
                  <td class="${row.profit >= 0 ? 'good' : 'bad'}">${money(row.profit)}</td>
                  <td>${row.soldUnits.toLocaleString('en-IN')}</td>
                  <td class="${row.missedUnits > 0 ? 'bad' : 'good'}">${row.missedUnits.toLocaleString('en-IN')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  private startPhaseRotation() {
    const phases = [morningUrl, afternoonUrl, eveningUrl];
    const img = this.root.querySelector<HTMLImageElement>('#about-phase-img');
    const thumbs = this.root.querySelectorAll<HTMLElement>('.about-phase-thumb');
    if (!img || thumbs.length === 0) return;

    let index = 0;
    this.phaseTimer = window.setInterval(() => {
      index = (index + 1) % phases.length;
      img.style.opacity = '0';
      window.setTimeout(() => {
        img.src = phases[index];
        img.style.opacity = '1';
        thumbs.forEach((thumb, i) => thumb.classList.toggle('active', i === index));
      }, 280);
    }, 4000);

    img.style.transition = 'opacity 0.35s ease';

    thumbs.forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        index = i;
        img.style.opacity = '0';
        window.setTimeout(() => {
          img.src = phases[index];
          img.style.opacity = '1';
          thumbs.forEach((t, j) => t.classList.toggle('active', j === index));
        }, 200);
      });
    });
  }
}

function bentoCard(icon: string, title: string, body: string, variant: string, delay: number) {
  const variantClass = variant ? ` ${variant}` : '';
  return `
    <article class="about-bento-card${variantClass} about-reveal ${delay > 0 ? `about-reveal-delay-${Math.min(delay, 3)}` : ''}">
      <img class="about-bento-icon" src="${icon}" alt="" />
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function term(label: string, value: string) {
  return `<div class="about-term"><em>${escapeHtml(label)}</em><strong>${escapeHtml(value)}</strong></div>`;
}

function systemCard(index: string, title: string, body: string) {
  return `
    <article class="about-system-card">
      <span>${escapeHtml(index)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function metricCard(icon: string, title: string, label: string, body: string) {
  return `
    <article class="about-metric-card">
      <img src="${icon}" alt="" />
      <div>
        <span>${escapeHtml(label)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
      </div>
    </article>
  `;
}

function segment(icon: string, title: string, body: string) {
  return `
    <div class="about-segment">
      <img src="${icon}" alt="" />
      <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>
    </div>
  `;
}

function feature(icon: string, title: string, body: string) {
  return `
    <div class="about-feature">
      <img src="${icon}" alt="" />
      <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
