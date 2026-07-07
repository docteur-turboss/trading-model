import { FeatureFlags } from "./feature-flags";
import { PLATFORM_FLAG_DEFINITIONS } from "./feature-flag-definitions";

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
