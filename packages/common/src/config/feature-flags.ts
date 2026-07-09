import type {
	FeatureFlag,
	FeatureFlagDefinition,
} from "./feature-flag-definitions";
import { logger } from "./logger";

interface FeatureFlagOptions {
	envPrefix?: string;
}

const ENV_PREFIX_DEFAULT = "FF_";

interface INternalFlag extends FeatureFlag {
	defaultEnabled: boolean;
}

export type { FeatureFlag, FeatureFlagDefinition };

export class FeatureFlags {
	private readonly _store = new Map<string, INternalFlag>();
	private readonly _envPrefix: string;

	constructor(
		definitions: FeatureFlagDefinition[],
		options?: FeatureFlagOptions
	) {
		this._envPrefix = options?.envPrefix ?? ENV_PREFIX_DEFAULT;
		this._initFromDefinitions(definitions);
		logger.info(`FeatureFlags initialized with ${this._store.size} flags`);
	}

	private _initFromDefinitions(definitions: FeatureFlagDefinition[]): void {
		for (const def of definitions) {
			const envName = `${this._envPrefix}${def.name}`;
			const enabled = this._readFromEnv(envName) ?? def.defaultEnabled;
			this._store.set(def.name, {
				name: def.name,
				enabled,
				defaultEnabled: def.defaultEnabled,
				description: def.description,
				owner: def.owner,
			});
		}
	}

	private _readFromEnv(envName: string): boolean | undefined {
		const raw = process.env[envName];
		if (raw === undefined) {
			return;
		}
		const val = raw.toLowerCase();
		if (val === "1" || val === "true" || val === "yes") {
			return true;
		}
		if (val === "0" || val === "false" || val === "no") {
			return false;
		}
		logger.warn(
			`FeatureFlags: invalid env value for ${envName}=${raw}, using default`
		);
	}

	isEnabled(name: string): boolean {
		const flag = this._store.get(name);
		if (!flag) {
			logger.warn(
				`FeatureFlags: unknown flag "${name}" queried, returning false`
			);
			return false;
		}
		return flag.enabled;
	}

	enable(name: string): void {
		const flag = this._store.get(name);
		if (!flag) {
			logger.warn(`FeatureFlags: cannot enable unknown flag "${name}"`);
			return;
		}
		flag.enabled = true;
		logger.info(`FeatureFlags: "${name}" enabled`);
	}

	disable(name: string): void {
		const flag = this._store.get(name);
		if (!flag) {
			logger.warn(`FeatureFlags: cannot disable unknown flag "${name}"`);
			return;
		}
		flag.enabled = false;
		logger.info(`FeatureFlags: "${name}" disabled`);
	}

	getAll(): FeatureFlag[] {
		return Array.from(this._store.values());
	}

	get(name: string): FeatureFlag | undefined {
		return this._store.get(name);
	}

	reset(name: string): void {
		const flag = this._store.get(name);
		if (!flag) {
			logger.warn(`FeatureFlags: cannot reset unknown flag "${name}"`);
			return;
		}
		flag.enabled = flag.defaultEnabled;
		logger.info(`FeatureFlags: "${name}" reset to ${flag.enabled}`);
	}

	size(): number {
		return this._store.size;
	}
}
