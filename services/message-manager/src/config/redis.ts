import Redis, { Cluster, RedisOptions } from 'ioredis';

import { env } from './env';
import { logger } from './logger';

interface ManagedRedis {
  client: Redis | null;
  promise: Promise<Redis> | null;
  name: string;
}

const clients: Record<string, ManagedRedis> = {
  operations: { client: null, promise: null, name: 'Redis' },
  streams: { client: null, promise: null, name: 'Redis[streams]' },
  subscriptions: { client: null, promise: null, name: 'Redis[subs]' },
};

const allClients: Set<Redis> = new Set();

let redisClosed = false;

const onReconnectedCallbacks: Array<() => void> = [];

export function onRedisReconnected(cb: () => void): void {
  onReconnectedCallbacks.push(cb);
}

export function removeRedisReconnectedCallback(cb: () => void): void {
  const idx = onReconnectedCallbacks.indexOf(cb);
  if (idx >= 0) {
    onReconnectedCallbacks.splice(idx, 1);
  }
}

function buildRedisOptions(): Record<string, unknown> {
  const url = env.REDIS_URL;
  const tls = env.REDIS_TLS_ENABLED ? { tls: { rejectUnauthorized: true } } : {};
  const opts: Record<string, unknown> = {
    retryStrategy: (retries: number) => redisRetryDelay(retries),
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...tls,
  };
  if (url) return opts;
  return {
    ...opts,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
  };
}

function buildRedisInstance(): Redis {
  if (env.REDIS_SENTINEL_MASTER_NAME) {
    let sentinelNodes: Array<{ host: string; port: number }>;
    try {
      sentinelNodes = env.REDIS_SENTINEL_NODES
        ? (JSON.parse(env.REDIS_SENTINEL_NODES) as Array<{ host: string; port: number }>)
        : [{ host: env.REDIS_HOST, port: env.REDIS_PORT }];
    } catch (cause) {
      const err = new Error(`Invalid REDIS_SENTINEL_NODES JSON: ${(cause as Error).message}`);
      (err as { cause?: unknown }).cause = cause;
      throw err;
    }
    const sentinelOpts: Record<string, unknown> = {
      sentinels: sentinelNodes,
      name: env.REDIS_SENTINEL_MASTER_NAME,
      password: env.REDIS_SENTINEL_PASSWORD || undefined,
      db: env.REDIS_DB,
      retryStrategy: (retries: number) => redisRetryDelay(retries),
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    };
    if (env.REDIS_TLS_ENABLED) {
      sentinelOpts.tls = { rejectUnauthorized: true };
    }
    return new Redis(sentinelOpts as RedisOptions) as unknown as Redis;
  }

  if (env.REDIS_CLUSTER_NODES) {
    let clusterNodes: Array<{ host: string; port: number }>;
    try {
      clusterNodes = JSON.parse(env.REDIS_CLUSTER_NODES) as Array<{ host: string; port: number }>;
    } catch (cause) {
      const err = new Error(`Invalid REDIS_CLUSTER_NODES JSON: ${(cause as Error).message}`);
      (err as { cause?: unknown }).cause = cause;
      throw err;
    }
    return new Cluster(clusterNodes, {
      redisOptions: {
        password: env.REDIS_PASSWORD || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      },
      clusterRetryStrategy: (retries: number) => {
        const maxAttempts = env.REDIS_MAX_RECONNECT_ATTEMPTS;
        if (maxAttempts === 0 || (maxAttempts > 0 && retries >= maxAttempts)) {
          if (retries > 0 || maxAttempts === 0) {
            logger.error(`Redis Cluster: max reconnection attempts (${maxAttempts}) reached`);
          }
          return null;
        }
        return redisRetryDelay(retries);
      },
      scaleReads: 'slave',
      enableAutoPipelining: true,
    }) as unknown as Redis;
  }

  const options = buildRedisOptions();
  return new Redis(options as RedisOptions);
}

function redisRetryDelay(retries: number): number | null {
  const maxAttempts = env.REDIS_MAX_RECONNECT_ATTEMPTS;
  if (maxAttempts === 0 || (maxAttempts > 0 && retries >= maxAttempts)) {
    if (retries > 0 || maxAttempts === 0) {
      logger.error(`Redis: max reconnection attempts (${maxAttempts}) reached, giving up`);
    }
    return null;
  }
  const baseDelay = Math.min(1000 * Math.pow(2, retries - 1), 30000);
  const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
  const delay = Math.max(100, Math.round(baseDelay + jitter));
  if (retries > 1) {
    logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${retries})`);
  }
  return delay;
}

function destroyClient(client: Redis): void {
  client.removeAllListeners();
  try {
    client.disconnect();
  } catch {
    /* best-effort */
  }
  allClients.delete(client);
}

async function getOrCreateClient(slot: ManagedRedis): Promise<Redis> {
  if (redisClosed) throw new Error('Redis has been closed — cannot create new client');
  if (slot.client && slot.client.status === 'ready') return slot.client;
  if (slot.promise) return slot.promise;

  // If existing client is reconnecting, wait for it before creating a new one
  if (
    slot.client &&
    (slot.client.status === 'connecting' || slot.client.status === 'reconnecting')
  ) {
    try {
      const RECONNECT_TIMEOUT_MS = 30000;
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('timeout')), RECONNECT_TIMEOUT_MS);
        slot.client!.once('ready', () => {
          clearTimeout(timeoutId);
          resolve();
        });
      });
      return slot.client;
    } catch {
      // Reconnection timed out — fall through to create new client
    }
  }

  slot.promise = (async () => {
    const client = buildRedisInstance();
    allClients.add(client);

    const onError = (err: Error) => {
      if (redisClosed) return;
      logger.error(`${slot.name} client error`, { error: (err as Error).message });
    };

    const onConnect = () => {
      if (redisClosed) return;
      logger.info(`${slot.name}: connected`);
    };

    const onReady = () => {
      if (redisClosed) return;
      logger.info(`${slot.name}: ready`);
      for (const cb of onReconnectedCallbacks) {
        try {
          cb();
        } catch {
          /* best-effort */
        }
      }
    };

    const onClose = () => {
      if (redisClosed) return;
      logger.warn(`${slot.name}: connection closed`);
    };

    const onReconnecting = (delay: number) => {
      if (redisClosed) return;
      logger.warn(`${slot.name}: reconnecting in ${delay}ms`);
    };

    client.on('error', onError);
    client.on('connect', onConnect);
    client.on('ready', onReady);
    client.on('close', onClose);
    client.on('reconnecting', onReconnecting);

    try {
      await client.connect();
      if (redisClosed) {
        destroyClient(client);
        throw new Error('Redis has been closed');
      }
      // Destroy stale client only after successful connection
      if (slot.client && slot.client !== client) {
        destroyClient(slot.client);
      }
      slot.client = client;
      return client;
    } catch (err) {
      if (!redisClosed) {
        logger.error(`${slot.name}: failed to connect`, { error: (err as Error).message });
      }
      client.off('error', onError);
      client.off('connect', onConnect);
      client.off('ready', onReady);
      client.off('close', onClose);
      client.off('reconnecting', onReconnecting);
      allClients.delete(client);
      throw err;
    } finally {
      slot.promise = null;
    }
  })();

  return slot.promise;
}

export async function getRedisClient(): Promise<Redis> {
  return getOrCreateClient(clients.operations);
}

export async function getStreamClient(): Promise<Redis> {
  return getOrCreateClient(clients.streams);
}

export async function getSubscriptionClient(): Promise<Redis> {
  return getOrCreateClient(clients.subscriptions);
}

export async function closeRedis(): Promise<void> {
  redisClosed = true;
  for (const client of allClients) {
    try {
      client.removeAllListeners();
    } catch {
      /* best-effort */
    }
    try {
      client.disconnect();
    } catch {
      /* best-effort */
    }
  }
  allClients.clear();
  for (const [, slot] of Object.entries(clients)) {
    slot.client = null;
    slot.promise = null;
  }
}

export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export function getRedisOrThrow(): Redis {
  const slot = clients.operations;
  if (!slot.client || slot.client.status !== 'ready') {
    throw new Error('Redis is not available');
  }
  return slot.client;
}
