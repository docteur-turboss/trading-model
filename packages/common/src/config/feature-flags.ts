import type {
	FeatureFlag,
	FeatureFlagDefinition,
	PlatformFlagName,
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
	private readonly _store = new Map<PlatformFlagName, INternalFlag>();
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
		return parseFlagValue(raw, envName);
	}

	static parse(raw: string): boolean {
		const result = parseFlagValue(raw, "<test>");
		return result ?? false;
	}

	isEnabled(name: PlatformFlagName): boolean {
		const flag = this._store.get(name);
		if (!flag) {
			logger.warn(
				`FeatureFlags: unknown flag "${name}" queried, returning false`
			);
			return false;
		}
		return flag.enabled;
	}

	enable(name: PlatformFlagName): void {
		const flag = this._store.get(name);
		if (!flag) {
			logger.warn(`FeatureFlags: cannot enable unknown flag "${name}"`);
			return;
		}
		flag.enabled = true;
		logger.info(`FeatureFlags: "${name}" enabled`);
	}

	disable(name: PlatformFlagName): void {
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

	get(name: PlatformFlagName): FeatureFlag | undefined {
		return this._store.get(name);
	}

	reset(name: PlatformFlagName): void {
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

function parseFlagValue(raw: string, source: string): boolean | undefined {
	const val = raw.toLowerCase();
	if (val === "1" || val === "true" || val === "yes") {
		return true;
	}
	if (val === "0" || val === "false" || val === "no") {
		return false;
	}
	logger.warn(
		`FeatureFlags: invalid env value for ${source}=${raw}, using default`
	);
}
