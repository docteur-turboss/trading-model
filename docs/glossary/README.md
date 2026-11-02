# Glossary

Domain-specific terms used across the trading-model platform.

## A

**ADR (Architecture Decision Record)**
Document capturing a significant architectural decision, its context, alternatives considered, and consequences. Stored in `docs/adr/`.

## B

**Bounded Context**
A DDD concept: a logical boundary within which a particular domain model applies. The platform defines 7 bounded contexts (Market Data, Training, Messaging, Security, Discovery, Observability, Gateway).

## C

**Circuit Breaker**
Failure-handling pattern that stops repeated requests to a failing service after a threshold of failures, preventing cascading failures.

## D

**DLQ (Dead Letter Queue)**
Storage for messages that could not be delivered after exhausting all retry attempts. Entries can be inspected and replayed back to the message bus.

**DQN (Deep Q-Network)**
Reinforcement learning algorithm combining Q-learning with deep neural networks. The agent learns optimal trading actions by approximating the Q-value function.

**DPIA (Data Protection Impact Assessment)**
Risk assessment required by GDPR Article 35 for processing activities that are likely to result in high risk to individuals' rights and freedoms.

## E

**Elitism**
GA strategy where a fraction of the best-performing individuals survive unchanged to the next generation, preserving high-quality solutions.

**Experience Replay**
DQN technique storing past experiences `(state, action, reward, next_state)` in a buffer. Training samples are drawn randomly from this buffer, breaking temporal correlations.

## F

**Fitness Function**
Metric evaluating how well a genome (agent) performs a task. The trader-trainer supports total P&L, Sharpe ratio, Sortino ratio, Calmar ratio, and composite fitness.

## G

**GA (Genetic Algorithm)**
Evolutionary algorithm inspired by natural selection. A population of candidate solutions (genomes) evolves over generations through selection, crossover, and mutation.

**Genome**
Encoded representation of a candidate solution in a GA. In the trader-trainer, a genome encodes neural network architecture, RL hyperparameters, and mutation/crossover configuration.

## H

**HMAC (Hash-based Message Authentication Code)**
Used for instance-level authentication between services. Each registered instance receives an HMAC-SHA256 token validated via the `x-instance-token` header.

## L

**Lamarckian Inheritance**
GA technique where learned traits (trained neural network weights) are written back into the genome before reproduction, enabling offspring to inherit acquired knowledge.

## M

**mTLS (Mutual TLS)**
Transport Layer Security where both client and server present X.509 certificates for mutual authentication. Used for all inter-service communication in the platform.

## N

**NSGA-II (Non-dominated Sorting Genetic Algorithm II)**
Multi-objective optimization algorithm that sorts solutions by Pareto dominance rank and crowding distance. Used by the trader-trainer to optimize competing objectives (P&L, Sharpe ratio, complexity).

## P

**Pareto Front**
Set of non-dominated solutions where no objective can be improved without degrading another. The trader-trainer maintains a persistent Pareto archive across generations.

## R

**RL (Reinforcement Learning)**
Machine learning paradigm where an agent learns by interacting with an environment, receiving rewards for actions. The trader-trainer uses DQN for trading decisions.

## S

**Service Discovery**
Mechanism allowing services to find each other dynamically. The discovery-server maintains a registry with TTL-based leases, heartbeat monitoring, and token-based authentication.

**Sharpe Ratio**
Risk-adjusted return metric: `(return - risk_free_rate) / standard_deviation_of_returns`. Higher values indicate better risk-adjusted performance.

**SVID (SPIFFE Verifiable Identity Document)**
Short-lived X.509 identity issued by the SPIRE Server after workload attestation, carrying a `spiffe://` URI SAN (ADR-0011). Rotated automatically (1h TTL). Replaces the decommissioned internal certificate-authority.

## T

**TTL (Time-To-Live)**
Expiration duration for service registration leases, cached entries, or message delivery deadlines.

**Token Bucket**
Rate-limiting algorithm used by the financial-scraper to respect Binance API rate limits. Tokens are added at a fixed rate; requests consume tokens.

## W

**Walk-Forward Validation**
Time-series validation technique where market data is split into training (80%) and validation (20%) windows. The agent trains on the training window via Q-learning; fitness is computed only on the held-out validation window.
