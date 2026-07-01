import { logger } from './logger';

export interface FeatureFlagDefinition {
  name: string;
  defaultEnabled: boolean;
  description: string;
  owner: string;
}

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description: string;
  owner: string;
}

interface FeatureFlagOptions {
  envPrefix?: string;
}

const ENV_PREFIX_DEFAULT = 'FF_';

interface InternalFlag extends FeatureFlag {
  defaultEnabled: boolean;
}

export class FeatureFlags {
  private readonly store = new Map<string, InternalFlag>();
  private readonly envPrefix: string;

  constructor(
    definitions: FeatureFlagDefinition[],
    options?: FeatureFlagOptions,
  ) {
    this.envPrefix = options?.envPrefix ?? ENV_PREFIX_DEFAULT;

    for (const def of definitions) {
      const envName = `${this.envPrefix}${def.name}`;
      const enabled = this.readFromEnv(envName) ?? def.defaultEnabled;
      this.store.set(def.name, {
        name: def.name,
        enabled,
        defaultEnabled: def.defaultEnabled,
        description: def.description,
        owner: def.owner,
      });
    }

    logger.info(`FeatureFlags initialized with ${this.store.size} flags`);
  }

  private readFromEnv(envName: string): boolean | undefined {
    const raw = process.env[envName];
    if (raw === undefined) {
      return undefined;
    }
    const val = raw.toLowerCase();
    if (val === '1' || val === 'true' || val === 'yes') {
      return true;
    }
    if (val === '0' || val === 'false' || val === 'no') {
      return false;
    }
    logger.warn(`FeatureFlags: invalid env value for ${envName}=${raw}, using default`);
    return undefined;
  }

  isEnabled(name: string): boolean {
    const flag = this.store.get(name);
    if (!flag) {
      logger.warn(`FeatureFlags: unknown flag "${name}" queried, returning false`);
      return false;
    }
    return flag.enabled;
  }

  enable(name: string): void {
    const flag = this.store.get(name);
    if (!flag) {
      logger.warn(`FeatureFlags: cannot enable unknown flag "${name}"`);
      return;
    }
    flag.enabled = true;
    logger.info(`FeatureFlags: "${name}" enabled`);
  }

  disable(name: string): void {
    const flag = this.store.get(name);
    if (!flag) {
      logger.warn(`FeatureFlags: cannot disable unknown flag "${name}"`);
      return;
    }
    flag.enabled = false;
    logger.info(`FeatureFlags: "${name}" disabled`);
  }

  getAll(): FeatureFlag[] {
    return Array.from(this.store.values());
  }

  get(name: string): FeatureFlag | undefined {
    return this.store.get(name);
  }

  reset(name: string): void {
    const flag = this.store.get(name);
    if (!flag) {
      logger.warn(`FeatureFlags: cannot reset unknown flag "${name}"`);
      return;
    }
    flag.enabled = flag.defaultEnabled;
    logger.info(`FeatureFlags: "${name}" reset to ${flag.enabled}`);
  }

  size(): number {
    return this.store.size;
  }
}

// ── Predefined platform-wide feature flag definitions ─────────────────────

export const PLATFORM_FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
  {
    name: 'DLQ_AUTO_RETRY',
    defaultEnabled: true,
    description: 'Automatically retry dead-lettered messages',
    owner: '@trading-model/messaging',
  },
  {
    name: 'CANARY_MIGRATIONS',
    defaultEnabled: false,
    description: 'Run database migrations in canary before full rollout',
    owner: '@trading-model/platform',
  },
  {
    name: 'STRICT_CIRCUIT_BREAKER',
    defaultEnabled: true,
    description: 'Enable strict circuit breaker with half-open recovery',
    owner: '@trading-model/platform',
  },
  {
    name: 'MESSAGE_DEDUPLICATION',
    defaultEnabled: true,
    description: 'Deduplicate messages at the broker level',
    owner: '@trading-model/messaging',
  },
  {
    name: 'GRACEFUL_SHUTDOWN_DRAIN',
    defaultEnabled: true,
    description: 'Drain active connections during graceful shutdown',
    owner: '@trading-model/platform',
  },
  {
    name: 'ENABLE_REQUEST_LOGGING',
    defaultEnabled: true,
    description: 'Log all incoming HTTP requests',
    owner: '@trading-model/platform',
  },
  {
    name: 'ENABLE_METRICS_EXPORT',
    defaultEnabled: true,
    description: 'Export Prometheus metrics',
    owner: '@trading-model/platform',
  },
  {
    name: 'ENABLE_DETAILED_ERROR_RESPONSE',
    defaultEnabled: false,
    description: 'Include error details in HTTP responses (dev only)',
    owner: '@trading-model/platform',
  },
  {
    name: 'ENABLE_CACHE_BYPASS',
    defaultEnabled: false,
    description: 'Bypass all caches for debugging',
    owner: '@trading-model/platform',
  },
  {
    name: 'WAL_SYNCHRONOUS_FLUSH',
    defaultEnabled: false,
    description: 'Flush WAL synchronously on every write',
    owner: '@trading-model/messaging',
  },
  {
    name: 'ENABLE_TELEMETRY_DETAILED',
    defaultEnabled: true,
    description: 'Enable detailed OpenTelemetry spans',
    owner: '@trading-model/platform',
  },
  {
    name: 'ENFORCE_MTLS_STRICT',
    defaultEnabled: true,
    description: 'Reject connections without valid mTLS certificates',
    owner: '@trading-model/platform',
  },
];

/** Global singleton initialized with platform-wide flags. */
let globalFeatureFlags: FeatureFlags | null = null;

export function getGlobalFeatureFlags(): FeatureFlags {
  if (!globalFeatureFlags) {
    globalFeatureFlags = new FeatureFlags(PLATFORM_FLAG_DEFINITIONS);
  }
  return globalFeatureFlags;
}

export function resetGlobalFeatureFlags(): void {
  globalFeatureFlags = null;
}
