import TradingAgent from "./trading_agent";

export type AutoEnvConfig = {
  onStep?: (res: { action: string; reward: number; metrics: any }) => void;
};

/**
 * Autonomous environment coupler used by genetic algorithm runners.
 * It couples a `TradingAgent` with its wallet and exposes `onMessage` which
 * should be called for each incoming market update (price + features).
 */
export class AutoEnv {
  constructor(private readonly agent: TradingAgent, private readonly cfg: AutoEnvConfig = {}) {}

  /** Incoming market message. `features` is the observation vector; `price` updates wallet price. */
  public onMessage(features: Float32Array, price: number): void {
    const res = this.agent.step(features, price, false);
    if (this.cfg.onStep) this.cfg.onStep(res);
  }

  public reset(): void {
    this.agent.resetEpisode();
  }
}

export default AutoEnv;
