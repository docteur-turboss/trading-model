import * as os from "node:os";

export interface SystemMetricsPayload {
	memory: {
		totalBytes: number;
		usedBytes: number;
		usedPercent: number;
		heapUsedBytes: number;
		heapTotalBytes: number;
	};
	cpu: {
		percent: number;
		loadAvg1m: number;
		loadAvg5m: number;
		loadAvg15m: number;
	};
	uptime: number;
	collectedAt: number;
}

export function computeCpuPercent(
	totalIdle: number,
	totalTick: number,
	previous: { idle: number; total: number }
): { percent: number; previousCpuTimes: { idle: number; total: number } } {
	if (previous.idle === 0 && previous.total === 0) {
		return {
			percent: 0,
			previousCpuTimes: { idle: totalIdle, total: totalTick },
		};
	}
	const idleDiff = totalIdle - previous.idle;
	const totalDiff = totalTick - previous.total;
	return {
		percent: totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0,
		previousCpuTimes: { idle: totalIdle, total: totalTick },
	};
}

export class SystemMetrics {
	private _previousCpuTimes: { idle: number; total: number } = { idle: 0, total: 0 };

	private _collectMemory(): SystemMetricsPayload["memory"] {
		const mem = process.memoryUsage();
		const totalMem = os.totalmem();
		const usedMem = totalMem - os.freemem();
		return {
			totalBytes: totalMem,
			usedBytes: usedMem,
			usedPercent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
			heapUsedBytes: mem.heapUsed,
			heapTotalBytes: mem.heapTotal,
		};
	}

	collect(): SystemMetricsPayload {
		return {
			memory: this._collectMemory(),
			cpu: this._collectCpu(this._previousCpuTimes),
			uptime: os.uptime(),
			collectedAt: Date.now(),
		};
	}

	private _collectCpu(
		previousCpuTimes: { idle: number; total: number }
	): SystemMetricsPayload["cpu"] {
		const cpuPercent = this._calculateCpuPercent(os.cpus(), previousCpuTimes);
		const loads = os.loadavg();
		return {
			percent: cpuPercent,
			loadAvg1m: loads[0],
			loadAvg5m: loads[1],
			loadAvg15m: loads[2],
		};
	}

	private _sumCpuTimes(cpus: os.CpuInfo[]): { totalIdle: number; totalTick: number } {
		let totalIdle = 0;
		let totalTick = 0;
		for (const cpu of cpus) {
			totalIdle += cpu.times.idle;
			totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
		}
		return { totalIdle, totalTick };
	}

	private _calculateCpuPercent(
		cpus: os.CpuInfo[],
		previousCpuTimes: { idle: number; total: number }
	): number {
		const { totalIdle, totalTick } = this._sumCpuTimes(cpus);
		const { percent, previousCpuTimes: newCpuTimes } = computeCpuPercent(
			totalIdle,
			totalTick,
			previousCpuTimes,
		);
		this._previousCpuTimes = newCpuTimes;
		return percent;
	}

	reset(): void {
		this._previousCpuTimes = { idle: 0, total: 0 };
	}
}
