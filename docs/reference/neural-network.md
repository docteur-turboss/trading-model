# Neural Network Module — Implementation Reference

> **New to NN concepts?** See [Neural Network — Concepts](../concepts/neural-network.md) for explanations of feedforward architecture, activation functions, DQN, and experience replay before reading this implementation reference.

## Overview

This document describes the neural network module (`src/core/neural-network/`) implementation. It covers the class API, TypeScript types, configuration, and training modes.

---

## Architecture

### Module Files

| File                       | Responsibility                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `neural-network.ts`        | Core network class: forward/backward pass, training, pooling                                  |
| `network-serialization.ts` | Weight serialization: `getWeights`, `setWeights`, `parameterCount`, `distributeAroundWeights` |
| `activation.ts`            | Activation functions                                                                          |
| `initializers.ts`          | Weight/bias initializers                                                                      |
| `losses.ts`                | Loss functions                                                                                |
| `normalize.ts`             | Input normalization strategies                                                                |
| `optimizer.ts`             | Optimizers (SGD, Adam, RMSprop)                                                               |
| `type.ts`                  | Shared types                                                                                  |
| `utils.ts`                 | Utilities                                                                                     |

### `NeuralNetwork` (`neural-network.ts`)

The core network class. Structure: `Input → Hidden Layer × N → Output`.

#### Configuration

```typescript
interface NeuralNetworkConfig {
  neuronsByLayer: number[]; // [input, hidden1, ..., output]
  activationType: ActivationType[]; // one per hidden+output layer
  lossFunctionType: string; // 'mean-squared-error' | 'cross-entropy' | 'huber'
  optimizerType: string; // 'sgd' | 'adam' | 'rmsprop'
  learningRate: number; // default 0.001
  initialisationType: string; // 'random' | 'he' | 'xavier' | 'lecun' | 'zeros'
  normalisationType: string; // 'none' | 'minmax' | 'zscore' | ...
  connectionType: string; // 'fully-connected' | 'dense-skip' | 'residual-connection'
  enablePool: boolean; // experience replay pool
  poolMaxSize: number; // max pool size (default 10,000)
  gradientClipNorm: number; // gradient clipping threshold
}
```

#### Forward Pass (`forward`)

Stateless computation returning a `ForwardContext` containing all intermediate values:

1. **Normalize** input vector
2. For each layer:
   - Compute pre-activations: `z = W @ input + b`
   - Apply activation: `output = activation(z)`
   - Apply connection strategy (skip/residual if configured)
3. Return output + layerZValues + layerOutputs

Supports **softmax** activation with numerical stability (max subtraction).

#### Backward Pass (`backprop`, `backpropAccumulate`)

Standard backpropagation via chain rule:

1. Compute output layer deltas from loss gradient × activation derivative
2. Special case: softmax + cross-entropy → `δ = ŷ - y`
3. Propagate deltas backward through hidden layers
4. Compute weight gradients (outer product of delta × layer input)
5. Apply gradients via optimizer (immediate or accumulated for mini-batch)

#### Training Modes

| Method                          | Description                                           |
| ------------------------------- | ----------------------------------------------------- |
| `train(input, target)`          | Single-sample forward + backprop                      |
| `forwardAndPool(input, target)` | Forward + store in pool for batch training            |
| `trainPooled()`                 | Accumulate gradients from pool, apply averaged update |

#### Weight Serialization

- `getWeights()` → Flat `Float32Array` of all weights + biases
- `setWeights(buffer)` → Load from flat array
- `distributeAroundWeights(reference, sigma)` → Initialize around given mean with Gaussian noise

---

### `Agent` (`agent.ts`)

High-level wrapper around `NeuralNetwork` adding:

- **Experience replay pool**: Stores `{input, output, reward, nextState, done}` tuples
- **Score tracking**: `addScore()`, `getAverageScore()`, `getTotalScore()`
- **Q-learning update**: `learnQLearning(experience, gamma)` applies Bellman update:

```
target[a] = r + γ · max_a' Q(s', a')   (non-terminal)
target[a] = r                            (terminal)
```

- **Supervised learning**: `learnSupervised(input, target)`, `learnFromPool()`
- **Pool sampling**: `samplePool(batchSize)` for mini-batch DQN

---

### `TradingAgent` (`agent/trading-agent.ts`)

Orchestrates NeuralNetwork + Wallet + StateManager for the training loop:

```
step(features, price):
  1. wallet.setPrice(price)
  2. output = agent.fastForward(features)  # inference + pool push
  3. action = mapOutputToAction(output)     # discrete: argmax, continuous: threshold
  4. wallet.buy/sell(amount)
  5. reward = wallet.getPnL() - previousPnL
  6. state.decayEpsilon()
  7. return { action, reward, metrics }
```

**Action mapping** (`mapOutputToAction`):

- Discrete (3 neurons): `0=sell, 1=hold, 2=buy` (argmax)
- Continuous (1 neuron): `>0.25=buy, <-0.25=sell, else hold`

---

### Activation Functions (`activation.ts`)

| Function      | Range         | Use case                |
| ------------- | ------------- | ----------------------- |
| **ReLU**      | [0, ∞)        | Hidden layers (default) |
| **Sigmoid**   | (0, 1)        | Binary output           |
| **Tanh**      | (-1, 1)       | Zero-centered hidden    |
| **GELU**      | ≈(-0.5, ∞)    | Transformer-style       |
| **Softmax**   | (0, 1), sum=1 | Multi-class output      |
| **ELU**       | (-α, ∞)       | Smooth ReLU alternative |
| **Mish**      | ≈(-0.3, ∞)    | Self-regularized        |
| **LeakyReLU** | (-∞, ∞)       | Avoids dead neurons     |

---

### Optimizers (`optimizer.ts`)

| Optimizer   | Update rule                                      |
| ----------- | ------------------------------------------------ |
| **SGD**     | `θ = θ - lr · ∇θ`                                |
| **Adam**    | `θ = θ - lr · m̂ / (√v̂ + ε)` with bias correction |
| **RMSProp** | `θ = θ - lr · ∇θ / √(v + ε)`                     |

---

### Loss Functions (`losses.ts`)

| Loss | Formula | When to use |
| ------------------------ | ---------------------------- | -------------------------- | ------------- | --- | --------- | ----------------- |
| **MSE** | `½(ŷ - y)²` | Regression |
| **Cross-Entropy** | `-Σ y·log(ŷ)` | Multi-class classification |
| **Binary Cross-Entropy** | `-y·log(ŷ) - (1-y)·log(1-ŷ)` | Binary classification |
| **Huber** | `0.5·d²` if `                | d                          | <δ`, else `δ· | d   | - 0.5·δ²` | Robust regression |
| **Smooth L1** | Same as Huber | Object detection style |
| **Hinge** | `max(0, 1 - y·ŷ)` | SVM-style |
| **Log-Cosh** | `log(cosh(ŷ - y))` | Smooth L1 alternative |

---

### Weight Initializers (`initializers.ts`)

| Initializer | Distribution       | When to use              |
| ----------- | ------------------ | ------------------------ |
| **Zeros**   | 0                  | Biases only              |
| **Random**  | `U(-0.5, 0.5)`     | Simple networks          |
| **He**      | `N(0, √(2/fanIn))` | ReLU activations         |
| **Xavier**  | `N(0, √(1/fanIn))` | Tanh/Sigmoid activations |
| **LeCun**   | `N(0, √(1/fanIn))` | LeCun-style              |

---

### Normalization Strategies (`normalize.ts`)

| Strategy | Method |
| ------------------- | ----------------------------------- | --- | --- |
| **none** | Pass-through |
| **min-max** | `(x - min) / (max - min)` |
| **z-score** | `(x - mean) / std` |
| **robust** | `(x - median) / IQR` |
| **max** | `x / max(                           | x   | )` |
| **log** | `log(1 + x)` |
| **decimal-scaling** | `x / 10^k` |
| **border** | `(x - a) / (b - a)` in [a,b], 0 o/w |
| **batch** | Batch normalization placeholder |
| **layer** | Layer normalization placeholder |
| **instance** | Instance normalization placeholder |

---

## Types (`type.ts`)

Key types used across the module:

```typescript
interface Experience {
  input: Float32Array;
  output: Float32Array;
  reward?: number;
  nextState?: Float32Array;
  done?: boolean;
  target?: Float32Array; // supervised learning
}

interface ForwardContext {
  input: Float32Array;
  output: Float32Array;
  layerZValues: Float32Array[];
  layerOutputs: Float32Array[];
}

interface LayerMemory {
  fanIn: number;
  fanOut: number;
  weights: Float32Array;
  bias: Float32Array;
  output: Float32Array;
  z: Float32Array;
  delta: Float32Array;
  gradW: Float32Array;
  gradB: Float32Array;
  accumGradW: Float32Array;
  accumGradB: Float32Array;
  wState: Record<string, Float32Array | number>;
  bState: Record<string, Float32Array | number>;
}
```
