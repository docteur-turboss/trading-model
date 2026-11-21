/**
 * Events risk-execution publishes so the audit chain records every order
 * transition and kill switch change with the mode (ADR-0064 §3 "Record").
 */
export enum RiskEvent {
	OrderTransitioned = "risk.order.transitioned",
	KillSwitchEngaged = "risk.kill-switch.engaged",
	KillSwitchRearmed = "risk.kill-switch.rearmed",
}

/** Execution mode of the service that published the event. */
export type RiskMode = "paper" | "live";

export interface RiskOrderTransitionedPayload {
	mode: RiskMode;
	clientOrderId: string;
	symbol: string;
	/** Status the order moved to. */
	status: string;
	reason?: string | null;
}

export interface RiskKillSwitchEngagedPayload {
	mode: RiskMode;
	scope: "global" | "symbol";
	symbol?: string | null;
	reason: string;
	actor?: string;
	/** Set when the state file was unreadable at start. */
	error?: string;
}

export interface RiskKillSwitchRearmedPayload {
	mode: RiskMode;
	scope: "global" | "symbol";
	symbol?: string | null;
	reason: string;
	actor: string;
}

export interface RiskEventMap {
	[RiskEvent.OrderTransitioned]: RiskOrderTransitionedPayload;
	[RiskEvent.KillSwitchEngaged]: RiskKillSwitchEngagedPayload;
	[RiskEvent.KillSwitchRearmed]: RiskKillSwitchRearmedPayload;
}
