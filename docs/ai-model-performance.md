# AI Model Performance Ledger

This file records AI Arena benchmark results for Shree Shyam Bhandar. Keep adding new runs here so model comparisons are not lost in chat history.

## Benchmark Rules

- One episode is one full 30-day game.
- One step is one in-game day.
- Each model receives the same backend observation contract for its profile.
- Runs below used temporary local SQLite databases and did not touch the live game DB.
- Scores are not perfectly comparable across different arena profiles. Compare models within the same profile first.

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

## Full 30-Day Runs

| Date | Model | Arena profile | Reward | Final cash | Final trust | Profit | Revenue | Sold units | Missed units | Fallbacks | Latency note | Summary |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
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

## Partial Diagnostics

| Date | Model | Profile | Status | Key observation |
|---|---|---|---|---|
| 2026-06-21 | `z-ai/glm-5.2` | Strict JSON schema, `require_parameters`, `xhigh` reasoning, 16000 tokens, 15m timeout | Stopped after Day 4/while Day 5 was thinking | Day 4 returned valid schema after `731.9s` (~12.2m). This proved the earlier 3-minute app timeout was cutting off valid thinking-model responses. Too slow for routine 30-day benchmarking. |
| 2026-06-21 | `z-ai/glm-5.2` | Strict JSON schema, `require_parameters`, `xhigh` reasoning, 16000 tokens, 3m timeout | Abandoned | Day 7 hit app-level abort. The timeout was our cap, not necessarily model failure. |
| 2026-06-21 | `nvidia/nemotron-3-ultra-550b-a55b` | Max-capability strict JSON schema, `require_parameters`, medium reasoning, 16000 tokens, 15m timeout | One-day smoke fell back | Arena call returned no message content under strict schema. Direct simple OpenRouter probes could return valid JSON, so the failure appears tied to the larger arena prompt/schema combination. |
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
- `google/gemini-3.1-flash-lite` is the fastest model tested so far. After discount parsing and sentence-scoped validation, it is also one of the strongest clean action executors.
- Avoid `xhigh` for normal benchmark loops unless the run is intentionally overnight.
- Keep `timeoutMs` high enough for thinking models, but use medium reasoning for practical iteration.
- Marketing is now measurable in validator runs. Gemini Flash Lite reached marketing score `+141` after the discount fix, but promoted-stockout days still show that campaign choice needs better inventory-aware guardrails.
- Action/rationale validation is now implemented for campaigns, khata reminders, and discounts; rerun Minimax and other affected models before comparing the next leaderboard.
- Trust is now a visible and partially recoverable system instead of a binary stockout cliff. Strong models can avoid total collapse, but they still need better essential-stock planning to end with healthy reputation.

## Append Template

```md
| YYYY-MM-DD | `model-id` | Profile summary | `reward` | `₹cash` | `trust` | `₹profit` | `₹revenue` | `sold` | `missed` | `fallbacks/30` | Latency note | Short diagnosis |
```
