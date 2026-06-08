import TradingAgent from './trading-agent';

/** Configuration for the autonomous environment coupler. */
export type AutoEnvConfig = {
  onStep?: (res: { action: string; reward: number; metrics: Record<string, unknown> }) => void;
};

/**
 * Autonomous environment coupler used by genetic algorithm runners.
 * It couples a `TradingAgent` with its wallet and exposes `onMessage` which
 * should be called for each incoming market update (price + features).
 */
/** Autonomous environment coupler used by genetic algorithm runners. */
export class AutoEnv {
  constructor(
    private readonly agent: TradingAgent,
    private readonly cfg: AutoEnvConfig = {}
  ) {}

  /** Incoming market message. `features` is the observation vector; `price` updates wallet price. */
  public onMessage(features: Float32Array, price: number): void {
    const res = this.agent.step(features, price);
    if (this.cfg.onStep) this.cfg.onStep(res);
  }

  /** Reset the underlying agent for a new episode. */
  public reset(): void {
    this.agent.resetEpisode();
  }
}

export default AutoEnv;
