import './about.css';
import { PRODUCT_NAME, PRODUCT_TAGLINE, SHOP_NAME, SHOP_LOCATION } from '../constants/brand';
import { DEFAULT_NEIGHBORHOOD_PROFILE } from '../constants/neighborhood';
import {
  DEFAULT_MODEL_PRESETS,
  dedupeScoreboardRows,
  modelLabel,
  requestJson,
  signed,
} from '../arena/arena-shared';
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
      const response = await requestJson<ArenaScoreboardResponse>('/api/arena/scoreboard?limit=12');
      this.scoreboardRows = dedupeScoreboardRows(response.rows);
      this.scoreboardError = false;
    } catch {
      this.scoreboardRows = [];
      this.scoreboardError = true;
    } finally {
      this.scoreboardLoading = false;
      const mount = this.root.querySelector('#about-leaderboard-mount');
      if (mount) {
        mount.innerHTML = this.renderLeaderboardBlock();
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
              <a href="#top">
                <strong>${PRODUCT_NAME}</strong>
                <span>${PRODUCT_TAGLINE}</span>
              </a>
            </div>
            <div class="about-nav-sections">
              <a href="#leaderboard" data-section="leaderboard">Leaderboard</a>
              <a href="#challenge" data-section="challenge">Challenge</a>
              <a href="#how-it-works" data-section="how-it-works">Loop</a>
              <a href="#system" data-section="system">Harness</a>
              <a href="#world" data-section="world">World</a>
              <a href="#proof" data-section="proof">Proof</a>
              <a href="#metrics" data-section="metrics">Metrics</a>
              <a href="#arena" data-section="arena">Arena</a>
            </div>
            <div class="about-nav-cta">
              <a class="about-btn about-btn-primary" href="/arena-2">AI Replay Theatre</a>
            </div>
          </div>
        </nav>

        <button class="about-back-top" id="about-back-top" type="button" aria-label="Back to top">↑</button>

        <header class="about-hero" id="hero">
          <div class="about-hero-grid">
            <div class="about-hero-copy about-reveal visible">
              <span class="about-eyebrow">
                <span class="about-eyebrow-dot" aria-hidden="true"></span>
                ${PRODUCT_NAME} · ${PRODUCT_TAGLINE}
              </span>
              <h1>Can an AI run a <em>kirana</em> for 30 days?</h1>
              <p class="about-hero-lead">
                ${PRODUCT_NAME} is a business-operator benchmark where LLMs run ${SHOP_NAME},
                a fixed Indian kirana on ${SHOP_LOCATION}. One JSON plan per day.
                The simulator decides what customers actually do.
              </p>
              <div class="about-hero-stats">
                <div class="about-stat"><strong>30</strong><span>Day episodes</span></div>
                <div class="about-stat"><strong>1</strong><span>JSON plan / day</span></div>
                <div class="about-stat"><strong>${households}</strong><span>Homes in catchment</span></div>
                <div class="about-stat"><strong>7</strong><span>Reward buckets</span></div>
              </div>
            </div>
            <div class="about-hero-leaderboard about-reveal visible" id="leaderboard">
              <div class="about-section-head about-hero-leaderboard-head">
                <span>Live benchmark</span>
                <h2>Model leaderboard</h2>
                <p>Completed 30-day runs on the same ${SHOP_NAME} world — ranked by final backend score.</p>
              </div>
              <div id="about-leaderboard-mount">
                ${this.renderLeaderboardBlock()}
              </div>
              <div class="about-home-cta">
                <a class="about-btn about-btn-primary about-btn-lg" href="/arena-2">Watch AI Replay Theatre</a>
                <p>Replay saved runs, watch customers walk in, and see how each model’s nightly JSON plan scored.</p>
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
            This is not a chatbot wearing a shop skin.
            <em>It is a measurable test</em> of whether an AI can operate under cash pressure,
            uncertain demand, perishable stock, informal credit, marketing choices, and customer trust —
            one shop day at a time.
          </p>
        </section>

        <section class="about-section about-section--alt" id="challenge">
          <div class="about-section-head about-reveal">
            <span>The operating reality</span>
            <h2>Why kirana is a hard AI problem</h2>
            <p>
              A real shopkeeper juggles cash, relationships, waste, weather, school timings,
              and impulse commuters — often with incomplete information and no undo button.
            </p>
          </div>
          <div class="about-bento">
            ${bentoCard(effectWarningUrl, 'Thin margins', 'Too little stock loses trust. Too much becomes waste. Every order ties up cash you may not get back today.', 'featured', 0)}
            ${bentoCard(effectKhataUrl, 'Informal credit', 'Khata keeps relationships alive, but unpaid credit reduces usable cash for tomorrow\'s restock.', 'wide', 1)}
            ${bentoCard(effectCustomersUrl, 'Neighborhood rhythm', 'Families, students, commuters, and walk-ins peak at different hours. One plan must serve all waves.', '', 2)}
            ${bentoCard(effectTrustUrl, 'Trust is inventory', 'Miss milk once and a regular may forgive you. Miss it three days and they switch shops.', '', 3)}
            ${bentoCard(effectCashUrl, 'Marketing vs stock', 'A loud offer without shelf stock damages reputation faster than no offer at all.', 'wide', 1)}
            ${bentoCard(effectRewardUrl, 'Measurable proof', 'Every AI decision is validated, simulated, scored, and saved — no invented metrics, no hidden truth.', '', 2)}
          </div>
        </section>

        <section class="about-section" id="how-it-works">
          <div class="about-section-head about-reveal">
            <span>The evaluation loop</span>
            <h2>One episode. One step per day. One real reward.</h2>
            <p>
              The AI does not puppet customers directly. It submits a shopkeeper plan.
              The backend simulates who walks in, what sells, what misses, and how trust moves.
            </p>
          </div>
          <div class="about-loop-layout about-reveal">
            <div class="about-timeline">
              <div class="about-timeline-step">
                <strong>Step 01</strong>
                <h3>Observe</h3>
                <p>Weather, events, inventory, trust, cash, khata, and active marketing campaigns.</p>
              </div>
              <div class="about-timeline-step">
                <strong>Step 02</strong>
                <h3>Decide</h3>
                <p>One JSON action: supplier orders, discounts, khata limits, and marketing picks.</p>
              </div>
              <div class="about-timeline-step">
                <strong>Step 03</strong>
                <h3>Simulate</h3>
                <p>Customers visit. Shelves move. Payments land. Waste accrues. Trust shifts.</p>
              </div>
              <div class="about-timeline-step">
                <strong>Step 04</strong>
                <h3>Score</h3>
                <p>Reward after real visits — service rate, money, relationships, and marketing ROI.</p>
              </div>
            </div>
            <aside class="about-loop-aside about-reveal about-reveal-delay-1">
              <h3>OpenEnv-shaped, backend-owned</h3>
              <p>
                The model sees signals and constraints. The simulator tests whether the plan survives contact with customers.
                Every step is saved to SQLite for replay and fair model comparison.
              </p>
              <div class="about-terms">
                ${term('Episode', '30-day kirana run')}
                ${term('Step', '1 shop day')}
                ${term('Action', 'Pre-day JSON')}
                ${term('Reward', 'Backend score')}
                ${term('Proof', 'SQLite replay')}
              </div>
            </aside>
          </div>
        </section>

        <section class="about-section about-section--alt" id="system">
          <div class="about-section-head about-reveal">
            <span>The harness</span>
            <h2>How an LLM becomes the shopkeeper</h2>
            <p>
              ${PRODUCT_NAME} is built like an agent environment: the model observes a compact business state,
              emits an action JSON, then the backend runs the day and returns reward.
            </p>
          </div>
          <div class="about-system-grid about-reveal">
            ${systemCard('01', 'World generator', 'Fixed neighborhood, day-of-week, weather, events, schools, societies, commuters, and customer segments.')}
            ${systemCard('02', 'Observation packet', 'Cash, trust, shelf stock, perishability, khata, active marketing, recent history, and fair planning signals.')}
            ${systemCard('03', 'Action contract', 'The AI must emit executable JSON: orders, discounts, marketing campaigns, khata reminders, and cash reserve.')}
            ${systemCard('04', 'Validation layer', 'Malformed JSON, impossible orders, over-budget plans, and rationale/action mismatches are caught before simulation.')}
            ${systemCard('05', 'Simulation engine', 'Customers arrive, ask for baskets, pay cash or khata, face stockouts, and update relationship memory.')}
            ${systemCard('06', 'Replay database', 'SQLite stores runs, day results, decisions, provider responses, retries, fallbacks, and replay timelines.')}
          </div>
        </section>

        <section class="about-section about-section--alt" id="world">
          <div class="about-section-head about-reveal">
            <span>Fixed test world</span>
            <h2>${escapeHtml(SHOP_NAME)} · ${escapeHtml(profile.name)}</h2>
            <p>
              Every model in ${PRODUCT_NAME} faces the same fictional neighborhood — ${profile.shopLocation.catchmentRadiusMeters}m catchment,
              ${societies.length} societies, ${school?.population ?? 0} school students,
              and ${profile.commuteFlow.dailyPassersby.toLocaleString('en-IN')} road passers per day.
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
            <span>What we prove</span>
            <h2>AI plans vs backend reality</h2>
            <p>The model sees signals and constraints. The simulator tests whether the plan survives contact with customers.</p>
          </div>
          <div class="about-proof-grid about-reveal">
            <div class="about-proof-panel ai">
              <h3>What the AI receives</h3>
              <ul>
                <li>Day, cash, trust, and cumulative score</li>
                <li>Inventory on shelf and in storage</li>
                <li>Weather forecast and today's event window</li>
                <li>Neighborhood places, segments, and demand signals</li>
                <li>Active marketing, khata exposure, recent day history</li>
                <li>Per-product service rates and waste risk</li>
              </ul>
            </div>
            <div class="about-proof-panel sim">
              <h3>What the backend tests</h3>
              <ul>
                <li>Do customers actually visit and buy?</li>
                <li>Which requests are fulfilled, partial, or missed?</li>
                <li>How much revenue, khata, and waste result?</li>
                <li>Does trust rise or fall — and why?</li>
                <li>How is the day scored across service, money, relationships?</li>
                <li>Is every decision saved for replay and model comparison?</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="about-section about-section--alt" id="metrics">
          <div class="about-section-head about-reveal">
            <span>Good, bad, ugly</span>
            <h2>What makes an AI shopkeeper win or lose?</h2>
            <p>
              The score is not a single profit number. A model can make cash and still fail if it trains customers
              to stop trusting the shop.
            </p>
          </div>
          <div class="about-metric-board about-reveal">
            ${metricCard(effectRewardUrl, 'Service', 'Good', 'Fulfill demand, especially essentials like milk, bread, eggs, and cold drinks during heat.')}
            ${metricCard(effectCashUrl, 'Money', 'Good', 'Grow revenue and profit while keeping enough cash for tomorrow\'s correction order.')}
            ${metricCard(effectWarningUrl, 'Inventory', 'Bad', 'Stockouts, missed demand, and overbuying perishables punish short-term thinking.')}
            ${metricCard(effectTrustUrl, 'Relationships', 'Ugly', 'Repeated misses for regulars reduce future visits. Trust is the long-term moat.')}
            ${metricCard(effectCustomersUrl, 'Marketing', 'Conditional', 'Campaigns score only when promoted demand can actually be served profitably.')}
            ${metricCard(effectKhataUrl, 'Khata', 'Risk', 'Credit can protect loyalty, but unpaid balance weakens restocking power.')}
            ${metricCard(effectWarningUrl, 'Penalties', 'Ugly', 'Invalid actions, over-budget plans, fallbacks, and brittle JSON hurt the benchmark record.')}
            ${metricCard(effectRewardUrl, 'Final health', 'Outcome', 'A strong run ends with profit, cash, trust, low waste, high service, and few stockouts.')}
          </div>
        </section>

        <section class="about-theater-section" id="arena">
          <div class="about-section-head about-reveal">
            <span>${PRODUCT_NAME} Arena</span>
            <h2>Watch the proof, don't just read the score</h2>
            <p>
              The arena theatre replays saved backend results: customers walk in, items move along the counter,
              thought bubbles show demand, and reward breakdowns come from real simulation output.
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
              ${feature(effectCustomersUrl, 'Live customer replay', 'Visits, demand bubbles, and handoffs animate from saved day logs — not invented UI.')}
              ${feature(robotUrl, 'Model vs heuristic', 'Compare GPT, Gemini, DeepSeek, GLM, and a built-in baseline on the same 30-day world.')}
              ${feature(effectRewardUrl, 'Reward breakdown', 'Service, inventory, money, relationships, marketing — scored by the real backend.')}
              ${feature(effectTrustUrl, 'Trust & khata tracking', 'See how credit decisions and stockouts ripple through the neighborhood.')}
            </div>
          </div>
        </section>

        <section class="about-cta about-reveal" id="cta">
          <h2>The goal is bigger than a game</h2>
          <p>
            Kirana owners make dozens of hard calls every day with thin margins and incomplete information.
            If AI can operate this shop well, it may one day help real shopkeepers read demand,
            protect cash, and learn from yesterday's sales — not replace them.
          </p>
          <div class="about-cta-actions">
            <a class="about-btn about-btn-primary about-btn-lg" href="/arena-2">Watch AI Replay Theatre</a>
          </div>
        </section>

        <footer class="about-footer">
          ${PRODUCT_NAME} · Test shop ${SHOP_NAME} · OpenEnv-compatible · Backend-owned truth · SQLite replays
        </footer>
      </div>
    `;
  }

  private bindNavigation() {
    const nav = this.root.querySelector<HTMLElement>('#about-nav');
    const progress = this.root.querySelector<HTMLElement>('#about-progress');
    const backTop = this.root.querySelector<HTMLButtonElement>('#about-back-top');
    const sectionLinks = this.root.querySelectorAll<HTMLAnchorElement>('.about-nav-sections a[data-section]');
    const sections = ['leaderboard', 'challenge', 'how-it-works', 'world', 'proof', 'arena', 'cta']
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
          <p>Loading benchmark runs from SQLite…</p>
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
        <table class="about-leaderboard-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Model</th>
              <th scope="col">Score</th>
              <th scope="col">Trust</th>
              <th scope="col">Days</th>
            </tr>
          </thead>
          <tbody>
            ${this.scoreboardRows.map((row, index) => `
              <tr>
                <td><span class="about-leaderboard-rank">${index + 1}</span></td>
                <td><strong>${escapeHtml(modelLabel(row.model, DEFAULT_MODEL_PRESETS))}</strong></td>
                <td class="${row.score >= 0 ? 'good' : 'bad'}">${signed(row.score)}</td>
                <td>${row.finalTrust}%</td>
                <td>${row.daysCompleted}/30</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
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
