import { LossConfig, LossFunctionType } from './type';

const EPSILON = 1e-10;

/** Throws if output and target arrays differ in length. */
function validateLengths(output: Float32Array, target: Float32Array): void {
  if (output.length !== target.length) {
    throw new RangeError(
      `Loss function input/output length mismatch: output.length=${output.length}, target.length=${target.length}`
    );
  }
}

export interface LossDefinition {
  /**
   * Compute the loss value between network output and expected target.
   * Throws if output and target lengths differ.
   *
   * @param output - Network output activations.
   * @param target - Expected target values.
   * @param config - Loss configuration.
   * @returns The scalar loss value.
   */
  loss(output: Float32Array, target: Float32Array, config: Required<LossConfig>): number;

  /**
   * Compute the gradient of the loss with respect to the network output.
   * Throws if output and target lengths differ.
   *
   * @param output - Network output activations.
   * @param target - Expected target values.
   * @param config - Loss configuration.
   * @returns Gradient array of the same length as output.
   */
  gradient(output: Float32Array, target: Float32Array, config: Required<LossConfig>): Float32Array;
}

export const LOSSES: Record<LossFunctionType, LossDefinition> = {
  'mean-squared-error': {
    loss: (output, target) => {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        const e = target[i] - output[i];
        sum += e * e;
      }

      return sum / n;
    },
    gradient: (output, target) => {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      for (let i = 0; i < n; i++) {
        const d = output[i] - target[i];
        out[i] = 2 * d * invN;
      }

      return out;
    },
  },

  'mean-absolute-error': {
    loss(output, target) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        const e = target[i] - output[i];
        sum += Math.abs(e);
      }

      return sum / n;
    },

    gradient(output, target) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      for (let i = 0; i < n; i++) {
        const d = output[i] - target[i];

        out[i] = (d > 0 ? 1 : d < 0 ? -1 : 0) * invN;
      }

      return out;
    },
  },

  'root-mean-squared-error': {
    loss(output, target) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        const e = target[i] - output[i];
        sum += e * e;
      }

      return Math.sqrt(sum / n);
    },

    gradient(output, target) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        const d = output[i] - target[i];
        sum += d * d;
      }

      const rmse = Math.sqrt(sum * invN) + EPSILON;

      const scale = invN / rmse;

      for (let i = 0; i < n; i++) {
        out[i] = (output[i] - target[i]) * scale;
      }

      return out;
    },
  },

  'mean-biais-error': {
    loss(output, target) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        sum += target[i] - output[i];
      }

      return sum / n;
    },

    gradient(output, target) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      for (let i = 0; i < n; i++) {
        out[i] = (output[i] - target[i]) * invN;
      }

      return out;
    },
  },

  'huber-loss': {
    loss(output, target, config) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      const delta = config.deltaHuber;

      for (let i = 0; i < n; i++) {
        const e = Math.abs(target[i] - output[i]);

        if (e <= delta) sum += 0.5 * e * e;
        else sum += delta * (e - 0.5 * delta);
      }

      return sum / n;
    },

    gradient(output, target, config) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;
      const delta = config.deltaHuber;

      for (let i = 0; i < n; i++) {
        const d = output[i] - target[i];

        out[i] = (d > delta ? delta : d < -delta ? -delta : d) * invN;
      }

      return out;
    },
  },

  'log-cosh-loss': {
    loss(output, target) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        sum += Math.log(Math.cosh(target[i] - output[i]));
      }

      return sum / n;
    },

    gradient(output, target) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      for (let i = 0; i < n; i++) {
        out[i] = -Math.tanh(target[i] - output[i]) * invN;
      }

      return out;
    },
  },

  'cross-entropy': {
    loss(output, target) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        const o = Math.min(1 - EPSILON, Math.max(EPSILON, output[i]));

        sum -= target[i] * Math.log(o);
      }

      return sum / n;
    },

    gradient(output, target) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      for (let i = 0; i < n; i++) {
        out[i] = (-target[i] / (output[i] + EPSILON)) * invN;
      }

      return out;
    },
  },

  'binary-cross-entropy': {
    loss(output, target) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        const o = output[i];
        const t = target[i];

        sum -= t * Math.log(o + EPSILON) + (1 - t) * Math.log(1 - o + EPSILON);
      }

      return sum / n;
    },

    gradient(output, target) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      for (let i = 0; i < n; i++) {
        const o = output[i];
        const t = target[i];

        out[i] = (-t / (o + EPSILON) + (1 - t) / (1 - o + EPSILON)) * invN;
      }

      return out;
    },
  },

  'hinge-loss': {
    loss(output, target) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        const v = 1 - target[i] * output[i];

        sum += v > 0 ? v : 0;
      }

      return sum / n;
    },

    gradient(output, target) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      for (let i = 0; i < n; i++) {
        const o = output[i];
        const t = target[i];

        out[i] = (t * o < 1 ? -t : 0) * invN;
      }

      return out;
    },
  },

  'Kullback-Leibler-divergence': {
    loss(output, target) {
      validateLengths(output, target);
      const n = output.length;

      let sum = 0;

      for (let i = 0; i < n; i++) {
        const t = target[i];

        sum += t * Math.log((t + EPSILON) / (output[i] + EPSILON));
      }

      return sum / n;
    },

    gradient(output, target) {
      validateLengths(output, target);
      const n = output.length;
      const out = new Float32Array(n);

      const invN = 1 / n;

      for (let i = 0; i < n; i++) {
        out[i] = (-target[i] / (output[i] + EPSILON)) * invN;
      }

      return out;
    },
  },
};
