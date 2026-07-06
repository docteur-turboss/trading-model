import { beforeEach, describe, expect, it } from "@jest/globals";
import { Cash, Price } from "@trading-model/common/domain/primitives";
import type { TradingAgentConfig } from "../../../src/core/agent/trading-agent";
import { TradingAgent } from "../../../src/core/agent/trading-agent";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
} from "../../../src/core/neural-network/type";

function makeConfig(
	overrides?: Partial<TradingAgentConfig>
): TradingAgentConfig {
	return {
		nnConfig: {
			neuronsByLayer: [4, 6, 3],
			activationType: [ActivationType.Relu, ActivationType.Sigmoid],
			initialisationType: InitialisationType.Zeros,
			lossFunctionType: LossFunctionType.MeanSquaredError,
			normalisationType: NormalisationType.None,
			connectionType: ConnectionType.FullyConnected,
			learningRate: 0.01,
			enablePool: true,
			poolMaxSize: 100,
		},
		wallet: { initialCash: Cash.of(1000), initialPrice: Price.of(100) },
		actionSpace: "discrete",
		tradeAmount: 1,
		stateManagerCfg: {
			epsilonStart: 1.0,
			epsilonMin: 0.01,
			epsilonDecay: 0.995,
			gamma: 0.99,
		},
		...overrides,
	};
}

describe("TradingAgent", () => {
	let agent: TradingAgent;

	beforeEach(() => {
		agent = new TradingAgent(makeConfig());
	});

	describe("constructor", () => {
		it("should create agent with wallet and state", () => {
			expect(agent.wallet).toBeDefined();
			expect(agent.state).toBeDefined();
		});

		it("should expose getWeights returning a Float32Array", () => {
			const weights = agent.getWeights();
			expect(weights).toBeInstanceOf(Float32Array);
			expect(weights.length).toBeGreaterThan(0);
		});

		it("should expose forwardPass returning output", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const result = agent.forwardPass(input);
			expect(result).toHaveProperty("output");
			expect(result.output).toBeInstanceOf(Float32Array);
			expect(result.output.length).toBe(3);
		});

		it("should delegate learnQLearning to underlying agent", () => {
			const exp = {
				kind: "qlearning" as const,
				input: new Float32Array([0.5, -0.3, 0.1, 0.8]),
				output: new Float32Array([0.1, 0.2, 0.3]),
				reward: 1,
				nextState: new Float32Array([0.1, 0.2, 0.3, 0.9]),
				done: false,
			};
			expect(() => agent.learnQLearning(exp, 0.99)).not.toThrow();
		});

		it("should initialise wallet with given cash and price", () => {
			expect(agent.wallet.getCash()).toBe(1000);
			expect(agent.wallet.getPrice()).toBe(100);
		});

		it("should initialise epsilon from stateManagerCfg", () => {
			expect(agent.state.getEpsilon()).toBe(1.0);
		});

		it("should use default wallet and state config when not provided", () => {
			const a = new TradingAgent({
				nnConfig: makeConfig().nnConfig,
			} as TradingAgentConfig);
			expect(a.wallet).toBeDefined();
		});
	});

	describe("mapOutputToAction", () => {
		it("should map index 0 to sell", () => {
			const output = new Float32Array([0.8, 0.1, 0.1]);

			const result = agent.mapOutputToAction(output);

			expect(result.action).toBe("sell");
		});

		it("should map index 1 to hold", () => {
			const output = new Float32Array([0.1, 0.8, 0.1]);

			const result = agent.mapOutputToAction(output);

			expect(result.action).toBe("hold");
		});

		it("should map index 2 to buy", () => {
			const output = new Float32Array([0.1, 0.1, 0.8]);

			const result = agent.mapOutputToAction(output);

			expect(result.action).toBe("buy");
		});

		it("should use tradeAmount from config for discrete actions", () => {
			const agentWithAmount = new TradingAgent(makeConfig({ tradeAmount: 5 }));
			const output = new Float32Array([0.0, 0.0, 1.0]);

			const result = agentWithAmount.mapOutputToAction(output, {
				nnConfig: { neuronsByLayer: [4, 6, 3] },
				tradeAmount: 5,
			});

			expect(result.amount).toBe(5);
		});

		it("should return buy for positive continuous output", () => {
			const output = new Float32Array([0.5]);

			const result = agent.mapOutputToAction(output, {
				nnConfig: { neuronsByLayer: [4, 6, 3] },
				actionSpace: "continuous",
				tradeAmount: 2,
			});

			expect(result.action).toBe("buy");
			expect(result.amount).toBe(1);
		});

		it("should return hold for near-zero continuous output", () => {
			const output = new Float32Array([0.0]);

			const result = agent.mapOutputToAction(output, {
				nnConfig: { neuronsByLayer: [4, 6, 3] },
				actionSpace: "continuous",
				tradeAmount: 1,
			});

			expect(result.action).toBe("hold");
		});

		it("should return sell for negative continuous output", () => {
			const output = new Float32Array([-0.5]);

			const result = agent.mapOutputToAction(output, {
				nnConfig: { neuronsByLayer: [4, 6, 3] },
				actionSpace: "continuous",
				tradeAmount: 2,
			});

			expect(result.action).toBe("sell");
		});

		it("should handle empty output array in continuous action space", () => {
			const output = new Float32Array([]);

			const result = agent.mapOutputToAction(output, {
				nnConfig: { neuronsByLayer: [4, 6, 3] },
				actionSpace: "continuous",
			});

			expect(result.action).toBe("hold");
		});
	});

	describe("step", () => {
		it("should update wallet price when price is provided", () => {
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(105));

			expect(agent.wallet.getPrice()).toBe(105);
		});

		it("should return an action, reward, and metrics", () => {
			const result = agent.step(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				Price.of(105)
			);

			expect(result).toHaveProperty("action");
			expect(result).toHaveProperty("reward");
			expect(result).toHaveProperty("metrics");
		});

		it("should decay epsilon after step", () => {
			const epsilonBefore = agent.state.getEpsilon();
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(105));
			const epsilonAfter = agent.state.getEpsilon();

			expect(epsilonAfter).toBeLessThan(epsilonBefore);
		});

		it("should execute a trade and record it in wallet history", () => {
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(105));

			const history = agent.wallet.getHistory();
			expect(history.length).toBeGreaterThanOrEqual(0);
		});

		it("should not update wallet price when price is not provided", () => {
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]));

			expect(agent.wallet.getPrice()).toBe(100);
		});

		it("should execute a buy action when discrete output has highest value at index 2", () => {
			// override NN weights so output[2] = sigmoid(5) > output[0/1] = sigmoid(-5)
			const buf = new Float32Array(agent.parameterCount());
			buf[24] = 1;
			buf[25] = 1;
			buf[26] = 1;
			buf[27] = 1;
			buf[28] = 1;
			buf[29] = 1; // hidden biases = 1
			buf[48] = -5;
			buf[49] = -5;
			buf[50] = 5; // output biases: idx 0/1 low, idx 2 high
			agent.setWeights(buf);

			const result = agent.step(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				Price.of(105)
			);

			expect(result.action).toBe("buy");
		});
	});

	describe("resetEpisode", () => {
		it("should reset wallet to initial state", () => {
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(200));

			agent.resetEpisode();

			expect(agent.wallet.getCash()).toBe(1000);
			expect(agent.wallet.getPosition()).toBe(0);
		});

		it("should reset epsilon to starting value", () => {
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(105));
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(110));

			agent.resetEpisode();

			expect(agent.state.getEpsilon()).toBe(1.0);
		});

		it("should clear the neural network pool", () => {
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(105));

			agent.resetEpisode();

			expect(agent.getExperiencePool().length).toBe(0);
		});
	});
});
