import { ActivationType } from "./type";

export interface ActivationDefinition {
  fn(x: number): number;
  derivative(a: number, z: number): number;
}

export const ACTIVATIONS: Record<ActivationType, ActivationDefinition> = {
  sigmoid: {
    fn: x => 1 / (1 + Math.exp(-x)),
    derivative: a => a * (1 - a),
  },

  tanh: {
    fn: x => Math.tanh(x),
    derivative: a => 1 - a * a,
  },

  ReLu: {
    fn: x => Math.max(0, x),
    derivative: (_, z) => z > 0 ? 1 : 0,
  },

  leakyReLu: {
    fn: x => x > 0 ? x : 0.01 * x,
    derivative: (_, z) => z > 0 ? 1 : 0.01,
  },

  ELU: {
    fn: x => x >= 0 ? x : 0.01 * (Math.exp(x) - 1),
    derivative: (_, z) => z >= 0 ? 1 : 0.01 * Math.exp(z),
  },

  GELU: {
    fn: x => {
      const inner = Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3);
      return 0.5 * x * (1 + Math.tanh(inner));
    },

    derivative: (_, z) => {
      const c = Math.sqrt(2 / Math.PI);
      const t = Math.tanh(c * (z + 0.044715 * z ** 3));

      return (
        0.5 * (1 + t) +
        0.5 * z * (1 - t ** 2) * c * (1 + 3 * 0.044715 * z ** 2)
      );
    },
  },

  mish: {
    fn: x => x * Math.tanh(Math.log(1 + Math.exp(x))),

    derivative: (_, z) => {
      const sp = Math.log(1 + Math.exp(z));
      const th = Math.tanh(sp);
      const sig = Math.exp(z) / (1 + Math.exp(z));

      return th + z * (1 - th ** 2) * sig;
    },
  },

  softmax: {
    fn: x => x,
    derivative: () => 1,
  }
};