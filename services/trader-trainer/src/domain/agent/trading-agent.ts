import { Cash, Price, Volume } from "@trading-model/primitives/primitives";
import {
	createWallet,
	type WalletAPI,
	type WalletConfig,
} from "../env/wallet-manager";
import { Agent } from "../neural-network/agent";
import type {
	Experience,
	NeuralNetworkConfig,
	QLearningExperience,
} from "../neural-network/type";
import { ActionMapper } from "./action-mapper";
import { TradeAction } from "./action-types";
import { observe } from "./agent-state";
import StateManager, { type StateManagerConfig } from "./state-manager";

export interface TradingAgentConfig {
	nnConfig: NeuralNetworkConfig;
	wallet?: WalletConfig;
	tradeAmount?: Volume;
	stateManagerCfg?: StateManagerConfig;
	/** Show the position to the network (default); false feeds a constant. */
	observePosition?: boolean;
	/**
	 * Size every trade as this share of the initial cash at the current price,
	 * instead of `tradeAmount` units: a fixed unit count cannot be bought once
	 * one unit costs more than the cash (BTC). A sale never exceeds the position.
	 */
	tradeFraction?: number;
}

const VolumeDecimals = 1e8;

type ActionExecutor = (wallet: WalletAPI, amount: Volume) => boolean;

const ACTION_EXECUTORS: Record<TradeAction, ActionExecutor> = {
	[TradeAction.Buy]: (wallet: WalletAPI, amount: Volume) =>
		wallet.buy(Volume.of(amount)),
	[TradeAction.Sell]: (wallet: WalletAPI, amount: Volume) =>
		wallet.sell(Volume.of(amount)),
	[TradeAction.Hold]: () => false,
	[TradeAction.None]: () => false,
};

interface StepResult {
	/** What the network saw: market features followed by the agent state. */
	state: Float32Array;
	action: TradeAction;
	/** Output unit the policy acted on (exploration included). */
	actionIndex: number;
	/**
	 * Reward of the decision taken at the previous step, realised now: the PnL
	 * change from just before its trade (its cost) to this step's price (the
	 * move on the position it left). 0 at the first step of an episode.
	 */
	reward: number;
}

export class TradingAgent {
	private readonly _agent: Agent;
	private readonly _observePosition: boolean;
	private readonly _tradeCash: number | undefined;
	/** PnL just before the previous decision's trade; null before the first. */
	private _pnlBeforeLastTrade: number | null = null;
	private readonly _actionMapper: ActionMapper;
	public readonly wallet: WalletAPI;
	public readonly state: StateManager;

	constructor(cfg: TradingAgentConfig) {
		this._observePosition = cfg.observePosition ?? true;
		this._tradeCash =
			cfg.tradeFraction === undefined
				? undefined
				: Number(cfg.wallet?.initialCash ?? 1000) * cfg.tradeFraction;
		this._agent = new Agent(cfg.nnConfig);
		this.wallet = createWallet(
			cfg.wallet ?? { initialCash: Cash.of(1000), initialPrice: Price.of(1) }
		);
		this.state = new StateManager(cfg.stateManagerCfg ?? {});
		this._actionMapper = new ActionMapper({ ...cfg, rng: cfg.nnConfig.rng });
	}

	public mapOutputToAction(
		output: Float32Array,
		cfg?: TradingAgentConfig
	): { action: TradeAction; amount: Volume } {
		if (cfg) {
			const mapper = new ActionMapper({ ...cfg, rng: cfg.nnConfig.rng });
			return mapper.map(output);
		}
		return this._actionMapper.map(output);
	}

	/**
	 * Marks the wallet to `price`, settles the previous decision's reward,
	 * then decides and trades. A decision's reward is only known one step
	 * later: the price move it is exposed to comes with the next price.
	 */
	public step(input: Float32Array, price?: Price): StepResult {
		if (price !== undefined) {
			this.wallet.setPrice(price);
		}
		const markedPnl = Number(this.wallet.getPnL());
		const reward =
			this._pnlBeforeLastTrade === null
				? 0
				: markedPnl - this._pnlBeforeLastTrade;

		const state = observe(input, this.wallet, this._observePosition);
		const { output } = this._agent.nn.forward(state);
		const { action, amount, outputIndex } = this._actionMapper.map(
			output,
			this.state.getEpsilon()
		);
		const executed = ACTION_EXECUTORS[action](
			this.wallet,
			this._tradeSize(action, amount)
		);
		this._pnlBeforeLastTrade = markedPnl;
		this.state.decayEpsilon();

		return {
			state,
			action: executed ? action : TradeAction.None,
			actionIndex: outputIndex,
			reward,
		};
	}

	private _tradeSize(action: TradeAction, mapped: Volume): Volume {
		if (this._tradeCash === undefined || action === TradeAction.Hold) {
			return mapped;
		}
		let units = this._tradeCash / Number(this.wallet.getPrice());
		if (action === TradeAction.Sell) {
			units = Math.min(units, Number(this.wallet.getPosition()));
		}
		return Volume.of(Math.floor(units * VolumeDecimals) / VolumeDecimals);
	}

	/** Stores a transition in the replay buffer. */
	public remember(exp: QLearningExperience): void {
		this._agent.experience.remember(exp);
	}

	/** One experience-replay update; returns the transitions trained on. */
	public replay(batchSize: number, discount: number): number {
		return this._agent.experience.replay(this._agent.nn, batchSize, discount);
	}

	/** Q-values for these market features and the agent's current holding. */
	public forwardPass(input: Float32Array): { output: Float32Array } {
		return this._agent.nn.forward(
			observe(input, this.wallet, this._observePosition)
		);
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

	public resetEpisode(): void {
		this._pnlBeforeLastTrade = null;
		this.wallet.reset();
		this._agent.experience.clearPool();
		this.state.resetEpsilon();
	}
}

export default TradingAgent;
