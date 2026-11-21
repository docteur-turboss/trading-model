export type ExecutionMode = "paper" | "live";
export type DeploymentEnv = "development" | "ci" | "staging" | "production";

/**
 * ADR-0064 §6: refuses to start on a forbidden combination. `live` runs only
 * in production with live keys; `paper` never holds live keys.
 */
export function assertExecutionLock(input: {
	mode: ExecutionMode;
	env: DeploymentEnv;
	hasLiveKeys: boolean;
}): void {
	const { mode, env, hasLiveKeys } = input;
	if (mode === "live" && env !== "production") {
		throw new Error(
			`EXECUTION_MODE=live refused outside production (DEPLOYMENT_ENV=${env})`
		);
	}
	if (mode === "live" && !hasLiveKeys) {
		throw new Error("EXECUTION_MODE=live refused: no live broker keys");
	}
	if (mode === "paper" && hasLiveKeys) {
		throw new Error(
			"EXECUTION_MODE=paper refused: live broker keys are present"
		);
	}
}
