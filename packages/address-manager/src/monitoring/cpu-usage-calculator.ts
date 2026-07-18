import type * as os from "node:os";
import type {
	CpuPercent,
	DurationMs,
} from "@trading-model/common/domain/primitives";
import type { CpuTimes } from "./system-metrics";
import { computeCpuPercent } from "./system-metrics";

/** Encapsulates the calculation of CPU usage percent over successive polls. */
export class CpuUsageCalculator {
	private _previousCpuTimes: CpuTimes = {
		idle: 0 as DurationMs,
		total: 0 as DurationMs,
	};

	calculate(cpus: os.CpuInfo[]): CpuPercent {
		const { totalIdle, totalTick } = this._sumCpuTimes(cpus);
		const { percent, previousCpuTimes } = computeCpuPercent(
			totalIdle,
			totalTick,
			this._previousCpuTimes
		);
		this._previousCpuTimes = previousCpuTimes;
		return percent;
	}

	reset(): void {
		this._previousCpuTimes = { idle: 0 as DurationMs, total: 0 as DurationMs };
	}

	private _sumCpuTimes(cpus: os.CpuInfo[]): {
		totalIdle: number;
		totalTick: number;
	} {
		let totalIdle = 0;
		let totalTick = 0;
		for (const cpu of cpus) {
			totalIdle += cpu.times.idle;
			totalTick += this._sumCpuTick(cpu);
		}
		return { totalIdle, totalTick };
	}

	private _sumCpuTick(cpu: os.CpuInfo): number {
		return (
			cpu.times.user +
			cpu.times.nice +
			cpu.times.sys +
			cpu.times.idle +
			cpu.times.irq
		);
	}
}
