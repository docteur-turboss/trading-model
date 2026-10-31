# ADR-0025: GA Fitness Computed on Wallet PnL and Selected by `fitnessType`; DQN Learning From Its Own Experience

**Status:** Accepted
**Date:** 2026-10
**Amends:** [ADR-0001](./0001-ga-dqn-training.md) (its "Fitness function" bullet only; the GA + DQN architecture stands)
**Verified by:** `services/trader-trainer/tests/unit/genetic-algorithm/fitness-type.spec.ts`, `services/trader-trainer/tests/unit/genetic-algorithm/reward-shaping.spec.ts`, `services/trader-trainer/tests/unit/genetic-algorithm/dqn-learning.spec.ts`, `services/trader-trainer/tests/unit/genetic-algorithm/training-phase.spec.ts`, `services/trader-trainer/tests/unit/agent/trading-agent.spec.ts`

## Context

The 13.09 audit (Décision 4, CT3) found three competing pieces of fitness code and a `fitnessType` gene with no effect. The decision taken was to wire `fitnessType` to the implementation actually used while keeping the diversity of the Pareto front. Checked against the code on 2026-10-30:

- `fitness.ts`, the only code that mapped `FitnessType` to a metric (`total`, `sharpe`, `sortino`, `calmar`, `composite`), had been deleted as unused code on 2026-10-12 (`728fe448`). The fitness in use was `evaluation-utils.ts`: the mean of the episode scores times a complexity penalty. `reward-shaping.ts` shapes the training reward; it is not a fitness, but it had lost the `scaleFactor` that `fitness.ts` applied.
- `fitnessType` was always `total_pnl`: no setting reached it and it is never mutated. It was nevertheless published in every model summary, artifact and `training.model.published` event.
- The episode scores were the sum of the **shaped** reward. Clipping, scaling and z-score normalisation are genes of the genome being judged, so a genome could rescale its own score (normalised rewards average to about 0 whatever the strategy). Both NSGA-II objectives `avgPnl` and `sharpe` were read from those scores.
- The GA actually runs three selections: NSGA-II ranking on (`avgPnl`, `sharpe`, `negFlops`), a scalar score (`efficiencyScore`) for tournament/roulette/rank selection, stagnation and the reward threshold, and the published genome, which was `archive.members[0]`, an arbitrary member of the front.
- Each evaluation episode replays the same validation window. Episodes only differ by exploration noise, so a ratio computed across 3 episodes measured that noise, not a market return.
- The complexity penalty multiplied the fitness by `1 - λ·p`, which raises a negative fitness: a costlier losing network ranked higher.

## Decision

1. **Fitness reads the wallet PnL, never the shaped reward.** The evaluation records the final PnL of each episode and the PnL change of every validation bar (a bar skipped by `frameSkip` counts 0; its move lands on the next decision). Every genome is evaluated on the whole validation window, whatever its `maxEpisodeLength` (a training horizon). Reward shaping only changes how a genome learns.
2. **One implementation:** `computeFitness(type, pnl)` in `evaluation-utils.ts`. `total_pnl` is the mean episode PnL; `sharpe`, `sortino`, `calmar` and `composite` read the bar-by-bar PnL curve, which has one point per bar instead of one per episode. The NSGA-II objectives are the mean episode PnL and the Sharpe of that curve.
3. **`fitnessType` is a run setting, `TRAINER_FITNESS_TYPE`** (default `total_pnl`), not an evolved gene: genomes judged by different metrics could not be compared. It drives the scalar score: parent selection, stagnation, the reward threshold, and **the published genome, the front member with the highest fitness** (`ParetoArchive.best()`). The NSGA-II objectives stay multi-objective, so the front keeps every trade-off.
4. A failed evaluation scores `-1e9` on the fitness and on both PnL objectives. The complexity penalty subtracts `λ·p·|fitness|`.
5. The reward-shaping genes all act on training: `scaleFactor` is applied before clipping again, and a `sparse` genome learns from the episode total given on its last step.
6. **Evaluation explores at a fixed `EVAL_EPSILON` = 0.05** (the usual DQN evaluation protocol), not with the training schedule: that one starts at `epsilonStart` (1.0 by default) and decays by 0.995 per step, so over a 100-bar validation window about 80 % of the scored trades were random. Epsilon stays above 0 so the episodes differ and measure how robust the policy is.
7. **Published ratios are annualised**: the model's `sharpe` is the Sharpe of the bar curve times √(bars per year), the bars per year coming from the median spacing of the validation timestamps. The fitness stays per bar (the scale is the same for every genome of a run). Model manifests carry `metrics.metricsVersion: 2`; a manifest without it holds metrics computed on the shaped reward, not comparable.
8. At least 10 evaluation episodes (`TRAINER_EPISODES_PER_INDIVIDUAL`, default 10, was 3); the adaptive control keeps them within 10–30 instead of 2–10. Sortino without any loss and Calmar without any drawdown fall back to the mean, like Sharpe without variance, instead of dividing by about 0.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Keep only the mean (delete `fitnessType`) | Simpler, but drops the risk-adjusted metrics the MT4 validation needs and leaves a published field that lies |
| `fitnessType` replaces the NSGA-II objectives | A single objective collapses the Pareto front, the diversity the decision wanted to keep |
| `fitnessType` as an evolved gene | Each genome would be judged by its own metric: scores no longer comparable |
| Ratios across episodes | Episodes replay the same window; the ratios would measure exploration noise |

## Consequences

### Positive

- Changing `TRAINER_FITNESS_TYPE` changes which genome is published and every scalar decision of the GA (CT3 end criterion, `fitness-type.spec.ts`).
- Published `sharpe` and `maxDrawdown` describe the PnL curve of the evaluation, `avgPnl` the mean episode PnL.
- Reward shaping can no longer inflate a genome's score.

### Negative

- Fitness values are not comparable with models published before this change (`metricsVersion` tells them apart).
- The fitness is per bar: `fitness` values of runs on different timeframes are not comparable, only the published `sharpe` is.

### Learning fixed while verifying CT3 (2026-10-30)

Measured with the real `TradingAgent`, the DQN learned no market signal, so the RL genes had no meaningful effect:

- the step reward was the trade's own cost, never the price move (`TradingAgent.step` updated the price before reading the reference PnL): 0 on every step while the PnL went from 0 to 23.5;
- the training rewards came from another agent (a "shadow" backend in `precomputeRewards`);
- every agent ran the continuous action space (`useContinuous` tested `continuousPolicy.type !== undefined`, which every genome has): the recorded action was always 0, and changing the epsilon gene left the trained weights identical;
- the replay buffer was never replayed (each transition trained once, then removed), and the prioritized pool was never used;
- the switches (`clip`, `scale`, `normalize`, `sparse`, `prioritized`, `betaAnneal`) were never mutated, so they kept their default for ever.

Decided and done:

9. **A decision's reward is the wallet PnL it earned**: from just before its trade (its cost) to the next decision's price (the move on the position it left). `TradingAgent.step` returns it for the previous decision.
10. **The agent learns from its own experience**: no shadow backend. Each decision is stored with its n-step return (shaped by the genome, discount γ^n on the bootstrap); only complete transitions are stored, the end of the training window being a truncation, not a terminal state (except for a sparse genome, whose last transition takes the episode reward as terminal).
11. **Experience replay**: after each stored transition, a minibatch of `replayBuffer.batchSize` (new gene, default 8, 1–64) is replayed, with the prioritized pool and its importance-sampling weights when `prioritized`. The target starts from the network's current Q-values, not the stale ones stored with the transition.
12. **Discrete actions only** (sell / hold / buy, epsilon-greedy): the `continuousPolicy` genes and the `temperature` gene (Boltzmann sampling, greedy at exactly 1.0 and sampling at 0.99) are removed.
13. **Every RL hyper-parameter is under GA control**: the switches flip with a 5 % chance per mutation, `batchSize` mutates log-normally. `dqn-learning.spec.ts` checks that each gene changes the trained weights and that a trained genome beats the untrained one on a market it can learn.

14. **The agent observes its position** (decided 2026-10-31): a decision's reward depends on the units already held, so the network input is the market features followed by the agent state `AgentExposure` (position value / valuation, centred to [-1, 1]). Transitions store that full input. The model manifest's `features` lists all 33 inputs (`NETWORK_INPUT_LAYOUT`); it used to declare 32 inputs but name only 23 of them (the sliding-window closes and the bias were unnamed).
15. **Default `gamma` 0.9** (was 0.99); the GA still evolves it within [0.8, 0.9999].

Measured before deciding, 24 seeded balanced markets where feature 0 announces the next move, 800 training bars, one pass, genomes whose validation PnL improved after training (mean gain):

| Agent input | γ = 0.99 | γ = 0.9 |
| --- | --- | --- |
| Position hidden | 15/24 (+26) | 23/24 (+139) |
| Exposure in [0, 1] | 9/24 (+21) | 18/24 (+77) |
| Exposure centred to [-1, 1] (kept) | 14/24 (+50) | 19/24 (+95) |

On this market the right action does not depend on the position, so showing it adds a dimension to learn without helping; it is kept because on real data the position bounds what a decision can earn (cash, maximum position). To check against hiding it during MT4. The dominant factor measured is γ.

16. **Trades are sized on the cash, not in units** (found running on real candles, 2026-10-31): the training wallet held 1,000 of cash and traded 1 unit, so it could never buy BTC (~77,000) or ETH; every real training scored 0. Each trade now moves 10 % of the initial cash at the current price (a sale never exceeds the position), and pays the Binance spot taker fee of 0.1 %, which the wallet left at 0.
17. **`TRAINER_OBSERVE_POSITION`** (default `true`): `false` feeds a constant instead of the exposure (same input size), to measure what seeing the position is worth.

### First MT4 walk-forward run (2026-10-31)

`scripts/fetch-klines.ts` downloads Binance candles, `scripts/mt4-walk-forward.ts` runs the real GA (`TrainingSession`, population 20, 30 generations, 10 evaluation episodes) on 500 candles, then evaluates the genome it would publish on the next 100 candles, unseen by training, segment after segment. BTCUSDT and ETHUSDT 1h, 2026-08-08 → 2026-10-30, 15 segments each, fitness `total_pnl`, both variants on the same segments and seeds. Only candle features (order book, trades and ticker inputs at 0).

| Per 100-hour test segment | Position shown | Position hidden |
| --- | --- | --- |
| Mean return (% of cash) | −0.37 | −0.19 |
| Mean annualised Sharpe | −1.83 | −1.72 |
| Mean max drawdown (% of cash) | 1.99 | 1.67 |
| Segments with a gain | 13/30 | 13/30 |
| Correlation of returns with buy and hold | 0.78 | 0.68 |

Buy and hold earned −0.15 % on the same segments.

- **Position shown vs hidden: no measurable difference.** Shown does better on 18 of 30 paired segments but loses 0.18 points of return on average (standard deviation 1.46, t = −0.67): noise. The default stays `true` (decision of 2026-10-31).
- **The engine shows no out-of-sample edge yet**: both variants lose a little after fees, below buy and hold, and their returns mostly follow the market (correlation 0.7–0.8): the published agents are long-biased rather than predictive. MT4's success criteria are not met.

### Still open

- **MT4 on fuller data, several seeds, other fitnesses, explicit criteria**: moved to [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md), which also found that this run's test segments were normalised with their own future (point-in-time features), so its figures are superseded by ADR-0030's run.
- **Training costs about one minibatch per bar**: ~250 ms per genome and 400-bar window with the default batch of 8, so the 5-minute time budget ends a 20-genome run after about 60 generations of one window.
