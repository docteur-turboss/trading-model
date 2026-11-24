# @trading-model/model-runtime

Shared model code: network forward pass, feature codec, greedy agent and portfolio simulator ([ADR-0066](../adr/0066-simulated-fills-at-next-bar-open-with-execution-costs.md), replay window [ADR-0079](../adr/0079-replay-window-in-the-model-manifest.md)). Moved out of the trainer so every consumer computes the same decision from the same weights ([ADR-0016](../adr/0016-shared-contracts-ownership.md)).

Depends on `primitives`, `contracts` and `common`. Not deployed on its own.

## Consumers

Read from the `package.json` of each workspace:

| Consumer | Use |
| -------- | --- |
| `trader-trainer` | training, fitness, model artefacts |
| `model-evaluator` | offline replay of a model |
| `decision-consumer` | last-bar decision of a promoted model ([decision-consumer.md](./decision-consumer.md)) |
| `risk-execution` | model manifest and artefact reader (admission) |
| `@trading-model/http` | model API clients (`model-api/*`) |
