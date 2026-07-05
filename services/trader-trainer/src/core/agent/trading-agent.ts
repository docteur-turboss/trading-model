import {
	createWallet,
	type WalletConfig,
	type WalletMetrics,
} from "../env/wallet-manager";
import { Agent } from "../neural-network/agent";
import type { Experience, NeuralNetworkConfig } from "../neural-network/type";
import StateManager, { type StateManagerConfig } from "./state-manager";

/** Configuration to create a TradingAgent with neural network, wallet, and RL state management. */
export interface TradingAgentConfig {
	nnConfig: NeuralNetworkConfig;
	wallet?: WalletConfig;
	actionSpace?: "discrete" | "continuous";
	tradeAmount?: number; // default fixed units per trade
	stateManagerCfg?: StateManagerConfig;
}

/** RL agent that couples a neural network with a simulated wallet and epsilon-greedy policy. */
export class TradingAgent {
	private readonly _agent: Agent;
	public readonly wallet: ReturnType<typeof createWallet>;
	public readonly state: StateManager;
	constructor(cfg: TradingAgentConfig) {
		this._agent = new Agent(cfg.nnConfig);
		this.wallet = createWallet(
			cfg.wallet ?? { initialCash: 1000, initialPrice: 1 }
		);
		this.state = new StateManager(cfg.stateManagerCfg ?? {});
	}

	/** Map network output to an action. Default: discrete {0: sell,1:hold,2:buy} */
	public mapOutputToAction(
		output: Float32Array,
		cfg?: TradingAgentConfig
	): { action: "buy" | "sell" | "hold"; amount: number } {
		const space = cfg?.actionSpace ?? "discrete";
		const amount = cfg?.tradeAmount ?? 1;

		if (space === "continuous") {
			// interpret single output neuron as -1..1 scaled action
			const val = output[0] ?? 0;
			if (val > 0.25) {
				return { action: "buy", amount: Math.max(1, Math.round(val * amount)) };
			}
			if (val < -0.25) {
				return {
					action: "sell",
					amount: Math.max(1, Math.round(-val * amount)),
				};
			}
			return { action: "hold", amount: 0 };
		}

	// discrete: choose argmax
		let idx = 0;
		for (let i = 1; i < output.length; i++) {
			if (output[i] > output[idx]) {
				idx = i;
			}
		}
		if (idx === 0) {
			return { action: "sell", amount };
		}
		if (idx === 1) {
			return { action: "hold", amount: 0 };
		}
		return { action: "buy", amount };
	}

	/** Perform one environment step: update price, infer action, apply to wallet, and record reward */
	public step(
		input: Float32Array,
		price?: number
	): { action: string; reward: number; metrics: WalletMetrics } {
		if (price !== undefined) {
			this.wallet.setPrice(price);
		}

		const currentPnL = this.wallet.getPnL();
		const output = this._agent.fastForward({ input });

		const { action, amount } = this.mapOutputToAction(output);

		let executed = false;
		if (action === "buy") {
			executed = this.wallet.buy(amount);
		}
		if (action === "sell") {
			executed = this.wallet.sell(amount);
		}

		const nextPnL = this.wallet.getPnL();
		const reward = nextPnL - currentPnL;

		// Attach reward/nextState to the last pooled experience via fastForward call semantics
		// The Agent.fastForward already pushed the experience with reward/nextState undefined,
		// so we perform a small learning step here if possible.

		// decay epsilon as episode proceeds
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
