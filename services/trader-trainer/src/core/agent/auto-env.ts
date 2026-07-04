import type { WalletMetrics } from "../env/wallet-manager";
import type TradingAgent from "./trading-agent";

/** Configuration for the autonomous environment coupler. */
export interface AutoEnvConfig {
	onStep?: (res: {
		action: string;
		reward: number;
		metrics: WalletMetrics;
	}) => void;
}

/**
 * Autonomous environment coupler used by genetic algorithm runners.
 * It couples a `TradingAgent` with its wallet and exposes `onMessage` which
 * should be called for each incoming market update (price + features).
 */
/** Autonomous environment coupler used by genetic algorithm runners. */
export class AutoEnv {
	constructor(
		private readonly _agent: TradingAgent,
		private readonly _cfg: AutoEnvConfig = {}
	) {}

	/** Incoming market message. `features` is the observation vector; `price` updates wallet price. */
	public onMessage(features: Float32Array, price: number): void {
		const res = this._agent.step(features, price);
		if (this._cfg.onStep) {
			this._cfg.onStep(res);
		}
	}

	/** Reset the underlying agent for a new episode. */
	public reset(): void {
		this._agent.resetEpisode();
	}
}

export default AutoEnv;
