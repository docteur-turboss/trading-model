import * as os from "node:os";

export type Bytes = number & { readonly brand: "Bytes" };
export const Bytes = {
	of(value: number): Bytes {
		return value as Bytes;
	},
};

export type CpuPercent = number & { readonly brand: "CpuPercent" };
export const CpuPercent = {
	of(value: number): CpuPercent {
		return value as CpuPercent;
	},
};

export type LoadAvg = number & { readonly brand: "LoadAvg" };
export const LoadAvg = {
	of(value: number): LoadAvg {
		return value as LoadAvg;
	},
};

export type Uptime = number & { readonly brand: "Uptime" };
export const Uptime = {
	of(value: number): Uptime {
		return value as Uptime;
	},
};

export interface CpuTimes {
	idle: number;
	total: number;
}

export interface SystemMetricsPayload {
	memory: {
		totalBytes: Bytes;
		usedBytes: Bytes;
		usedPercent: CpuPercent;
		heapUsedBytes: Bytes;
		heapTotalBytes: Bytes;
	};
	cpu: {
		percent: CpuPercent;
		loadAvg1m: LoadAvg;
		loadAvg5m: LoadAvg;
		loadAvg15m: LoadAvg;
	};
	uptime: Uptime;
	collectedAt: number;
}

export function computeCpuPercent(
	totalIdle: number,
	totalTick: number,
	previous: CpuTimes
): { percent: CpuPercent; previousCpuTimes: CpuTimes } {
	if (previous.idle === 0 && previous.total === 0) {
		return {
			percent: CpuPercent.of(0),
			previousCpuTimes: { idle: totalIdle, total: totalTick },
		};
	}
	const idleDiff = totalIdle - previous.idle;
	const totalDiff = totalTick - previous.total;
	return {
		percent: CpuPercent.of(
			totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0
		),
		previousCpuTimes: { idle: totalIdle, total: totalTick },
	};
}

export class SystemMetrics {
	private _previousCpuTimes: CpuTimes = {
		idle: 0,
		total: 0,
	};

	private _collectMemory(): SystemMetricsPayload["memory"] {
		const mem = process.memoryUsage();
		const totalMem = os.totalmem();
		const usedMem = totalMem - os.freemem();
		return {
			totalBytes: Bytes.of(totalMem),
			usedBytes: Bytes.of(usedMem),
			usedPercent: CpuPercent.of(totalMem > 0 ? (usedMem / totalMem) * 100 : 0),
			heapUsedBytes: Bytes.of(mem.heapUsed),
			heapTotalBytes: Bytes.of(mem.heapTotal),
		};
	}

	collect(): SystemMetricsPayload {
		return {
			memory: this._collectMemory(),
			cpu: this._collectCpu(this._previousCpuTimes),
			uptime: Uptime.of(os.uptime()),
			collectedAt: Date.now(),
		};
	}

	private _collectCpu(previousCpuTimes: CpuTimes): SystemMetricsPayload["cpu"] {
		const cpuPercent = this._calculateCpuPercent(os.cpus(), previousCpuTimes);
		const loads = os.loadavg();
		return {
			percent: cpuPercent,
			loadAvg1m: LoadAvg.of(loads[0]),
			loadAvg5m: LoadAvg.of(loads[1]),
			loadAvg15m: LoadAvg.of(loads[2]),
		};
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

	private _calculateCpuPercent(
		cpus: os.CpuInfo[],
		previousCpuTimes: CpuTimes
	): CpuPercent {
		const { totalIdle, totalTick } = this._sumCpuTimes(cpus);
		const { percent, previousCpuTimes: newCpuTimes } = computeCpuPercent(
			totalIdle,
			totalTick,
			previousCpuTimes
		);
		this._previousCpuTimes = newCpuTimes;
		return percent;
	}

	reset(): void {
		this._previousCpuTimes = { idle: 0, total: 0 };
	}
}
