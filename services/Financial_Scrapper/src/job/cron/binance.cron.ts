/**
 * BinanceCronOrchestrator
 * -----------------------
 * Orchestrateur intelligent de workers Binance.
 *
 * Responsabilités :
 *  - Scheduling via node-cron
 *  - Scaling dynamique du nombre de workers
 *  - Contrôle de concurrence
 *  - Backpressure simple
 *
 * Conçu pour environnements horizontaux.
 */

import os from "os";
import cron from "node-cron";
import pLimit from "p-limit";
import { logger } from "cash-lib/config/logger";
import { BinanceWorker, BinanceWorkerResult } from "../worker/binance.worker";
import { MarketDataController } from "infra/market-data/market-data.controller";

export interface CronConfig {
  schedule: string; // ex: "*/1 * * * *"
  symbols: string[];
  maxConcurrency?: number;
  candleInterval?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
}

export class BinanceCronOrchestrator {
    private readonly maxConcurrency: number;
    private isRunning = false;

    constructor(
        private readonly config: CronConfig
    ) {
        /**
         * Concurrency par défaut :
         * - Nombre de CPUs * 2 (I/O bound workload)
         * - Borné par nombre de symbols
         */
        const cpuBased = os.cpus().length * 2;
        this.maxConcurrency =
        config.maxConcurrency ??
        Math.min(cpuBased, config.symbols.length);
    }

    /**
     * Démarre le cron scheduler.
     */
    public start(): void {
        cron.schedule(this.config.schedule, async () => {
            if (this.isRunning) {
                logger.warn("[BinanceCron] Previous execution still running.")
                return;
            }

            this.isRunning = true;

            try {
                await this.executeBatch();
            } catch (err) {
                if(err instanceof Error) logger.error("[BinanceCron] Batch execution error:", {err: err.message})
                else logger.error("[BinanceCron] Batch execution unknow error")
            } finally {
                this.isRunning = false;
            }
        });

        logger.info(
        `[BinanceCron] Scheduled with maxConcurrency=${this.maxConcurrency}`
        );
    }

    /**
     * Exécution batch avec limitation de concurrence.
     */
    private async executeBatch(): Promise<void> {
        const limiter = pLimit(this.maxConcurrency);

        const tasks = this.config.symbols.map((symbol) =>
            limiter(async () => {
                const worker = new BinanceWorker({
                    symbol,
                    interval: this.config.candleInterval ?? "1m",
                });

                const result = await worker.run();

                await this.persist(result);
            })
        );

        await Promise.all(tasks);
    }

    /**
     * Méthode d’extension pour persistance.
     * Peut être overridée ou injectée.
     */
    protected async persist(data: BinanceWorkerResult): Promise<void> {
        await MarketDataController.persist(data);
        logger.debug("[BinanceCron] Data fetched at: " + Date.now());
    }
}