import { MessageBus } from 'services/message-bus.service'
import { createBrokerClient } from 'infra/broker/broker.client'
import { env } from 'config/env'

/**
 * Composition root: on assemble le MessageBus
 * avec ses dépendances externes.
 */
const messageBus = new MessageBus(
    createBrokerClient,
    env.MESSAGE_BUS_INIT_TIMEOUT_MS,
    env.MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS
)

/**
 * Fonctions publiques pour l'application
 */
export const initMessageBus = () => messageBus.init()
export const closeMessageBus = () => messageBus.close()