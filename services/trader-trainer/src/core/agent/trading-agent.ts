import { Cash, Price, Volume } from "@trading-model/common/domain/primitives";
import {
	createWallet,
	type WalletConfig,
	type WalletMetrics,
} from "../env/wallet-manager";
import { Agent } from "../neural-network/agent";
import type { Experience, NeuralNetworkConfig } from "../neural-network/type";
import StateManager, { type StateManagerConfig } from "./state-manager";
import { ActionMapper } from "./action-mapper";

export interface TradingAgentConfig {
	nnConfig: NeuralNetworkConfig;
	wallet?: WalletConfig;
	actionSpace?: "discrete" | "continuous";
	tradeAmount?: Volume;
	stateManagerCfg?: StateManagerConfig;
}

export class TradingAgent {
	private readonly _agent: Agent;
	private readonly _actionMapper: ActionMapper;
	public readonly wallet: ReturnType<typeof createWallet>;
	public readonly state: StateManager;

	constructor(cfg: TradingAgentConfig) {
		this._agent = new Agent(cfg.nnConfig);
		this.wallet = createWallet(
			cfg.wallet ?? { initialCash: Cash.of(1000), initialPrice: Price.of(1) }
		);
		this.state = new StateManager(cfg.stateManagerCfg ?? {});
		this._actionMapper = new ActionMapper(cfg);
	}

	public mapOutputToAction(
		output: Float32Array,
		cfg?: TradingAgentConfig
	): { action: "buy" | "sell" | "hold"; amount: Volume } {
		if (cfg) {
			const mapper = new ActionMapper(cfg);
			return mapper.map(output);
		}
		return this._actionMapper.map(output);
	}

	public step(
		input: Float32Array,
		price?: Price
	): { action: string; reward: number; metrics: WalletMetrics } {
		if (price !== undefined) {
			this.wallet.setPrice(price);
		}
		const currentPnL = this.wallet.getPnL();

		const output = this._agent.fastForward({ input });
		const { action, amount } = this._actionMapper.map(output);
		const executed = action === "buy"
			? this.wallet.buy(Volume.of(amount))
			: action === "sell"
				? this.wallet.sell(Volume.of(amount))
				: false;

		const reward = this.wallet.getPnL() - currentPnL;
		this.state.decayEpsilon();

		return {
			action: executed ? action : "none",
			reward,
			metrics: this.wallet.getMetrics(),
		};
	}

	public forwardPass(input: Float32Array): { output: Float32Array } {
		return this._agent.forward(input);
	}

	public getWeights(): Float32Array {
		return this._agent.getWeights();
	}

	public setWeights(weights: Float32Array): void {
		this._agent.setWeights(weights);
	}

	public parameterCount(): number {
		return this._agent.parameterCount();
	}

	public getExperiencePool(): Experience[] {
		return this._agent.getPool();
	}

	public learnQLearning(exp: Experience, gamma: number): void {
		this._agent.learnQLearning(exp, gamma);
	}

	public resetEpisode(): void {
		this.wallet.reset();
		this._agent.clearPool();
		this.state.resetEpsilon();
	}
}

export default TradingAgent;
