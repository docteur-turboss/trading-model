import { OptimizerType } from './type';

/**
 * Unified hyperparameter bag. SGD ignores beta1/beta2/epsilon; they are
 * present so every optimizer receives the same object without branching at
 * call-site.
 */
export interface OptimizerHyperparams {
  /** Adam / RMSProp first-moment decay.  @default 0.9   */
  beta1: number;
  /** Adam / RMSProp second-moment decay. @default 0.999 */
  beta2: number;
  /** Denominator stabiliser.            @default 1e-8  */
  epsilon: number;
}

export const DEFAULT_HYPERPARAMS: Readonly<OptimizerHyperparams> = {
  beta1: 0.9,
  beta2: 0.999,
  epsilon: 1e-8,
};

/**
 * Mutable state carried by each layer for each parameter tensor (weights /
 * biases separately).  SGD needs only the step counter; moment-based
 * optimizers add `m` and/or `v`.
 *
 * Using an index signature keeps the type open so new optimizers can store
 * arbitrary arrays without touching this interface.
 */
export interface OptimizerState {
  /** Global step for this tensor (used for bias-correction in Adam). */
  t: number;
  [key: string]: Float32Array | number;
}

export interface Optimizer {
  /**
   * Allocates a fresh state object for a tensor of `size` parameters.
   * Called once per (layer × tensor) pair during network construction.
   */
  initState(size: number): OptimizerState;

  /**
   * Updates `params` **in-place** given the gradient vector `grads`.
   *
   * @param params - Parameter tensor to mutate (weights or biases).
   * @param grads  - Gradient tensor, same length as `params`.
   * @param state  - Persistent optimizer state for this tensor.
   * @param lr     - Learning rate.
   * @param hp     - Optimizer hyperparameters.
   */
  step(
    params: Float32Array,
    grads: Float32Array,
    state: OptimizerState,
    lr: number,
    hp: OptimizerHyperparams
  ): void;
}

export const OPTIMIZERS: Record<OptimizerType, Optimizer> = {
  // Stochastic Gradient Descent
  sgd: {
    initState: (_size: number): OptimizerState => {
      return { t: 0 };
    },

    step(params, grads, state, lr) {
      state.t++;
      for (let i = 0; i < params.length; i++) {
        params[i] -= lr * grads[i];
      }
    },
  },

  // Adam (Kingma & Ba, 2015)
  //
  //   m_t  = β₁·m_{t-1} + (1−β₁)·g_t            ← first moment (mean)
  //   v_t  = β₂·v_{t-1} + (1−β₂)·g_t²           ← second moment (variance)
  //   m̂_t  = m_t / (1−β₁ᵗ)                       ← bias-corrected mean
  //   v̂_t  = v_t / (1−β₂ᵗ)                       ← bias-corrected variance
  //   θ_t  = θ_{t-1} − α · m̂_t / (√v̂_t + ε)
  //
  // Numerically equivalent form (avoids two divisions per param):
  //   lrT  = α · √(1−β₂ᵗ) / (1−β₁ᵗ)
  //   θ_t  = θ_{t-1} − lrT · m_t / (√v_t + ε)
  //
  adam: {
    initState: (size): OptimizerState => ({
      t: 0,
      m: new Float32Array(size), // first moment
      v: new Float32Array(size), // second moment (uncentred variance)
    }),

    step(params, grads, state, lr, hp) {
      const { beta1, beta2, epsilon } = hp;
      const m = state.m as Float32Array;
      const v = state.v as Float32Array;

      state.t++;
      const t = state.t as number;
      // Pre-compute bias-corrected lr for this step
      const lrT = (lr * Math.sqrt(1 - Math.pow(beta2, t))) / (1 - Math.pow(beta1, t));

      for (let i = 0; i < params.length; i++) {
        const g = grads[i];
        m[i] = beta1 * m[i] + (1 - beta1) * g;
        v[i] = beta2 * v[i] + (1 - beta2) * g * g;
        params[i] -= (lrT * m[i]) / (Math.sqrt(v[i]) + epsilon);
      }
    },
  },

  // RMSProp (Hinton, 2012)
  //
  //   v_t  = β₂·v_{t-1} + (1−β₂)·g_t²
  //   θ_t  = θ_{t-1} − α · g_t / (√v_t + ε)
  //
  rmsprop: {
    initState: (size): OptimizerState => ({
      t: 0,
      v: new Float32Array(size),
    }),

    step(params, grads, state, lr, hp) {
      const { beta2, epsilon } = hp;
      const v = state.v as Float32Array;

      state.t++;

      for (let i = 0; i < params.length; i++) {
        const g = grads[i];
        v[i] = beta2 * v[i] + (1 - beta2) * g * g;
        params[i] -= (lr / (Math.sqrt(v[i]) + epsilon)) * g;
      }
    },
  },
};
