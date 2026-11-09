import type {
	LogPort,
	ShutdownProbe,
} from "../../src/domain/ports/replay.ports";

/** Log sink that records every call, typed by the port. */
export class FakeLogger implements LogPort {
	readonly calls: { level: "info" | "warn" | "error"; message: string }[] = [];
	info(message: string): void {
		this.calls.push({ level: "info", message });
	}
	warn(message: string): void {
		this.calls.push({ level: "warn", message });
	}
	error(message: string): void {
		this.calls.push({ level: "error", message });
	}
	messages(level: "info" | "warn" | "error"): string[] {
		return this.calls.filter((c) => c.level === level).map((c) => c.message);
	}
}

/** Switchable shutdown flag. */
export class FakeShutdown {
	value = false;
	readonly probe: ShutdownProbe = () => this.value;
}

/** Replay counters, recorded instead of sent to Prometheus. */
export class FakeReplayMetrics {
	readonly batches: { success: number; failed: number }[] = [];
	readonly emit = (success: number, failed: number): void => {
		this.batches.push({ success, failed });
	};
}
