import {
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { WorkerRegistration } from "../../src/types/worker.types";

export const createWorkerRegistration = (
	overrides?: Partial<WorkerRegistration>
): WorkerRegistration =>
	({
		workerId: "test-worker-1" as any,
		address: "192.168.1.10" as any,
		port: 9000 as any,
		capabilities: ["test-job-type" as any, "another-type" as any],
		maxConcurrency: PositiveInt.of(5),
		currentLoad: 0 as any,
		lastHeartbeat: UnixTimestamp.now(),
		status: "active" as any,
		...overrides,
	}) as any;
