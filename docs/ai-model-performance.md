# AI Model Performance Ledger

This file records AI Arena benchmark results for Shree Shyam Bhandar. Keep adding new runs here so model comparisons are not lost in chat history.

## Benchmark Rules

- One episode is one full 30-day game.
- One step is one in-game day.
- Each model receives the same backend observation contract for its profile.
- Runs below used temporary local SQLite databases and did not touch the live game DB.
- Scores are not perfectly comparable across different arena profiles. Compare models within the same profile first.
- For new persisted Arena jobs, use `GET /api/arena/scoreboard` as the source of truth for comparable metrics. This ledger should add interpretation and notable run notes, not replace the generated scoreboard.
- A replay should be called a 30-day benchmark only when the saved run has `status=complete` and `daysCompleted=30`.

## Benchmark Interpretation Finding

Gemma's strong showing does not mean a smaller model is broadly smarter than larger models. It shows that the current arena heavily rewards reliable structured execution.

The current game is still a compact numeric control problem: 7 SKUs, visible stock, visible recent sold/missed demand, base demand, margins, shelf life, weather, and cash. A disciplined policy that restocks missed demand, keeps buffer cash, avoids obvious perishable waste, and emits valid JSON can score very well.

This makes smaller literal models competitive because:

- They often follow the action schema more consistently.
- They avoid long rationales that drift away from the actual JSON.
- They do not overcomplicate campaign or discount decisions.
- They can exploit the visible base-demand and recent-missed-demand signals.

The latest runs confirm this distinction:

- `google/gemma-4-26b-a4b-it` is a strong practical baseline because it is fast, stable, and usually emits valid actions.
- `qwen/qwen3.7-plus` slightly beat Gemma in the same parallel profile and had zero retries, so Gemma is not the absolute top model.
- `minimax/minimax-m3` gave richer business rationales, but repeatedly mentioned campaigns without sending `marketingActions`, so the simulator could not credit that intent.
- `google/gemini-3.1-flash-lite` was extremely fast and profitable in the first challenge run, but mentioned campaigns in every rationale while sending no campaign actions.
- After action/rationale validation, `google/gemini-3.1-flash-lite` did emit real marketing on `19/30` days and reduced the campaign-intent gap to `0`, but it then failed repeatedly on discount execution.
- After discount parser and sentence-scoped validator fixes, `google/gemini-3.1-flash-lite` reached `+1141` with only one malformed-JSON retry and no campaign/discount/khata action mismatches.
- `nvidia/nemotron-3-ultra-550b-a55b` has the highest raw score so far, but the run was fallback-assisted.

This means the arena is useful, but it is currently better at measuring **shopkeeping action discipline** than broad strategic intelligence.

To make future comparisons more serious:

- Run multiple seeded episodes per model, not single runs.
- Report separate leaderboards for raw reward, business health, reliability, and terminal trust.
- Add a stronger terminal penalty for trust collapse and regular-customer loss.
- Keep action/rationale validation enabled when a model claims a campaign, khata reminder, or discount.
- Hide or soften `baseDemand` so the model must infer demand from history and environment signals.
- Give marketing and relationship recovery enough weight that ignoring them cannot still look like a near-win.
- Compare models under the same transport profile whenever possible.

## Fresh Scoreboard: Responses + World Context

This section resets comparison after the major arena changes: OpenRouter Responses API for GPT 5.4/5.5 family models, stricter action/rationale validation, fixed neighborhood world context, updated trust/customer simulation, and marketing-aware scoring.

The GPT 5.5 and Gemma 4 31B rows used the same compact JSON-focused reset profile:

- Date: 2026-06-24
- Episode length: 30 days
- Observation mode: compact
- Response mode: JSON schema
- Temperature: 0.15
- Timeout: 240s per day call
- Max output tokens: 5000
- Local backend: Fastify/SQLite arena runner

| Model | OpenRouter id | Transport | Reward | Final cash | Final trust | Profit | Revenue | Sold units | Missed units | Stockouts | Waste loss | Retries | Fallbacks | Latency | Run id | Diagnosis |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| GPT 5.5 | `openai/gpt-5.5` | Responses API, medium reasoning, strict schema | `+2136` | `₹39,071` | `100` | `₹51,552` | `₹241,750` | `7,941` | `233` | `37` | `₹0` | `2` | `1` | Avg 63s, max 150s | `c3b4bec9-e0ff-4b09-8cfd-1ad034aa072a` | Strongest clean strategic run after the new world context. It reached 100 trust by mid-game, kept waste at zero, and used marketing throughout. The only fallback happened on Day 30 after a rationale/action mismatch about chips and cold drinks. |
| Gemini 3.1 Pro | `google/gemini-3.1-pro-preview` | Responses API `json_object`, high reasoning, compact observation | `+2064` | `₹45,869` | `97` | `₹47,506` | `₹227,539` | `7,558` | `274` | `43` | `₹0` | `8` | `0` | Avg 22.9s, max 40.9s | `91dd17a6-609c-4429-851f-956b324b37ff` | Transport fix turned Gemini Pro into a top-tier run. Strict Responses schema failed on Google's nested product-map schema, so the successful run used Responses `json_object` plus backend validation. It reached `96.5%` service, zero waste, high marketing score, and retained `97` trust with no fallbacks. |
| Claude Opus 4.8 | `anthropic/claude-opus-4.8` | Responses API `json_object`, high reasoning, compact observation | `+1773` | `₹46,440` | `99` | `₹47,544` | `₹222,000` | `7,305` | `473` | `49` | `₹0` | `2` | `0` | Avg 27.8s, max 43.1s | `9f16faf4-e6f6-4f82-9f09-2760f7338aa6` | Strong rerun after campaign-validation fixes. It completed 30 days with zero fallback days, high trust, zero waste, `93.9%` service, and `13.1x` marketing ROI. Two retries remained from active-campaign wording edge cases. Recorded OpenRouter cost was about `$2.54`. |
| Gemini 3.1 Flash Lite | `google/gemini-3.1-flash-lite` | Chat Completions text JSON, reasoning off, compact observation | `+1581` | `₹34,760` | `90` | `₹38,848` | `₹190,663` | `6,327` | `583` | `51` | `₹700` | `4` | `0` | Avg 2.5s, max 4.2s | `992b28d4-0bcc-40f7-99a8-d572f1bc4407` | Strong fast baseline on the current engine. It completed 30 days with no fallbacks, kept trust high, ran marketing every day, and scored far above earlier Gemini runs. Not a strict transport match with GPT/Gemma because it used text JSON parsing instead of strict schema. |
| Grok 4.3 | `x-ai/grok-4.3` | Responses API `json_object`, high reasoning, compact observation | `+1125` | `₹34,353` | `29` | `₹35,075` | `₹166,980` | `5,640` | `750` | `72` | `₹0` | `0` | `0` | Avg 41.5s, max 79s | `bbc2a6ef-7419-4341-9006-e6231fc59971` | Strong transport result: zero retries, zero fallbacks, and valid Responses JSON-object all 30 days. Business result was mid-table because it made cash but allowed frequent stockouts and trust fell to `29`. |
| Gemma 4 31B | `google/gemma-4-31b-it` | Chat Completions `json_object`, medium reasoning | `+1071` | `₹33,231` | `58` | `₹36,875` | `₹176,434.50` | `5,963` | `710` | `68` | `₹0` | `2` | `0` | Avg 55s, max 117s | `ffaaf6aa-0fec-4746-8a92-3e96d328abe9` | Reliable JSON in `json_object` mode, but strategically weaker. It made money and had no fallbacks, yet repeated stockout/trust collapses kept the final score far below GPT 5.5. |
| GLM 5.2 | `z-ai/glm-5.2` | Chat Completions strict schema, `xhigh` reasoning, compact observation | `+515` | `₹29,028` | `0` | `₹27,953` | `₹139,291` | `4,701` | `825` | `104` | `₹0` | `1` | `0` | Avg 38.9s, max 138.9s | `20442bac-dec2-475d-9fff-200174f4debe` | Technically clean at max reasoning: one retry, zero fallbacks, and strong marketing score. Strategically it under-served essentials/perishables too often, had stockouts on 27 days, and trust collapsed to zero. |
| Sarvam 105B | `sarvam-105b` | Sarvam Chat Completions `json_object`, high reasoning, compact observation | `+350` | `₹30,899` | `6` | `₹31,075` | `₹152,269` | `5,105` | `1,136` | `90` | `₹0` | `6` | `0` | Avg 35.4s, max 74.1s | `828410a9-b7e8-4a21-8e34-3d2a35f1dd69` | Sarvam API integration worked and the run was mostly transport-stable. It beat Qwen on reward and service, used marketing every day, and avoided waste, but stockouts stayed high and trust collapsed to `6`. |
| Qwen 3.7 Max | `qwen/qwen3.7-max` | Chat Completions `json_object`, reasoning off, compact observation | `+275` | `₹28,731` | `10` | `₹28,524` | `₹136,921` | `4,570` | `1,155` | `94` | `₹0` | `1` | `0` | Avg 42.3s, max 66.9s | `01d3c772-6cba-47a3-b676-58cd5fff2643` | Transport-stable but strategically weak. It produced valid actions through the run, but served only `79.8%` of demand, missed essentials repeatedly, and let trust collapse to `10`. |

Compatibility note: Gemma 4 31B was first smoke-tested under the same strict JSON-schema profile as GPT 5.5. That route returned no message content twice and fell back on Day 1, so the full Gemma run used the closest compatible profile: compact observation, Chat Completions `json_object`, medium reasoning, 5000 output tokens, 240s timeout.

Gemini 3.1 Flash Lite was run as a current-engine practical baseline with compact observation, text JSON parsing, reasoning off, 16000 max output tokens, 15-minute timeout, and temperature `0.15`. It should be compared as a fast action-execution baseline rather than as a strict-schema reasoning run.

Qwen 3.7 Max was run as a lower-cost high-intelligence candidate after DeepSeek V4 Pro showed strict-schema transport problems. It used compact observation, Chat Completions `json_object`, reasoning off, 8000 output tokens, 15-minute timeout, and temperature `0.15`. The run had clean transport, but its service policy was too thin for the fixed-world trust engine.

Sarvam 105B used Sarvam's own OpenAI-compatible Chat Completions endpoint, not OpenRouter. The request used compact observation, `json_object`, `reasoning_effort: "high"` (Sarvam's highest documented reasoning setting), 4096 max output tokens because this API key is on the Starter tier, 15-minute timeout, and temperature `0.15`. A strict-schema smoke run failed because 16000 tokens exceeded the Starter tier cap; a 1-day strict-schema rerun then hit an action/rationale mismatch, so the full benchmark used the working JSON-object profile.

Gemini 3.1 Pro now uses OpenRouter Responses with `responseMode=json_object` and `reasoning.effort: "high"`. OpenRouter maps Gemini 3 reasoning to Google's `thinkingLevel`; `xhigh` is mapped down to `high`, so the run used `high` directly. A strict Responses schema smoke run failed because Google rejected the nested product-map `required` keys, so the compatible profile is Responses JSON-object plus backend validation and retry.

Grok 4.3 was run after changing the max-capability OpenRouter default to persisted async arena jobs with Responses transport. OpenRouter's model catalog reports `x-ai/grok-4.3` with reasoning efforts `high`, `medium`, `low`, and `none`; the benchmark used `high` reasoning, 16000 max output tokens, 15-minute timeout, seed `20260624`, and Responses `json_object`. The result is a useful harness signal: the transport was clean for all 30 days, but the model still needs better trust-preserving stock policy.

Claude Opus 4.8 was rerun after fixing campaign-validation false positives that had punished references to already active campaigns. The benchmark used compact observation, OpenRouter Responses `json_object`, high reasoning, 4096 max output tokens, 15-minute timeout, seed `20260624`, and temperature `0.15`. It completed all 30 days with no fallback days, `2` validation retries, and recorded provider usage of `192,735` input tokens, `62,957` output tokens, `13,665` reasoning tokens, and about `$2.54` OpenRouter cost. The result is now a valid current benchmark, though active-campaign wording should still be tightened before larger expensive batches.

Product service rates:

| Model | Milk | Bread | Eggs | Maggi | Chips | Cold drinks | Bananas |
|---|---:|---:|---:|---:|---:|---:|---:|
| GPT 5.5 | 94.1% | 97.3% | 99.7% | 99.4% | 99.9% | 98.0% | 90.3% |
| Gemini 3.1 Pro | 95.0% | 95.7% | 98.6% | 96.7% | 97.8% | 96.9% | 97.2% |
| Claude Opus 4.8 | 92.4% | 92.8% | 98.0% | 94.4% | 95.0% | 93.0% | 96.3% |
| Gemini 3.1 Flash Lite | 89.5% | 91.6% | 99.5% | 94.0% | 88.8% | 88.6% | 97.1% |
| Grok 4.3 | 82.7% | 89.7% | 98.7% | 92.0% | 87.9% | 87.8% | 81.1% |
| Gemma 4 31B | 89.0% | 92.4% | 87.2% | 90.0% | 89.1% | 87.6% | 94.4% |
| GLM 5.2 xhigh | 79.3% | 88.5% | 91.7% | 88.0% | 86.7% | 85.8% | 76.6% |
| Sarvam 105B | 79.5% | 83.9% | 93.3% | 84.2% | 80.3% | 76.3% | 85.4% |
| Qwen 3.7 Max | 77.2% | 80.2% | 81.1% | 83.7% | 81.7% | 77.8% | 80.9% |

Interpretation:

- GPT 5.5 remains the strongest strategic run in this block: highest reward, final trust capped at `100`, zero waste, and the lowest missed units.
- Gemini 3.1 Pro is the closest high-reasoning challenger in raw reward and service: `+2064`, final trust `97`, zero waste, and `96.5%` service, but it needed `8` validation retries.
- Claude Opus 4.8 is now a strong premium reasoning benchmark after the campaign-validator fix: `+1773`, final trust `99`, zero fallbacks, zero waste, and `13.1x` marketing ROI, but at materially higher cost than most runs.
- Gemini 3.1 Flash Lite is now the best fast practical baseline. It reached `+1581` with `90` trust, no fallbacks, `4` retries, average latency around `2.5s`, and marketing active on every day. Its main weaknesses versus GPT 5.5 were more missed units, lower milk/cold-drink service, and `₹700` waste loss.
- Gemma 4 31B remained transport-reliable in `json_object` mode, but its service gaps hurt trust. Its final trust was `58` versus GPT's capped `100`.
- GLM 5.2 with `xhigh` reasoning was format-reliable and cleaner than older GLM attempts, but the business result was only mid-table: `+515`, final trust `0`, `825` missed units, and stockouts on `27/30` days.
- Grok 4.3 is the cleanest new transport check: `0` retries and `0` fallbacks through Responses `json_object`. It beat Gemma on raw reward by a small margin, but not on trust; `25/30` stockout days and weak milk/banana service held it back.
- Sarvam 105B is a usable direct-provider benchmark path. It was more reliable than DeepSeek and stronger than Qwen on reward/service, but not strong enough on trust: `81.8%` service, `90` stockout incidents, and final trust `6`.
- Qwen 3.7 Max was format-reliable but not business-reliable. It ended at only `+275` because product service stayed around `80%` across most SKUs and trust fell to `10`, despite positive cash and zero waste.
- Profile differences still matter: Gemini's score is a fair current-engine result, but not a strict transport match against the GPT/Gemma reset rows.

## Full 30-Day Runs

| Date | Model | Arena profile | Reward | Final cash | Final trust | Profit | Revenue | Sold units | Missed units | Fallbacks | Latency note | Summary |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 2026-06-25 | `anthropic/claude-opus-4.8` | Fixed campaign-validation rerun: compact observation, Responses `json_object`, high reasoning, 4096 tokens, 15m timeout, seed `20260624` | `+1773` | `₹46,440` | `99` | `₹47,544` | `₹222,000` | `7,305` | `473` | `0/30`, `2` retries | Avg ~27.8s, max ~43.1s | Clean full benchmark after the active-campaign validator fix. It reached `93.9%` service, zero waste, marketing score `+213`, `13.1x` marketing ROI, and final trust `99`. Cost was about `$2.54`; two retries came from remaining active-campaign wording edge cases, but no fallback action was used. |
| 2026-06-24 | `google/gemini-3.1-pro-preview` | Responses compatibility fix: compact observation, Responses `json_object`, high reasoning, 16000 tokens, 15m timeout, seed `20260624` | `+2064` | `₹45,869` | `97` | `₹47,506` | `₹227,539` | `7,558` | `274` | `0/30`, `8` retries | Avg ~22.9s, max ~40.9s | Strong rerun after moving Gemini Pro away from strict Responses schema. It reached `96.5%` service, zero waste, marketing score `+220`, and retained trust at `97`. Total recorded OpenRouter cost was about `$1.21`, with `72,488` reasoning tokens. |
| 2026-06-25 | `x-ai/grok-4.3` | Responses default check: compact observation, Responses `json_object`, high reasoning, 16000 tokens, 15m timeout, seed `20260624` | `+1125` | `₹34,353` | `29` | `₹35,075` | `₹166,980` | `5,640` | `750` | `0/30`, `0` retries | Avg ~41.5s, max ~79s | Transport and parsing were excellent: zero retries/fallbacks, finish reason `completed`, and about `$0.35` recorded OpenRouter cost with `78,371` reasoning tokens. Strategy was only mid-table: service rate `88.3%`, stockouts on `25/30` days, and final trust `29`. |
| 2026-06-24 | `z-ai/glm-5.2` | Max reasoning test: compact observation, strict JSON schema, `xhigh` reasoning, 16000 tokens, 15m timeout, seed `20260624` | `+515` | `₹29,028` | `0` | `₹27,953` | `₹139,291` | `4,701` | `825` | `0/30`, `1` retry | Avg ~38.9s, max ~138.9s | Clean structured execution with no fallbacks and marketing active on `29/30` days. Not strategically competitive with GPT/Gemini: service rate `85.1%`, stockouts on `27/30` days, and trust collapsed late. |
| 2026-06-24 | `sarvam-105b` | Direct Sarvam API: compact observation, Chat Completions `json_object`, `reasoning_effort=high`, 4096 tokens, 15m timeout | `+350` | `₹30,899` | `6` | `₹31,075` | `₹152,269` | `5,105` | `1,136` | `0/30`, `6` retries | Avg ~35.4s, max ~74.1s | Direct Sarvam integration worked. Better than Qwen on score and service, but not competitive with Gemini/GPT because stockouts remained frequent and trust collapsed late. Marketing ran every day with `+115` marketing score and `~7.4x` proxy ROI. |
| 2026-06-24 | `qwen/qwen3.7-max` | Current high-intelligence low-cost candidate: compact observation, Chat Completions `json_object`, reasoning off, 8000 tokens, 15m timeout | `+275` | `₹28,731` | `10` | `₹28,524` | `₹136,921` | `4,570` | `1,155` | `0/30`, `1` retry | Avg ~42.3s, max ~66.9s | Technically clean but strategically weak. It used marketing and avoided waste, but understocked too often, served only `79.8%` of demand, and lost trust late in the run. |
| 2026-06-24 | `google/gemini-3.1-flash-lite` | Current fast practical baseline: compact observation, text JSON parsing, reasoning off, 16000 tokens, 15m timeout | `+1581` | `₹34,760` | `90` | `₹38,848` | `₹190,663` | `6,327` | `583` | `0/30` | Avg ~2.5s, max ~4.2s; `4` retries | Strongest Gemini Flash Lite run so far and the best current fast baseline. It used marketing all 30 days, kept trust high, and had no fallbacks. Early over-budget retries remained, and waste loss reached `₹700`, but the run is clean enough for baseline comparison. |
| 2026-06-21 | `deepseek/deepseek-v4-flash` | Fast compact JSON schema, reasoning off, 1000 tokens, 90s timeout | `-771` | `₹14,845` | `0` | `₹12,592` | `₹59,475` | `2,046` | `2,263` | `12/30` | Real calls avg ~18.1s | Cheap but unreliable. Many empty/malformed outputs and fallback days; trust collapsed early. |
| 2026-06-21 | `z-ai/glm-5.2` | Compact text JSON parsing, reasoning off, 1600 tokens, 90s timeout | `-147` | `₹18,877` | `0` | `₹18,302` | `₹84,827` | `2,822` | `1,289` | `11/30` | Real calls avg ~40.9s | Better strategy than DeepSeek, but many empty responses/fallbacks. |
| 2026-06-21 | `google/gemma-4-26b-a4b-it` | Compact text JSON parsing, reasoning off, 1600 tokens, 90s timeout | `+1135` | `₹26,159` | `1` | `₹28,142` | `₹129,168` | `4,213` | `339` | `0/30` | Avg ~6.5s, max ~20.2s | Best current cheap baseline. Strong inventory service and no fallback days; trust still decayed. |
| 2026-06-21 | `z-ai/glm-5.2` | Balanced max-capability: compact strict JSON schema, `require_parameters`, medium reasoning, 16000 tokens, 15m timeout | `+492` | `₹27,602` | `0` | `₹24,939` | `₹122,404` | `4,050` | `726` | `2/30` | Avg ~50.6s, median ~44.4s, max successful ~201.9s | Medium reasoning fixed most GLM reliability problems and produced strong cash/profit. Still weaker than Gemma and still lost trust. |
| 2026-06-21 | `nvidia/nemotron-3-ultra-550b-a55b` | Max-capability text JSON: schema disabled, medium reasoning, 16000 tokens, 15m timeout | `+1155` | `₹25,910` | `2` | `₹28,604` | `₹138,862` | `4,583` | `537` | `5/30` | Avg successful ~50.1s, median ~55.9s, max ~116.2s; full run ~33m | Highest reward so far, but fallback-assisted. Strict schema arena call returned no content; text JSON worked. No marketing use and trust still collapsed. |
| 2026-06-21 | `google/gemma-4-26b-a4b-it` | Parallel compact text v2: schema disabled, reasoning off, 2000 tokens, 180s timeout | `+1089` | `₹24,890` | `0` | `₹27,171` | `₹124,747.50` | `4,053` | `484` | `1/30` | Avg successful ~5.6s, max ~11.1s | Fastest practical contender in the parallel batch. Good product service, but trust still collapsed and marketing score stayed `0`. |
| 2026-06-21 | `qwen/qwen3.7-plus` | Parallel compact text v2: schema disabled, reasoning off, 2000 tokens, 180s timeout | `+1117` | `₹25,723` | `0` | `₹27,817` | `₹127,440` | `4,154` | `356` | `0/30` | Avg ~60.0s, max ~139.7s | Best clean run in the parallel batch. Better service and reliability than Gemma, but much slower and still did not protect trust or use marketing. |
| 2026-06-21 | `minimax/minimax-m3` | Minimax challenge text v1: schema disabled, reasoning off after high-reasoning no-content smoke, 16000 tokens, 15m timeout | `+1070` | `₹21,710` | `0` | `₹25,602` | `₹118,685` | `3,939` | `535` | `4/30` | Avg successful ~127.9s, max ~431.7s | Strong narrative business reasoning and decent restocking, but brittle execution. It mentioned marketing in `25/30` rationales while sending `0` campaign actions, so marketing score stayed `0`; trust collapsed. |
| 2026-06-21 | `google/gemini-3.1-flash-lite` | Challenge text v1: schema disabled, reasoning off, 16000 tokens, 15m timeout | `+953` | `₹26,823` | `0` | `₹29,412` | `₹136,117` | `4,371` | `315` | `0/30` | Avg ~2.0s, max ~2.8s | Very fast and clean transport with strong profit/service. It mentioned marketing in `30/30` rationales but emitted `0` campaign actions, collected no khata, and still collapsed trust. |
| 2026-06-21 | `google/gemini-3.1-flash-lite` | Challenge text v2 validator: schema disabled, reasoning off, 16000 tokens, 15m timeout | `-295` | `₹21,904` | `0` | `₹19,288` | `₹91,845` | `3,078` | `1,517` | `11/30` final invalid, `25` retries | Avg ~1.9s, max ~2.6s | Validator fixed marketing execution: `19/30` marketing days, campaign mention/no-action gap `0`, marketing score `+91`. New failure mode is discounts: final rationale/action mismatch on `26/30` accepted decisions and many fallback days, causing poor service and trust collapse. |
| 2026-06-21 | `google/gemini-3.1-flash-lite` | Challenge text v3 discount fix: schema disabled, reasoning off, 16000 tokens, 15m timeout | `+1141` | `₹29,616` | `0` | `₹28,139` | `₹139,987.50` | `4,576` | `443` | `1/30` malformed JSON retry | Avg ~1.9s, max ~2.3s | Discount parser and sentence-scoped validation fixed the v2 failure. Marketing days `29/30`, discount days `18/30`, khata reminder days `27/30`, and campaign/discount/khata mismatch all `0`. Trust still collapsed, so relationship strategy remains unresolved. |
| 2026-06-21 | `google/gemini-3.1-flash-lite` | Trust engine v1: severity-weighted trust, named-customer recovery, compact text, reasoning off, 16000 tokens | `+1115` | `₹34,151` | `23` | `₹33,223` | `₹162,068.50` | `5,347` | `685` | `0/30`, `2` retries | Avg ~fast; full run under 1 minute | New trust engine prevented automatic zero-trust collapse under the same strong model. Trust had `12` positive days and ended at `23`, but essential stockouts still kept reputation low. |

## Product Service Snapshot

| Run | Milk | Bread | Eggs | Maggi | Chips | Cold drinks | Bananas |
|---|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek Flash fast | 40.5% | 47.2% | 89.9% | 46.9% | 43.2% | 40.6% | 44.3% |
| GLM 5.2 text | 64.7% | 71.5% | 91.1% | 66.6% | 65.7% | 65.5% | 60.8% |
| Gemma 4 26B text | 90.4% | 93.9% | 96.5% | 94.2% | 94.5% | 89.1% | 93.4% |
| GLM 5.2 medium reasoning | 81.0% | 86.9% | 91.1% | 87.2% | 86.3% | 84.9% | 75.1% |
| Nemotron 3 Ultra text | 85.3% | 92.6% | 99.6% | 92.7% | 92.4% | 85.7% | 80.4% |
| Gemma 4 26B parallel v2 | 87.0% | 91.8% | 97.6% | 91.9% | 89.1% | 83.9% | 89.1% |
| Qwen 3.7 Plus parallel v2 | 88.6% | 93.8% | 94.7% | 97.1% | 92.8% | 90.3% | 90.7% |
| Minimax M3 challenge text v1 | 82.5% | 90.5% | 96.9% | 88.0% | 88.5% | 93.0% | 78.7% |
| Gemini 3.1 Flash Lite challenge text v1 | 93.2% | 95.9% | 97.8% | 94.4% | 95.6% | 86.8% | 88.6% |
| Gemini 3.1 Flash Lite challenge text v2 validator | 60.3% | 70.4% | 96.7% | 64.1% | 66.8% | 60.0% | 70.7% |
| Gemini 3.1 Flash Lite challenge text v3 discount fix | 91.5% | 89.4% | 97.6% | 91.1% | 91.2% | 88.1% | 92.2% |
| Gemini 3.1 Flash Lite trust engine v1 | 86.0% | 87.0% | 98.5% | 91.7% | 87.6% | 86.3% | 92.5% |
| Gemini 3.1 Flash Lite current fast baseline | 89.5% | 91.6% | 99.5% | 94.0% | 88.8% | 88.6% | 97.1% |
| Claude Opus 4.8 current fixed-validator run | 92.4% | 92.8% | 98.0% | 94.4% | 95.0% | 93.0% | 96.3% |
| GLM 5.2 xhigh current max reasoning | 79.3% | 88.5% | 91.7% | 88.0% | 86.7% | 85.8% | 76.6% |
| Grok 4.3 current Responses json_object | 82.7% | 89.7% | 98.7% | 92.0% | 87.9% | 87.8% | 81.1% |
| Sarvam 105B current json_object high reasoning | 79.5% | 83.9% | 93.3% | 84.2% | 80.3% | 76.3% | 85.4% |
| Qwen 3.7 Max current json_object | 77.2% | 80.2% | 81.1% | 83.7% | 81.7% | 77.8% | 80.9% |

## Partial Diagnostics

| Date | Model | Profile | Status | Key observation |
|---|---|---|---|---|
| 2026-06-21 | `z-ai/glm-5.2` | Strict JSON schema, `require_parameters`, `xhigh` reasoning, 16000 tokens, 15m timeout | Stopped after Day 4/while Day 5 was thinking | Day 4 returned valid schema after `731.9s` (~12.2m). This proved the earlier 3-minute app timeout was cutting off valid thinking-model responses. Too slow for routine 30-day benchmarking. |
| 2026-06-21 | `z-ai/glm-5.2` | Strict JSON schema, `require_parameters`, `xhigh` reasoning, 16000 tokens, 3m timeout | Abandoned | Day 7 hit app-level abort. The timeout was our cap, not necessarily model failure. |
| 2026-06-21 | `nvidia/nemotron-3-ultra-550b-a55b` | Max-capability strict JSON schema, `require_parameters`, medium reasoning, 16000 tokens, 15m timeout | One-day smoke fell back | Arena call returned no message content under strict schema. Direct simple OpenRouter probes could return valid JSON, so the failure appears tied to the larger arena prompt/schema combination. |
| 2026-06-25 | `anthropic/claude-opus-4.8` | Pre-fix cost check: compact observation, Responses `json_object`, high reasoning, 4096 tokens, 15m timeout, seed `20260624` | Superseded by fixed-validator 30-day benchmark | The 1-day smoke completed cleanly with zero retries at about `$0.063`. The 5-day pilot cost about `$0.32`, ended score `+45`, final cash `₹6,005`, trust `53`, service rate `75.4%`, and hit `2` retries plus `1` fallback on Day 5. Diagnosis: the old validator treated references to active/delayed campaigns as new campaign claims. This was a harness issue, not a provider transport failure. |
| 2026-06-21 | `moonshotai/kimi-k2.7-code` | Parallel compact text v2: schema disabled, reasoning off, 2000 tokens, 180s timeout | Stopped after Qwen completed; Kimi was at 20 persisted days | `19/20` recorded decisions hit no-content fallback. Reward was `-1120`, final trust `0`, and service quality was poor except eggs. Not usable in this arena prompt shape. |
| 2026-06-21 | `minimax/minimax-m3` | High-reasoning plain text smoke: schema disabled, reasoning high, 16000 tokens, 15m timeout | One-day smoke fell back | OpenRouter returned no message content. The same model worked when `reasoning` was disabled, so the full run used plain text JSON with reasoning off. |

## Current Takeaways

- Highest score so far: `nvidia/nemotron-3-ultra-550b-a55b`, but it was slow and fallback-assisted.
- Best practical cheap baseline: `google/gemma-4-26b-a4b-it`.
- Best clean parallel run so far: `qwen/qwen3.7-plus`, with zero retries/fallbacks and slightly better score than Gemma in the same profile, but around one minute per day.
- Best GLM setup so far: medium reasoning with strict schema and OpenRouter `require_parameters`.
- Nemotron should use text JSON mode for now; strict schema is not reliable with the current arena prompt.
- `moonshotai/kimi-k2.7-code` is not compatible with the current compact arena prompt; it repeatedly returns no message content.
- `minimax/minimax-m3` is strategically literate but action-brittle. It plans around weather, shelf life, cash, and stockouts, but repeatedly says it will run campaigns without actually emitting `marketingActions`.
- `google/gemini-3.1-flash-lite` is the fastest model tested so far and now the strongest fast practical baseline: the 2026-06-24 current-engine run reached `+1581`, final trust `90`, no fallbacks, and average latency around `2.5s`.
- `z-ai/glm-5.2` with max-style `xhigh` reasoning is now validated as transport-stable in the current arena: `+515`, `1` retry, zero fallbacks, average latency around `38.9s`. It is not yet strategically strong because stockouts remained frequent and final trust reached `0`.
- `sarvam-105b` is now integrated through Sarvam's direct API. Use `json_object`, `reasoning_effort: "high"`, and `maxTokens: 4096` for this Starter-tier key. The first full run reached `+350`, better than Qwen but still weak on trust.
- `qwen/qwen3.7-max` is cleaner than DeepSeek V4 Pro in the current profile, but its first full run is not competitive: `+275`, final trust `10`, `1,155` missed units, and roughly `42s` average latency.
- `x-ai/grok-4.3` is validated as a clean Responses `json_object` model in the current arena: `+1125`, zero retries, zero fallbacks, and roughly `41.5s` average latency. It is not yet strategically top-tier because trust ended at `29` after frequent stockouts.
- `anthropic/claude-opus-4.8` is now a valid current benchmark after the campaign-validation fix: `+1773`, final trust `99`, `0` fallbacks, `2` retries, and about `$2.54` recorded OpenRouter cost. The remaining retries show active-campaign wording still needs one more validator polish before larger expensive batches.
- Avoid `xhigh` for normal benchmark loops unless the run is intentionally overnight.
- Keep `timeoutMs` high enough for thinking models, but use medium reasoning for practical iteration.
- Marketing is now measurable in validator runs. Gemini Flash Lite reached marketing score `+141` after the discount fix, but promoted-stockout days still show that campaign choice needs better inventory-aware guardrails.
- Action/rationale validation is now implemented for campaigns, khata reminders, and discounts; rerun Minimax and other affected models before comparing the next leaderboard.
- Trust is now a visible and partially recoverable system instead of a binary stockout cliff. Strong models can avoid total collapse, but they still need better essential-stock planning to end with healthy reputation.

## Append Template

```md
| YYYY-MM-DD | `model-id` | Profile summary | `reward` | `₹cash` | `trust` | `₹profit` | `₹revenue` | `sold` | `missed` | `fallbacks/30` | Latency note | Short diagnosis |
```
