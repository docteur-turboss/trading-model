import { Cash, Price, Volume } from "@trading-model/common/domain/primitives";
import {
	createWallet,
	type WalletAPI,
	type WalletConfig,
	type WalletMetrics,
} from "../env/wallet-manager";
import { Agent } from "../neural-network/agent";
import type { Experience, NeuralNetworkConfig } from "../neural-network/type";
import { ActionMapper } from "./action-mapper";
import { TradeAction, ActionSpace } from "./action-types";
import StateManager, { type StateManagerConfig } from "./state-manager";

export interface TradingAgentConfig {
	nnConfig: NeuralNetworkConfig;
	wallet?: WalletConfig;
	actionSpace?: ActionSpace;
	tradeAmount?: Volume;
	stateManagerCfg?: StateManagerConfig;
}

type ActionExecutor = (wallet: WalletAPI, amount: Volume) => boolean;

const ACTION_EXECUTORS: Record<TradeAction, ActionExecutor> = {
	[TradeAction.Buy]: (wallet: WalletAPI, amount: Volume) => wallet.buy(Volume.of(amount)),
	[TradeAction.Sell]: (wallet: WalletAPI, amount: Volume) => wallet.sell(Volume.of(amount)),
	[TradeAction.Hold]: () => false,
};

export class TradingAgent {
	private readonly _agent: Agent;
	private readonly _actionMapper: ActionMapper;
	public readonly wallet: WalletAPI;
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
	): { action: TradeAction; amount: Volume } {
		if (cfg) {
			const mapper = new ActionMapper(cfg);
			return mapper.map(output);
		}
		return this._actionMapper.map(output);
	}

	public step(
		input: Float32Array,
		price?: Price
	): { action: TradeAction | "none"; reward: number; metrics: WalletMetrics } {
		if (price !== undefined) {
			this.wallet.setPrice(price);
		}
		const currentPnL = this.wallet.getPnL();

		const output = this._agent.fastForward({ input });
		const { action, amount } = this._actionMapper.map(output);
		const executor = ACTION_EXECUTORS[action];
		const executed = executor(this.wallet, amount);

		const reward = this.wallet.getPnL() - currentPnL;
		this.state.decayEpsilon();

		return {
			action: executed ? action : "none",
			reward,
			metrics: this.wallet.getMetrics(),
		};
	}

	public forwardPass(input: Float32Array): { output: Float32Array } {
		return this._agent.nn.forward(input);
	}

	public getWeights(): Float32Array {
		return this._agent.nn.getWeights();
	}

	public setWeights(weights: Float32Array): void {
		this._agent.nn.setWeights(weights);
	}

	public parameterCount(): number {
		return this._agent.nn.parameterCount();
	}

	public getExperiencePool(): Experience[] {
		return this._agent.experience.getPool();
	}

	public learnQLearning(exp: Experience, gamma: number): void {
		this._agent.experience.learnExperience(this._agent.nn, exp, gamma);
	}

	public resetEpisode(): void {
		this.wallet.reset();
		this._agent.experience.clearPool();
		this.state.resetEpsilon();
	}
}

export default TradingAgent;
