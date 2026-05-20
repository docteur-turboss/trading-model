import { InitialisationType } from './type';
import { gaussianNoise } from './utils';

export interface Initializer {
  initialize(fanIn: number, fanOut: number): number;
}

export const INITIALIZERS: Record<InitialisationType, Initializer> = {
  zeros: {
    initialize: () => 0,
  },

  he: {
    initialize: (fanIn: number) => {
      const scale = Math.sqrt(2 / fanIn);
      return gaussianNoise(scale);
    },
  },

  xavier: {
    initialize: (fanIn: number, fanOut: number) => {
      const limit = Math.sqrt(6 / (fanIn + fanOut));
      return (Math.random() * 2 - 1) * limit;
    },
  },

  leCun: {
    initialize: (fanIn: number) => {
      const scale = Math.sqrt(1 / fanIn);
      return gaussianNoise(scale);
    },
  },

  random: {
    initialize: () => {
      return Math.random() * 2 - 1;
    },
  },
};
