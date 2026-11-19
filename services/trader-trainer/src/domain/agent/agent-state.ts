import {
	AGENT_STATE_DIM,
	AGENT_STATE_FIELDS,
} from "@trading-model/model-runtime/agent/agent-state";
import { FEATURE_LAYOUT } from "@trading-model/model-runtime/feature-vector-codec";
import { signalFieldNames } from "../signal-features";

/** Inputs of the trading network (model artifacts, ADR-0022, ADR-0025); `signalKeys`: ADR-0081. */
export function networkInputLayout(signalKeys: readonly string[] = []): {
	dim: number;
	fields: string[];
} {
	const signals = signalFieldNames(signalKeys);
	return {
		dim: FEATURE_LAYOUT.dim + signals.length + AGENT_STATE_DIM,
		fields: [...FEATURE_LAYOUT.fields, ...signals, ...AGENT_STATE_FIELDS],
	};
}

export const NETWORK_INPUT_LAYOUT = networkInputLayout();

/** Extra input of an event-driven genome: bars since its last decision. */
const BARS_SINCE_FIELD = "BarsSinceDecision";

/** Input layout of an event-driven network: the base one plus the elapsed bars. */
export function eventInputLayout(signalKeys: readonly string[] = []): {
	dim: number;
	fields: string[];
} {
	const base = networkInputLayout(signalKeys);
	return {
		dim: base.dim + 1,
		fields: [...base.fields, BARS_SINCE_FIELD],
	};
}
