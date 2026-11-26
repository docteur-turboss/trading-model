# ADR-0076: Multi-Asset Trainer: Shared Encoders, a Three-Level Agent Hierarchy and a Migration Path in Flagged Steps

**Status:** Accepted
**Date:** 2026-11
**Verified by:** `services/trader-trainer/tests/unit/domain/genetic-algorithm/event-driven-decisions.spec.ts` (section 5), `services/trader-trainer/tests/unit/domain/genetic-algorithm/shared-trunk.spec.ts` (section 9 step 1), `services/trader-trainer/tests/unit/domain/genetic-algorithm/topology-genes.spec.ts` (section 9 step 3), manual review 2026-11-20 (sections 1 to 4 and 6 to 9 add no code yet: each step issue adds its spec here)
**Related:** [ADR-0001](./0001-ga-dqn-training.md) (GA + DQN), [ADR-0022](./0022-versioned-model-artifacts.md) (artifacts), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (success criteria), [ADR-0036](./0036-multi-dimension-signals-mvp.md) (signals), [ADR-0039](./0039-configuration-feature-flags.md) (flags), [ADR-0044](./0044-singleton-trainer.md) (singleton trainer), [ADR-0049](./0049-downstream-context-for-models-and-signals.md) (downstream context), [ADR-0061](./0061-n-1-compatibility-of-public-api-and-bus-messages.md) (N-1), [ADR-0064](./0064-risk-and-execution-context-before-order-flow.md) (risk and execution), [ADR-0066](./0066-simulated-fills-at-next-bar-open-with-execution-costs.md) (simulator), [ADR-0068](./0068-test-segment-for-published-model-metrics.md) (test segment), [ADR-0069](./0069-model-admission-verdict-on-the-test-segment.md) (admission)

**Decision (owner, issue #1306, 2026-11-20):** accepted with the recommended answers. **Q1**: mean pooling first; attention is written only if the step 4 ablation shows pooling is the limit (step 6 stays conditional). **Q2**: the scraper registry entry (`signal-registry.json`, its `sector` and `assetClass` fields) is the authoritative source of an asset's sector and class; no separate table. **Q3**: the allocator learns the limits as inputs in training, and production clips to them; the risk context of ADR-0064 still enforces them. **Q4**: the first target is 100 assets: hierarchy by sector, attention optional inside groups. Accepting this ADR added no code by itself (ADR-0029); #1306 is split into one issue per step of section 9 once its other resumption conditions (#1298, #1300) are met.

## Context

The trainer evolves one independent network per symbol: a GA population and a DQN per symbol, `NETWORK_INPUT_LAYOUT.dim` = 33 inputs (32 features + agent exposure), hidden layers 64 and 32, 3 outputs (4 355 weights in a plain dense net), one decision per bar. `TrainingSession` runs one symbol at a time (`trader-trainer` is a singleton, ADR-0044). Three limits follow:

- Cost grows linearly with the asset count (measured below).
- No model sees another asset, so no sector, class or macro effect can be learned.
- Nobody splits capital between assets. [ADR-0036](./0036-multi-dimension-signals-mvp.md) and [ADR-0049](./0049-downstream-context-for-models-and-signals.md) point to "an agent architecture that does not exist yet".

The goal is many assets across classes (equities, ETFs, bonds, real estate, crypto) with a portfolio allocation.

### Measurements (code at `17691403b`)

Machine: the owner's workstation, Bun, one thread, no other load. Numbers are an order of magnitude; rerun them on the target machine before committing a budget.

| Measure | Result |
| --- | --- |
| Forward pass, 33-64-32-3 dense | 3.3 to 3.5 us (about 2.5 GFLOP/s effective: 8.7 kFLOP per pass) |
| Forward + backpropagation (`NeuralNetwork.train`) | 9.8 to 17.5 us over two runs (backpropagation 6.5 to 14 us) |
| One generation, population 20, 10 episodes, 500 bars | 2.0 s |
| One generation, population 20, 10 episodes, 2 000 bars | 4.0 s |
| One session, 50 generations (`TRAINER_GENERATIONS`) | 100 to 200 s, inside `TRAINER_TIME_BUDGET_MS` (300 s) |

**How to redo it.** From `services/trader-trainer`, a throwaway script (not committed) imports `NeuralNetwork` (`src/domain/neural-network/neural-network.ts`) and times 20 000 calls of `forward(x)` and `train(x, t)` after 2 000 warm-up calls. For the session it builds `WindowSet[]` of random `MarketStep` as in `tests/unit/domain/genetic-algorithm/ga-replay.spec.ts` and times `runInProcess(windowSets, settings)` with population 20, 10 episodes, `generations` 3; the generation time is the total divided by the generation count. Random features measure the compute, not the quality.

**Budget of one session per asset count** (sequential, 100 to 200 s per asset, interval `TRAINER_INTERVAL_MS` = 1 h):

| Assets | One pass over all of them | Fits the 1 h interval |
| --- | --- | --- |
| 10 | 17 to 33 min | yes |
| 100 | 2.8 to 5.6 h | no |
| 1 000 | 28 to 56 h | no |

Past about 20 assets the current design cannot refresh every model hourly, even before any inter-asset view.

## Decision

### 1. Factor the compute by data type (shared encoders)

One encoder per data type (order book, candles per cadence, trades, signals) maps the raw features of any asset to a fixed-size vector (proposed 16 values). Weights are shared by every asset, and an asset identity is not an input. The per-asset part shrinks to normalization statistics and a small head. Target cost: proportional to the number of types (4 to 6 encoders), not the number of assets: the GA evolves the encoders once and the DQN trains on the pooled experience of all assets.

| Option | Cost | Note |
| --- | --- | --- |
| A. Keep one network per asset | linear in assets, table above | status quo |
| B. One shared trunk trained on all assets, per-asset head (recommended first step) | one session per group, about the cost of 1 to 2 current sessions | dense layers only: no new code in the network |
| C. B plus one encoder per data type, evolved separately | one population per type | needs the input mask (#1299) and the topology genes of section 4 |

### 2. Cross-asset view

One token per asset (the encoder vector), then a module that mixes tokens. Attention for `T` tokens of size `d` costs about `2 T^2 d + 4 T d^2` FLOP per forward pass. At the measured 2.5 GFLOP/s and `d` = 32 (estimate, not measured):

| Tokens `T` | Forward | Forward + backpropagation | Per generation (100 000 steps) |
| --- | --- | --- | --- |
| 10 | 0.02 ms | 0.06 ms | 6 s |
| 100 | 0.4 ms | 1.2 ms | 2 min |
| 1 000 | 27 ms | 80 ms | 2.2 h |

Attention stops being practical between 100 and 1 000 tokens on one CPU thread: the quadratic term dominates. Hence the hierarchy: attention (or its cheaper variant) inside groups of at most about 100 assets, never across all assets. The variant without attention is mean pooling of the tokens (plus max pooling), costing `T d`, linear in `T`: it loses the pairwise weights but keeps "what the group looks like".

### 3. Three levels

| Level | Reads | Decides | Emits |
| --- | --- | --- | --- |
| Asset analyst | encoder vectors of its asset, signals of the asset | allocates nothing | signal vector: direction score, confidence, estimated volatility, estimated liquidity, horizon |
| Sector manager | signal vectors of its assets, sector and area signals of the scraper (ADR-0036 dimensions) | weights inside the sector, sector exposure | sector vector (same fields at sector level) plus the weights |
| Portfolio allocator | sector vectors, cash, risk limits as inputs | split between classes, cash share | target weights per class and per sector, never an order |

The analyst replaces today's trading agent: it keeps its network, loses the action head for the sector level. Sector taxonomy comes from the scraper registry (**question to the owner, Q2**: which field is authoritative for the sector and class of an asset: the registry entry, or a separate table?).

### 4. Topology driven by the GA

Genes (all behind the flags of section 9): input mask over feature groups (#1299), vector size per encoder, attention heads (0 means mean pooling), depth, action space (3 actions today; adds size buckets), trigger thresholds (section 5), minimum delay between two actions. One population per level, evolving separately: the analyst population is scored on the asset, the manager population on the sector return with analysts frozen, the allocator on the portfolio with managers frozen. When topology varies, crossover is homologous: genes are aligned by role (layer position, mask group), a parent without the gene passes the other's; a size mismatch pads with zeros or truncates, as `setWeights` already refuses a wrong length. Cost: the search space grows; keep the number of free topology genes small per step (section 9).

### 5. Event-triggered decisions

Decide on an event instead of every bar: price move above a threshold, volume spike, order book imbalance. A priority filter keeps the strongest events when several assets fire, a per-asset delay prevents repeats. The elapsed time since the previous decision becomes an input. Thresholds and delay are GA genes. Already open: #1301. Effect on the budget: decisions per episode fall, so the DQN steps per generation fall in proportion; the measurement criterion is in section 9.

Implementation of #1301 (owner decision, option 1): with `FEATURE_EVENT_DRIVEN_DECISIONS` (ADR-0039, default false) every genome carries `rl.horizon.decision` (`mode: "on_event"` set at creation and never mutated, `priceMove`, `volumeMultiple`, `minGap`, fixed bounds) and a 33rd network input `BarsSinceDecision`, declared in the manifest `features.fields`; flag false: no `decision` gene, 32 inputs, same genome as before. Detectors read the bars closed up to the decision bar (close move over 5 bars, `volumeRatio`); no order-book detector (candles only, ADR-0078). `frameSkip` is ignored in `on_event`. The n-step return and the bootstrap discount use the bars elapsed (`γ^Δbars`, per-transition `discount`), not the decision count. Bars between two decisions count 0 in the evaluation PnL curve, as with `frameSkip`; `decisions` is kept in the evaluation meta (0 = never trades, not admissible).

### 6. Feasibility in this repository

The network is hand-written TypeScript (`packages/model-runtime/src/neural-network`, backpropagation in `services/trader-trainer/src/domain/neural-network`, 1 499 lines in total): dense layers, no attention, no convolution, CPU, `Float32Array`.

| Option | Cost to write | Cost to run | Risk |
| --- | --- | --- | --- |
| Hand-written attention | about 300 to 400 lines (projections, softmax, its Jacobian, backpropagation) plus a gradient check against finite differences; estimate 2 to 3 working days | table of section 2 | the backward pass of softmax and layer norm is the usual source of silent errors; the gradient check is mandatory |
| Library | adoption, plus the `deps:third-party` and image constraints (services run on Node, no native build in the images today); not evaluated here | unknown on this CPU | a native binding breaks the image build or ADR-0038 signing; a library with its own tensors needs a weight exporter to keep `network-serialization` (ADR-0022) |
| No attention: mean pooling | few lines, no new backward beyond dense | linear in `T` | loses pairwise weights; cheapest to try first |

Recommendation: start without attention. Hand-write attention only if the ablation of step 4 of section 9 shows pooling is the limit. **Q1 to the owner**: accept this order, or write attention first?

### 7. Artifact contract

A model is one symbol today (`ModelManifest.symbol`, `training.model.published`, the per-symbol model routes of the trainer). Proposed, all additive (ADR-0061):

- Manifest: optional `role` (`asset` by default, then `encoder`, `sector`, `allocator`) and optional `components: [{ role, id, version, sha256 }]` naming the shared parts an analyst depends on. A reader N-1 ignores unknown fields and reads the analyst as a normal symbol model; `symbol` stays set for analysts.
- Shared encoder, sector manager and allocator: published under the same store with `symbol` replaced by a group id (`encoder:candles-1h`, `sector:energy`, `allocator:default`), version rules of ADR-0022 unchanged. Their weights are served by the existing per-symbol weights route with the group id as the symbol value; no new route in step 1 to 3.
- Event: `training.model.published` keeps its payload and adds the optional `role`; consumers that do not know it treat the event as an asset model. No new topic.
- Cross-version rule: a component is immutable; an analyst names the encoder version it was trained with, so replacing an encoder never changes a published analyst.

`model-evaluator` replays each model on the test segment (ADR-0068) with the admission verdict (ADR-0069). For a hierarchy it must replay the composition: encoders, then analysts, then managers, then allocator, on one portfolio in the simulator of ADR-0066 (multi-asset wallet, shared cash). Until step 5 it keeps replaying single analysts.

### 8. Boundary with risk and execution

The allocator decides target weights per class and sector, the cash share and which constraints it was trained under (maximum loss, concentration, as `riskLimits.maxExposureFraction` is today). The risk context of [ADR-0064](./0064-risk-and-execution-context-before-order-flow.md) stays the only authority that enforces them: loss limits, kill switch, exposure caps, order creation. The allocator never emits an order and never holds broker credentials; its output is an intent input to that context. When both disagree, the risk context wins and the difference is logged. **Q3 to the owner**: should the allocator learn the limits as inputs (it adapts) or only as hard clipping (it stays simpler)? Recommended: inputs in training, clipping in production.

### 9. Migration path

Each step sits behind a flag (ADR-0039), has its measure on the test segment (ADR-0030, ADR-0068) and is one issue. A step passes when its criterion holds on at least 3 seeds (`seedOffset`) against the previous step as baseline, with the admission verdict (ADR-0069) not worse.

| Step | Content | Flag | Contracts touched | Success criterion |
| --- | --- | --- | --- | --- |
| 0 (open) | signal window #1297, signal inputs #1298, mask gene #1299, daily bars #1300, event trigger #1301 | one flag each | manifest `features.fields` (existing field) | each already defined in its issue |
| 1 (cheapest proof) | shared trunk trained on N symbols, per-asset head, existing dense code | `FEATURE_SHARED_TRUNK` | manifest optional `components` | on 10 symbols: median test-segment fitness within 5 % of the per-symbol models, session time at most one third of 10 sessions (about 6 to 11 min against 17 to 33 min) |
| 2 | one encoder per data type, evolved apart | `FEATURE_SHARED_ENCODERS` | manifest `role`, event `role`; group ids as symbol in the model routes | step 1 fitness kept at equal or lower cost; mask (step 0) removes a group without loss |
| 3 | per-asset action space plus topology genes (depth and layer width of the per-symbol network; owner decision 2026-11-26: no shared trunk, so no encoder vector size) | `FEATURE_TOPOLOGY_GENES` | genome inside the manifest (free-form record) | genomes with different topologies cross without error (homologous crossover spec); fitness not below step 2 |
| 4 | sector manager with mean pooling, then ablate attention | `FEATURE_SECTOR_MANAGER` | `role: sector`, evaluator replays a sector | sector portfolio beats the equal-weight mix of its analysts on the test segment (Sharpe and drawdown, ADR-0030 criteria) |
| 5 | allocator and portfolio replay | `FEATURE_ALLOCATOR` | evaluator multi-asset replay, ADR-0064 intent input | portfolio beats equal-weight across classes at the same drawdown cap; no limit breach in replay |
| 6 (conditional) | attention in the manager | `FEATURE_ATTENTION` | none new | only if the step 4 ablation shows pooling is the limit: fitness gain over pooling larger than seed spread |

Step 1 is the first proof because it needs no new network code, answers "does sharing hurt" and attacks the cost table directly.

Step 1 as built (`FEATURE_SHARED_TRUNK`, `scripts/shared-trunk-bench.ts` measures it): the limits below stay until their step. (a) The trunk is not a separate artifact: every asset model carries its full weights and `components` names the trunk by the sha256 of its bytes, which nothing resolves or verifies yet; the trunk becomes a published, immutable component under a group id (section 7) at step 2, when the encoders need it. (b) The DQN trains symbol after symbol on the shared trunk, one replay buffer per window as before, not on one pooled buffer: pooling needs the replay to pick the head of each transition. Owner decision (issue #1897, option 1): kept for step 1; the pooled buffer moves to step 2 (#1898), and the cost of the GA, which the DQN does not change, is cut by #1911: each generation trains and evaluates every genome on a rotating subset of k symbols (`TRAINER_SHARED_TRUNK_SYMBOLS_PER_GENERATION`, default `max(1, floor(N / 3))`, k = N is the first build; slice moved by k per generation from the seed, each symbol seen the same number of times to one), the fitnesses of different generations come from different slices, so at the end of the GA every member of the Pareto archive is scored on all symbols and the best of those is published (`selectOnAllSymbols`), and the test segment of the published models is read on all symbols too. A symbol outside the slice of a genome's lineage gets the current trunk head (that of the last symbol trained) in `withHeadOf`: the limit of k < N. (c) The simulator costs of a group are those of its first symbol, so all symbols must be daily or all intraday (a mixed group is refused; per-asset costs differ inside a class). Second rework (#2317): measured on 10 real Binance 1h pairs (2200 candles, window 500, test 1500, population 20, 30 generations), 3 seeds, non-dedicated machine, group session time over 10 per-symbol sessions: k = 4 (`ceil(N / 3)`) 0.38 / 0.73 / 0.45 (median 0.45, criterion not met); k = 3 (`floor(N / 3)`, new default) 0.29 / 0.13 / 0.70 (median 0.29). Median test fitness -10.26 % per symbol against -10.40 % shared (k = 3). The bench now compares the ADR-0069 verdict (same `assessAdmission` as the trainer): 0 admissible model of 30 on both sides, so the verdict is inconclusive (the bench no longer reports "not worse" on 0 / 0). Times now include the test-segment evaluation on both sides, so they are not comparable with the 0.27 to 0.41 of #2091. Times vary 0.13 to 0.70 between seeds, one pass per seed, on a machine that was not idle (the shared staging stack runs on it and must not be stopped): the median 0.29 is not shown below 1/3 outside the noise, and k = 3 is not shown faster than k = 4 (seed 2: 0.70 against 0.45). k = 3 is kept as default (fewer symbols per generation cannot cost more work than k = 4; the sample cannot prove a gain). Step 1 criterion: not met (time not demonstrated, admission inconclusive); to repeat on an idle machine with several passes per seed. Third pass (#2423, `--passes 2`, 100 generations, k = 3, same 10 pairs, 2200 candles from 2026-08-23 to 2026-11-23, 3 seeds, machine not idle: a 40-container load stack kept running on it): group / per-symbol time 0.13 (0.13 to 0.14 over the two passes) / 0.66 (0.63 to 0.70) / 0.17 (0.16 to 0.17), median 0.17; the spread inside a seed is under 0.07, the spread between seeds (0.13 to 0.66) is not machine noise but the group session's own length (seed 1: 342 s against 64 s and 86 s). Median test fitness -10.57 % per symbol against -11.80 % shared (5 % tolerance not met). 0 admissible model of 30 on both sides: the verdict stays inconclusive even at 100 generations. Step 1 criterion: not met (fitness worse than the tolerance, admission inconclusive).

## Questions to the owner

- **Q1**: pooling before attention (recommended), or attention first?
- **Q2**: authoritative source of an asset's sector and class.
- **Q3**: allocator limits as inputs plus clipping (recommended), or clipping only.
- **Q4**: is the first target 100 assets (hierarchy by sector, attention optional) or 1 000 (hierarchy mandatory, pooling only)?

## Consequences

- The decision set is explicit; no implementation exists. #1306 and the step issues can be written once this is Accepted.
- Until then the trainer stays at about 20 assets for an hourly refresh (table above).
- Out of scope: choice of assets, order execution, any code change.
