import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type {
	Percentage,
	PositiveInt,
} from "@trading-model/primitives/primitives";
import { Cash, Price, Volume } from "@trading-model/primitives/primitives";
import type { TradingAgentConfig } from "../../../src/domain/agent/trading-agent";
import { TradingAgent } from "../../../src/domain/agent/trading-agent";
import {
	ActivationType,
	ConnectionType,
	ExperienceKind,
	InitialisationType,
	NormalisationType,
} from "../../../src/domain/neural-network/type";

function makeConfig(
	overrides?: Partial<TradingAgentConfig>
): TradingAgentConfig {
	return {
		nnConfig: {
			// 4 market features + the agent state (exposure)
			neuronsByLayer: [5 as PositiveInt, 6 as PositiveInt, 3 as PositiveInt],
			activationType: [ActivationType.Relu, ActivationType.Sigmoid],
			initialisationType: InitialisationType.Zeros,
			normalisationType: NormalisationType.None,
			connectionType: ConnectionType.FullyConnected,
			learningRate: 0.01 as Percentage,
			enablePool: true,
			poolMaxSize: 100 as PositiveInt,
		},
		wallet: { initialCash: Cash.of(1000), initialPrice: Price.of(100) },
		tradeAmount: Volume.of(1),
		stateManagerCfg: {
			epsilonStart: 0,
			epsilonMin: 0,
			epsilonDecay: 0.995,
		},
		...overrides,
	};
}

function transition() {
	return {
		kind: ExperienceKind.QLearning as const,
		input: new Float32Array([0.5, -0.3, 0.1, 0.8, -1]),
		output: new Float32Array(0),
		reward: 1 as never,
		nextState: new Float32Array([0.1, 0.2, 0.3, 0.9, -1]),
		done: false,
		action: 2,
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

		it("should initialise wallet with given cash and price", () => {
			expect(agent.wallet.getCash()).toBe(1000);
			expect(agent.wallet.getPrice()).toBe(100);
		});

		it("should initialise epsilon from stateManagerCfg", () => {
			const epsilonAgent = new TradingAgent(
				makeConfig({
					stateManagerCfg: {
						epsilonStart: 1.0,
						epsilonMin: 0.01,
						epsilonDecay: 0.995,
					},
				})
			);
			expect(epsilonAgent.state.getEpsilon()).toBe(1.0);
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
			expect((result as { outputIndex?: number }).outputIndex).toBe(0);
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
			expect((result as { outputIndex?: number }).outputIndex).toBe(2);
		});

		it("should use tradeAmount from config for discrete actions", () => {
			const agentWithAmount = new TradingAgent(
				makeConfig({ tradeAmount: Volume.of(5) })
			);
			const output = new Float32Array([0.0, 0.0, 1.0]);

			const result = agentWithAmount.mapOutputToAction(output, {
				nnConfig: {
					neuronsByLayer: [
						5 as PositiveInt,
						6 as PositiveInt,
						3 as PositiveInt,
					],
				},
				tradeAmount: Volume.of(5),
			});

			expect(result.amount).toBe(5);
		});
	});

	describe("step", () => {
		afterEach(() => {
			jest.restoreAllMocks();
		});

		it("should record the explored action, not the greedy one", () => {
			const explorer = new TradingAgent(
				makeConfig({
					stateManagerCfg: { epsilonStart: 1, epsilonMin: 1, epsilonDecay: 1 },
				})
			);
			// Zero weights give equal Q-values, so the greedy pick is index 0;
			// the rolls force exploration onto index 2 instead.
			jest
				.spyOn(Math, "random")
				.mockReturnValueOnce(0)
				.mockReturnValueOnce(0.9);

			const result = explorer.step(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				Price.of(105)
			);

			expect(result.actionIndex).toBe(2);
		});

		it("should return the greedy action when not exploring", () => {
			const result = agent.step(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				Price.of(105)
			);

			expect(result.actionIndex).toBe(0);
		});

		it("should pay a decision with the price move that follows it", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const buyer = new TradingAgent(makeConfig());
			jest
				.spyOn((buyer as any)._agent.nn, "forward")
				.mockReturnValue({ output: new Float32Array([0, 0, 1]) });

			const first = buyer.step(input, Price.of(100));
			const second = buyer.step(input, Price.of(110));

			// nothing was decided before the first step
			expect(first.reward).toBe(0);
			// the unit bought at 100 gained 10, less what buying it cost
			expect(second.reward).toBeGreaterThan(9);
			expect(second.reward).toBeLessThanOrEqual(10);
		});

		it("fills the decision at fillPrice, marked at price", () => {
			const buyer = new TradingAgent(makeConfig());
			jest
				.spyOn((buyer as any)._agent.nn, "forward")
				.mockReturnValue({ output: new Float32Array([0, 0, 1]) });

			buyer.step(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				Price.of(100),
				Price.of(104)
			);

			expect(buyer.wallet.getCash()).toBe(1000 - 104);
			expect(buyer.wallet.getPrice()).toBe(100);
		});

		it("should update wallet price when price is provided", () => {
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(105));

			expect(agent.wallet.getPrice()).toBe(105);
		});

		it("should return an action and a reward", () => {
			const result = agent.step(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				Price.of(105)
			);

			expect(result).toHaveProperty("action");
			expect(result).toHaveProperty("reward");
		});

		it("should decay epsilon after step", () => {
			const epsilonAgent = new TradingAgent(
				makeConfig({
					stateManagerCfg: {
						epsilonStart: 1.0,
						epsilonMin: 0.01,
						epsilonDecay: 0.995,
					},
				})
			);
			const epsilonBefore = epsilonAgent.state.getEpsilon();
			epsilonAgent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]), Price.of(105));
			const epsilonAfter = epsilonAgent.state.getEpsilon();

			expect(epsilonAfter).toBeLessThan(epsilonBefore);
		});

		it("should not update wallet price when price is not provided", () => {
			agent.step(new Float32Array([0.5, -0.3, 0.1, 0.8]));

			expect(agent.wallet.getPrice()).toBe(100);
		});

		it("should execute a buy action when discrete output has highest value at index 2", () => {
			const buf = new Float32Array(agent.parameterCount());
			// 5 inputs x 6 hidden weights, then the 6 hidden biases
			for (let idx = 30; idx < 36; idx++) {
				buf[idx] = 1;
			}
			// then 6 x 3 output weights, then the 3 output biases
			buf[54] = -5;
			buf[55] = -5;
			buf[56] = 5;
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

			expect(agent.state.getEpsilon()).toBe(0);
		});

		it("should clear the replay buffer", () => {
			agent.remember(transition());

			agent.resetEpisode();

			expect(agent.getExperiencePool().length).toBe(0);
		});

		it("should not carry the last decision's reward into the next episode", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			agent.step(input, Price.of(105));

			agent.resetEpisode();

			expect(agent.step(input, Price.of(150)).reward).toBe(0);
		});
	});

	describe("trade size", () => {
		function trader(output: number[]) {
			const agent = new TradingAgent(makeConfig({ tradeFraction: 0.1 }));
			jest
				.spyOn((agent as any)._agent.nn, "forward")
				.mockReturnValue({ output: new Float32Array(output) });
			return agent;
		}
		const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);

		it("buys a tenth of the initial cash even when one unit costs more than the cash", () => {
			const agent = trader([0, 0, 1]);

			agent.step(input, Price.of(77_000));

			expect(Number(agent.wallet.getPosition())).toBeCloseTo(100 / 77_000, 8);
		});

		it("never sells more than the position", () => {
			const agent = trader([0, 0, 1]);
			agent.step(input, Price.of(100));
			jest
				.spyOn((agent as any)._agent.nn, "forward")
				.mockReturnValue({ output: new Float32Array([1, 0, 0]) });

			// one unit was bought at 100; at 50 a tenth of the cash is 2 units
			const sale = agent.step(input, Price.of(50));

			expect(sale.action).toBe("sell");
			expect(Number(agent.wallet.getPosition())).toBe(0);
		});
	});

	describe("agent state", () => {
		it("shows the network its exposure, -1 flat and higher once invested", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const buyer = new TradingAgent(makeConfig());
			jest
				.spyOn((buyer as any)._agent.nn, "forward")
				.mockReturnValue({ output: new Float32Array([0, 0, 1]) });

			const flat = buyer.step(input, Price.of(100));
			const invested = buyer.step(input, Price.of(100));

			expect(Array.from(flat.state.slice(0, 4))).toEqual(Array.from(input));
			expect(flat.state[4]).toBe(-1);
			// one unit of 100 out of 1000: exposure 0.1, centred to -0.8
			expect(invested.state[4]).toBeCloseTo(-0.8, 2);
		});

		it("feeds a constant instead when the position is hidden", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const buyer = new TradingAgent(makeConfig({ observePosition: false }));
			jest
				.spyOn((buyer as any)._agent.nn, "forward")
				.mockReturnValue({ output: new Float32Array([0, 0, 1]) });

			buyer.step(input, Price.of(100));
			const invested = buyer.step(input, Price.of(100));

			expect(Number(buyer.wallet.getPosition())).toBeGreaterThan(0);
			expect(invested.state[4]).toBe(-1);
		});
	});

	describe("replay", () => {
		it("should not train before the buffer holds a full batch", () => {
			const before = agent.getWeights().slice();
			agent.remember(transition());

			expect(agent.replay(2, 0.99)).toBe(0);
			expect(agent.getWeights()).toEqual(before);
		});

		it("should train on a sampled batch once the buffer holds one", () => {
			const before = agent.getWeights().slice();
			agent.remember(transition());
			agent.remember(transition());

			expect(agent.replay(2, 0.99)).toBe(2);
			expect(agent.getWeights()).not.toEqual(before);
		});
	});
});
