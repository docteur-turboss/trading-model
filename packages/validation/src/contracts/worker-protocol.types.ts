import type {
	InstanceId,
	JobId,
	JobType,
	PositiveInt,
	UnixTimestamp,
	WorkerStatus,
} from "@trading-model/common/domain/primitives";
import {
	Capability,
	WorkerStatusCode,
} from "@trading-model/common/domain/primitives";
import type { HostPort } from "@trading-model/common/domain/service-identity";

export type { WorkerStatus };

export interface WorkerRegistrationBase extends HostPort {
	workerId: InstanceId;
	capabilities: Capability[];
	maxConcurrency: PositiveInt;
}

export interface WorkerRegistration extends WorkerRegistrationBase {
	currentLoad: number;
	lastHeartbeat: UnixTimestamp;
	status: WorkerStatus;
}

export interface WorkerWsRegisterMessage extends WorkerRegistrationBase {
	type: "register";
}

export interface WorkerWsHeartbeatMessage {
	type: "heartbeat";
	workerId: InstanceId;
	currentLoad: number;
}

export interface WorkerWsDisconnectMessage {
	type: "disconnect";
	workerId: InstanceId;
	reason?: string;
}

export type WorkerIncomingMessage =
	| WorkerWsRegisterMessage
	| WorkerWsHeartbeatMessage
	| WorkerWsDisconnectMessage;

export interface SchedulerWsJobAssignedMessage {
	type: "job.assigned";
	job: {
		id: JobId;
		type: JobType;
		payload: unknown;
		ackDeadline: PositiveInt;
	};
}

export interface SchedulerWsHeartbeatAckMessage {
	type: "heartbeat.ack";
}

export interface SchedulerWsDrainMessage {
	type: "drain";
}

export type SchedulerOutgoingMessage =
	| SchedulerWsJobAssignedMessage
	| SchedulerWsHeartbeatAckMessage
	| SchedulerWsDrainMessage;

export function isWorkerSuitable(
	worker: WorkerRegistration,
	jobType: string
): boolean {
	return (
		worker.status === WorkerStatusCode.Active &&
		worker.capabilities.includes(Capability.of(jobType)) &&
		worker.currentLoad < worker.maxConcurrency
	);
}
