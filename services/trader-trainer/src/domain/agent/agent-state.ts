import type { WalletAPI } from "@trading-model/model-runtime/env/wallet-manager";
import { FEATURE_LAYOUT } from "@trading-model/model-runtime/feature-vector-codec";

/**
 * What the agent holds, appended to the market features: a decision's reward
 * depends on the position it adds to, so the network has to see it.
 * - AgentExposure: value of the position / total valuation, from 0 (all
 *   cash) to 1 (all invested), centred to [-1, 1] like the other inputs: the
 *   raw [0, 1] value learned measurably worse (ADR-0025).
 */
const AGENT_STATE_FIELDS = ["AgentExposure"] as const;
const AGENT_STATE_DIM = AGENT_STATE_FIELDS.length;

/** Inputs of the trading network (model artifacts, ADR-0022, ADR-0025). */
export const NETWORK_INPUT_LAYOUT: { dim: number; fields: string[] } = {
	dim: FEATURE_LAYOUT.dim + AGENT_STATE_DIM,
	fields: [...FEATURE_LAYOUT.fields, ...AGENT_STATE_FIELDS],
};

/** Extra input of an event-driven genome: bars since its last decision. */
const BARS_SINCE_FIELD = "BarsSinceDecision";

/** Input layout of an event-driven network: the base one plus the elapsed bars. */
export const EVENT_INPUT_LAYOUT: { dim: number; fields: string[] } = {
	dim: NETWORK_INPUT_LAYOUT.dim + 1,
	fields: [...NETWORK_INPUT_LAYOUT.fields, BARS_SINCE_FIELD],
};

/** Exposure shown when the position is hidden: always "flat". */
const HIDDEN_EXPOSURE = -1;

function agentState(wallet: WalletAPI): Float32Array {
	const valuation = Number(wallet.getValuation());
	const held = Number(wallet.getPosition()) * Number(wallet.getPrice());
	const exposure = valuation > 0 ? held / valuation : 0;
	return Float32Array.of(2 * exposure - 1);
}

/**
 * The network input: market features followed by the agent state. With
 * `showPosition` false the state is a constant (same input size, no
 * information), to measure what seeing the position is worth (ADR-0025).
 * `barsSince` (already in [-1, 1]) adds the event-driven input.
 */
export function observe(
	market: Float32Array,
	wallet: WalletAPI,
	showPosition = true,
	barsSince?: number
): Float32Array {
	const input = new Float32Array(
		market.length + AGENT_STATE_DIM + (barsSince === undefined ? 0 : 1)
	);
	input.set(market);
	input.set(
		showPosition ? agentState(wallet) : Float32Array.of(HIDDEN_EXPOSURE),
		market.length
	);
	if (barsSince !== undefined) {
		input[input.length - 1] = barsSince;
	}
	return input;
}
