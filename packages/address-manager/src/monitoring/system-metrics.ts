import * as os from 'os';

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
  previous: { idle: number; total: number } | null
): { percent: number; previousCpuTimes: { idle: number; total: number } } {
  if (previous) {
    const idleDiff = totalIdle - previous.idle;
    const totalDiff = totalTick - previous.total;
    return {
      percent: totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0,
      previousCpuTimes: { idle: totalIdle, total: totalTick },
    };
  }
  return { percent: 0, previousCpuTimes: { idle: totalIdle, total: totalTick } };
}

export class SystemMetrics {
  private previousCpuTimes: { idle: number; total: number } | null = null;

  collect(): SystemMetricsPayload {
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const cpuPercent = this.calculateCpuPercent(cpus);
    const loads = os.loadavg();

    return {
      memory: {
        totalBytes: totalMem,
        usedBytes: usedMem,
        usedPercent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
      cpu: {
        percent: cpuPercent,
        loadAvg1m: loads[0],
        loadAvg5m: loads[1],
        loadAvg15m: loads[2],
      },
      uptime: os.uptime(),
      collectedAt: Date.now(),
    };
  }

  private calculateCpuPercent(cpus: os.CpuInfo[]): number {
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      totalIdle += cpu.times.idle;
      totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }

    const { percent, previousCpuTimes } = computeCpuPercent(totalIdle, totalTick, this.previousCpuTimes);
    this.previousCpuTimes = previousCpuTimes;
    return percent;
  }

  reset(): void {
    this.previousCpuTimes = null;
  }
}
