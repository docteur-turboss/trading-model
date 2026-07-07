import type {
	Capability,
	InstanceId,
	JobId,
	JobType,
	WorkerStatus,
} from "../domain/primitives";
import type { HostPort } from "../domain/service-identity";

export type { WorkerStatus };

export interface WorkerRegistrationBase extends HostPort {
	workerId: InstanceId;
	capabilities: Capability[];
	maxConcurrency: number;
}

export interface WorkerRegistration extends WorkerRegistrationBase {
	currentLoad: number;
	lastHeartbeat: Date;
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
		ackDeadline: number;
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
