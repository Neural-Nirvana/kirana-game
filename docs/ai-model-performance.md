# AI Model Performance Ledger

This file records AI Arena benchmark results for Shree Shyam Bhandar. Keep adding new runs here so model comparisons are not lost in chat history.

## Benchmark Rules

- One episode is one full 30-day game.
- One step is one in-game day.
- Each model receives the same backend observation contract for its profile.
- Runs below used temporary local SQLite databases and did not touch the live game DB.
- Scores are not perfectly comparable across different arena profiles. Compare models within the same profile first.

## Full 30-Day Runs

| Date | Model | Arena profile | Reward | Final cash | Final trust | Profit | Revenue | Sold units | Missed units | Fallbacks | Latency note | Summary |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 2026-06-21 | `deepseek/deepseek-v4-flash` | Fast compact JSON schema, reasoning off, 1000 tokens, 90s timeout | `-771` | `₹14,845` | `0` | `₹12,592` | `₹59,475` | `2,046` | `2,263` | `12/30` | Real calls avg ~18.1s | Cheap but unreliable. Many empty/malformed outputs and fallback days; trust collapsed early. |
| 2026-06-21 | `z-ai/glm-5.2` | Compact text JSON parsing, reasoning off, 1600 tokens, 90s timeout | `-147` | `₹18,877` | `0` | `₹18,302` | `₹84,827` | `2,822` | `1,289` | `11/30` | Real calls avg ~40.9s | Better strategy than DeepSeek, but many empty responses/fallbacks. |
| 2026-06-21 | `google/gemma-4-26b-a4b-it` | Compact text JSON parsing, reasoning off, 1600 tokens, 90s timeout | `+1135` | `₹26,159` | `1` | `₹28,142` | `₹129,168` | `4,213` | `339` | `0/30` | Avg ~6.5s, max ~20.2s | Best current cheap baseline. Strong inventory service and no fallback days; trust still decayed. |
| 2026-06-21 | `z-ai/glm-5.2` | Balanced max-capability: compact strict JSON schema, `require_parameters`, medium reasoning, 16000 tokens, 15m timeout | `+492` | `₹27,602` | `0` | `₹24,939` | `₹122,404` | `4,050` | `726` | `2/30` | Avg ~50.6s, median ~44.4s, max successful ~201.9s | Medium reasoning fixed most GLM reliability problems and produced strong cash/profit. Still weaker than Gemma and still lost trust. |
| 2026-06-21 | `nvidia/nemotron-3-ultra-550b-a55b` | Max-capability text JSON: schema disabled, medium reasoning, 16000 tokens, 15m timeout | `+1155` | `₹25,910` | `2` | `₹28,604` | `₹138,862` | `4,583` | `537` | `5/30` | Avg successful ~50.1s, median ~55.9s, max ~116.2s; full run ~33m | Highest reward so far, but fallback-assisted. Strict schema arena call returned no content; text JSON worked. No marketing use and trust still collapsed. |

## Product Service Snapshot

| Run | Milk | Bread | Eggs | Maggi | Chips | Cold drinks | Bananas |
|---|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek Flash fast | 40.5% | 47.2% | 89.9% | 46.9% | 43.2% | 40.6% | 44.3% |
| GLM 5.2 text | 64.7% | 71.5% | 91.1% | 66.6% | 65.7% | 65.5% | 60.8% |
| Gemma 4 26B text | 90.4% | 93.9% | 96.5% | 94.2% | 94.5% | 89.1% | 93.4% |
| GLM 5.2 medium reasoning | 81.0% | 86.9% | 91.1% | 87.2% | 86.3% | 84.9% | 75.1% |
| Nemotron 3 Ultra text | 85.3% | 92.6% | 99.6% | 92.7% | 92.4% | 85.7% | 80.4% |

## Partial Diagnostics

| Date | Model | Profile | Status | Key observation |
|---|---|---|---|---|
| 2026-06-21 | `z-ai/glm-5.2` | Strict JSON schema, `require_parameters`, `xhigh` reasoning, 16000 tokens, 15m timeout | Stopped after Day 4/while Day 5 was thinking | Day 4 returned valid schema after `731.9s` (~12.2m). This proved the earlier 3-minute app timeout was cutting off valid thinking-model responses. Too slow for routine 30-day benchmarking. |
| 2026-06-21 | `z-ai/glm-5.2` | Strict JSON schema, `require_parameters`, `xhigh` reasoning, 16000 tokens, 3m timeout | Abandoned | Day 7 hit app-level abort. The timeout was our cap, not necessarily model failure. |
| 2026-06-21 | `nvidia/nemotron-3-ultra-550b-a55b` | Max-capability strict JSON schema, `require_parameters`, medium reasoning, 16000 tokens, 15m timeout | One-day smoke fell back | Arena call returned no message content under strict schema. Direct simple OpenRouter probes could return valid JSON, so the failure appears tied to the larger arena prompt/schema combination. |

## Current Takeaways

- Highest score so far: `nvidia/nemotron-3-ultra-550b-a55b`, but it was slow and fallback-assisted.
- Best practical cheap baseline: `google/gemma-4-26b-a4b-it`.
- Best GLM setup so far: medium reasoning with strict schema and OpenRouter `require_parameters`.
- Nemotron should use text JSON mode for now; strict schema is not reliable with the current arena prompt.
- Avoid `xhigh` for normal benchmark loops unless the run is intentionally overnight.
- Keep `timeoutMs` high enough for thinking models, but use medium reasoning for practical iteration.
- Trust remains the main unsolved gameplay weakness across models; strong models make money but still let customer trust decay.

## Append Template

```md
| YYYY-MM-DD | `model-id` | Profile summary | `reward` | `₹cash` | `trust` | `₹profit` | `₹revenue` | `sold` | `missed` | `fallbacks/30` | Latency note | Short diagnosis |
```
