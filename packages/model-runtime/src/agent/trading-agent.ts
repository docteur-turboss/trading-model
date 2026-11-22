import { type Price, Volume } from "@trading-model/primitives/primitives";
import { DEFAULT_MAX_EXPOSURE_FRACTION } from "../env/wallet-config";
import {
	createWallet,
	type WalletAPI,
	type WalletConfig,
} from "../env/wallet-manager";
import { ActionMapper, type ActionSetId } from "./action-mapper";
import { TradeAction } from "./action-types";
import { observe } from "./agent-state";
import { applyInputMask } from "./input-mask";
import StateManager, { type StateManagerConfig } from "./state-manager";

/** The network the agent decides with: its Q-values for an input. */
export interface PolicyNetwork {
	forward(input: Float32Array): { output: Float32Array };
}

export interface TradingAgentConfig {
	wallet: WalletConfig;
	/** Uniform [0, 1) source of the exploration. */
	rng?: () => number;
	tradeAmount?: Volume;
	actionSet?: ActionSetId;
	stateManagerCfg?: StateManagerConfig;
	/** Show the position to the network (default); false feeds a constant. */
	observePosition?: boolean;
	/** Input groups of the genome (ADR-0082): a false group is zeroed before the network. */
	inputMask?: readonly boolean[];
	/**
	 * Size every trade as this share of the initial cash at the current price,
	 * instead of `tradeAmount` units: a fixed unit count cannot be bought once
	 * one unit costs more than the cash (BTC). A sale never exceeds the position.
	 */
	tradeFraction?: number;
}

const VolumeDecimals = 1e8;

type ActionExecutor = (
	wallet: WalletAPI,
	amount: Volume,
	fillPrice?: Price
) => boolean;

const ACTION_EXECUTORS: Record<TradeAction, ActionExecutor> = {
	[TradeAction.Buy]: (wallet, amount, fillPrice) =>
		wallet.buy(Volume.of(amount), fillPrice),
	[TradeAction.Sell]: (wallet, amount, fillPrice) =>
		wallet.sell(Volume.of(amount), fillPrice),
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

/** Decides and trades on a wallet with a given network (ADR-0066); training stays in trader-trainer. */
export class TradingAgent {
	private readonly _observePosition: boolean;
	private readonly _inputMask: readonly boolean[] | undefined;
	private readonly _exposureCash: number;
	private readonly _tradeCash: number | undefined;
	/** PnL just before the previous decision's trade; null before the first. */
	private _pnlBeforeLastTrade: number | null = null;
	private readonly _actionMapper: ActionMapper;
	public readonly wallet: WalletAPI;
	public readonly state: StateManager;

	constructor(
		cfg: TradingAgentConfig,
		private readonly _network: PolicyNetwork
	) {
		this._observePosition = cfg.observePosition ?? true;
		this._inputMask = cfg.inputMask;
		this._tradeCash =
			cfg.tradeFraction === undefined
				? undefined
				: Number(cfg.wallet.initialCash) * cfg.tradeFraction;
		this._exposureCash =
			Number(cfg.wallet.initialCash) *
			(cfg.wallet.maxExposureFraction ?? DEFAULT_MAX_EXPOSURE_FRACTION);
		this.wallet = createWallet(cfg.wallet);
		this.state = new StateManager(cfg.stateManagerCfg ?? {});
		this._actionMapper = new ActionMapper(cfg);
	}

	/**
	 * Marks the wallet to `price`, settles the previous decision's reward,
	 * then decides and trades at `fillPrice` (the next bar's open, ADR-0066;
	 * the marked price when omitted). The trade is sized on the marked price,
	 * the only one known at decision time. A decision's reward is only known
	 * one step later: the price move it is exposed to comes with the next price.
	 */
	public step(
		input: Float32Array,
		price?: Price,
		fillPrice?: Price,
		barsSince?: number
	): StepResult {
		if (price !== undefined) {
			this.wallet.setPrice(price);
		}
		const markedPnl = Number(this.wallet.getPnL());
		const reward =
			this._pnlBeforeLastTrade === null
				? 0
				: markedPnl - this._pnlBeforeLastTrade;

		const state = observe(
			applyInputMask(input, this._inputMask),
			this.wallet,
			this._observePosition,
			barsSince
		);
		const { output } = this._network.forward(state);
		const { action, amount, share, outputIndex } = this._actionMapper.map(
			output,
			this.state.getEpsilon()
		);
		const executed = ACTION_EXECUTORS[action](
			this.wallet,
			this._tradeSize(action, amount, share),
			fillPrice
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

	private _tradeSize(
		action: TradeAction,
		mapped: Volume,
		share?: number
	): Volume {
		if (share !== undefined) {
			return this._partialSize(action, share);
		}
		if (this._tradeCash === undefined || action === TradeAction.Hold) {
			return mapped;
		}
		let units = this._tradeCash / Number(this.wallet.getPrice());
		if (action === TradeAction.Sell) {
			units = Math.min(units, Number(this.wallet.getPosition()));
		}
		return Volume.of(Math.floor(units * VolumeDecimals) / VolumeDecimals);
	}

	private _partialSize(action: TradeAction, share: number): Volume {
		const position = Number(this.wallet.getPosition());
		const base =
			action === TradeAction.Sell
				? position
				: Math.max(
						0,
						this._exposureCash / Number(this.wallet.getPrice()) - position
					);
		return Volume.of(
			Math.floor(base * share * VolumeDecimals) / VolumeDecimals
		);
	}

	/** Q-values for these market features and the agent's current holding. */
	public forwardPass(input: Float32Array): { output: Float32Array } {
		return this._network.forward(
			observe(
				applyInputMask(input, this._inputMask),
				this.wallet,
				this._observePosition
			)
		);
	}

	public resetEpisode(): void {
		this._pnlBeforeLastTrade = null;
		this.wallet.reset();
		this.state.resetEpsilon();
	}
}
