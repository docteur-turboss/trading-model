/**
 * Message Bus – Custom Broker Adapter
 *
 * Responsibilities:
 * - Initialize connection with custom message broker
 * - Expose lifecycle hooks to the application
 * - Ensure graceful shutdown (drain + close)
 *
 * This module must NOT expose broker internals.
 */

import { ALLOWED_TRANSITIONS, BusState } from 'shared/types/messageState.type'
import { BrokerClientType } from 'shared/types/broker.type'
import { withTimeout } from 'infra/utils/with-timeout'
import { Lifecycle } from 'services/lifecycle.service'
import { logger } from 'cash-lib/config/logger'

/**
 * Internal lifecycle state
 */


export class MessageBus {
    private readonly lifecycle = new Lifecycle<BusState>(
        BusState.STOPPED,
        ALLOWED_TRANSITIONS
    )

    private broker: BrokerClientType | null = null

    constructor(
        private readonly createClient: () => BrokerClientType,
        private readonly initTimeoutMs: number,
        private readonly shutdownTimeoutMs: number
    ) {}

    /**
     * Initialize asynchronous infrastructure components
     * (message broker, service registry, etc.)
     */
    async init(): Promise<void> {
        if (this.lifecycle.current !== BusState.STOPPED) return;

        this.lifecycle.transition(BusState.INITIALIZING);
        logger.info('Initializing message bus');

        try {
            this.broker = this.createClient();

            await withTimeout(
                this.broker.connect(),
                this.initTimeoutMs,
                'Message broker connection timeout'
            );

            this.assertHealthy();
            this.lifecycle.transition(BusState.RUNNING);
        } catch (err) {
            logger.error('Message bus init failed', { err });
            await this.close();
            throw err;
        }
    }

    /**
     * Gracefully close asynchronous infrastructure
     */
    async close(): Promise<void> {
        if (this.lifecycle.current === BusState.STOPPED) return

        
        this.lifecycle.tryTransition(BusState.STOPPING) 
            ?? this.lifecycle.transition(BusState.STOPPING)

        try {
            if (this.broker) {
                await withTimeout(
                this.broker.disconnect(),
                this.shutdownTimeoutMs,
                'Message broker shutdown timeout'
                )
            }
        } finally {
            this.broker = null
            this.lifecycle.reset(BusState.STOPPED)
        }
    }

    isHealthy() {
        return this.broker?.isHealthy() ?? false
    }

    private assertHealthy() {
        if (!this.broker?.isHealthy()) {
            throw new Error('Message broker unhealthy')
        }
    }
}