# Neural Network — Concepts

## Overview

A **neural network** is a computation model inspired by biological neurons. It consists of layers of interconnected nodes (neurons) that transform input data through successive non-linear transformations. The platform uses feedforward fully-connected networks for Deep Q-Learning (DQN), enabling trading agents to learn optimal actions through trial and error.

## Why Neural Networks for Trading?

Financial markets are complex, non-linear, and noisy. Traditional rule-based strategies fail to capture subtle patterns or adapt to changing conditions. Neural networks excel because:

- They can approximate any continuous function (universal approximation theorem)
- They learn feature representations automatically from raw market data
- They generalize from historical patterns to unseen market conditions
- Combined with reinforcement learning, they can optimize sequential decision-making under uncertainty

## Core Concepts

### Feedforward Architecture

A feedforward network processes data in one direction: **Input → Hidden Layer × N → Output**.

Each layer computes: `output = activation(W × input + b)`

Where:
- **W** is the weight matrix (learned parameters)
- **b** is the bias vector (learned parameters)
- **activation** is a non-linear function

The network depth (number of hidden layers) and width (neurons per layer) define its capacity to represent complex patterns.

### Activation Functions

Activations introduce non-linearity — without them, deep networks would collapse into a single linear transformation.

| Function | Range | Characteristics |
| -------- | ----- | --------------- |
| **ReLU** | [0, ∞) | Fast, avoids vanishing gradient, default for hidden layers |
| **Sigmoid** | (0, 1) | Smooth, used for binary output |
| **Tanh** | (-1, 1) | Zero-centered, mitigates vanishing gradient vs sigmoid |
| **GELU** | ≈(-0.5, ∞) | Transformer-style, smooth ReLU variant |
| **Softmax** | (0, 1), sum=1 | Multi-class probability output |
| **ELU** | (-α, ∞) | Smooth ReLU alternative with negative values |
| **LeakyReLU** | (-∞, ∞) | Avoids dead neurons (small negative slope) |

### Loss Functions

Loss measures the error between the network's prediction and the target. The optimizer minimizes this loss.

| Loss | Formula | Use case |
| ---- | ------- | -------- |
| **MSE** | `½(ŷ - y)²` | Regression |
| **Cross-Entropy** | `-Σ y·log(ŷ)` | Multi-class classification |
| **Huber** | Squared for small errors, linear for large | Robust regression |
| **Hinge** | `max(0, 1 - y·ŷ)` | SVM-style classification |

### Optimizers

Optimizers update network weights to minimize the loss.

| Optimizer | Update rule | Characteristics |
| --------- | ----------- | --------------- |
| **SGD** | `θ = θ - lr · ∇θ` | Simple, needs careful learning rate tuning |
| **Adam** | Adaptive moments + bias correction | Default choice, works well across problems |
| **RMSProp** | Adaptive per-parameter learning rates | Good for non-stationary objectives |

### Backpropagation

The learning algorithm that computes gradients of the loss with respect to all weights via the chain rule:

1. **Forward pass**: compute predictions
2. **Loss computation**: measure error
3. **Backward pass**: propagate error gradients from output back to input
4. **Weight update**: adjust weights using the optimizer

## Deep Q-Learning (DQN)

DQN combines Q-learning with deep neural networks. The network approximates the Q-value function `Q(s, a)` — the expected cumulative reward of taking action `a` in state `s` and following the optimal policy thereafter.

### Q-Learning Update

The core learning rule:

```
Q(s, a) ← r + γ · max_a' Q(s', a')   (Bellman equation)
```

Where:
- `Q(s, a)` is the current Q-value for state s and action a
- `r` is the reward received
- `γ` (gamma) is the discount factor (how much future rewards matter)
- `s'` is the next state
- `max_a' Q(s', a')` is the maximum future Q-value

### Experience Replay

Past experiences `(state, action, reward, next_state)` are stored in a replay buffer. Training samples are drawn randomly from this buffer, breaking temporal correlations between consecutive experiences. This:

- Reduces variance in updates
- Reuses rare experiences efficiently
- Prevents the network from overfitting to recent events

### Epsilon-Greedy Exploration

The agent balances exploration (trying new actions) and exploitation (using known good actions):

- With probability **ε**, take a random action (explore)
- With probability **1-ε**, take the action with highest Q-value (exploit)
- **ε decays** over time (e.g., from 1.0 to 0.05) so the agent explores less as it learns

### Action Space

The platform uses a discrete action space with three actions:

| Action | Index | Description |
| ------ | ----- | ----------- |
| **Sell** | 0 | Sell position |
| **Hold** | 1 | Do nothing |
| **Buy** | 2 | Buy position |

## Weight Initialization

Proper initialization prevents vanishing or exploding gradients:

| Initializer | Distribution | Best for |
| ----------- | ------------ | -------- |
| **He** | `N(0, √(2/fanIn))` | ReLU activations |
| **Xavier** | `N(0, √(1/fanIn))` | Tanh/Sigmoid activations |
| **LeCun** | `N(0, √(1/fanIn))` | LeCun-style |

## Input Normalization

Raw market data has varying scales (prices in thousands, volumes in millions). Normalization ensures stable training:

| Strategy | Method |
| -------- | ------ |
| **Min-max** | `(x - min) / (max - min)` |
| **Z-score** | `(x - mean) / std` |
| **Robust** | `(x - median) / IQR` |

---

For implementation details — class API, TypeScript types, configuration — see [Neural Network Reference](../reference/neural-network.md).
