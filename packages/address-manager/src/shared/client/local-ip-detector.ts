import { networkInterfaces } from "node:os";

let _cachedIP: string | null = null;

function _findFirstNonInternalIPv4(): string | null {
	const nets = networkInterfaces();
	for (const name of Object.keys(nets)) {
		for (const net of nets[name] ?? []) {
			if (net.family === "IPv4" && !net.internal) {
				return net.address;
			}
		}
	}
	return null;
}

export const LocalIPDetector = {
	reset(): void {
		_cachedIP = null;
	},

	getIP(): string {
		if (_cachedIP) {
			return _cachedIP;
		}
		_cachedIP = _findFirstNonInternalIPv4() ?? "127.0.0.1";
		return _cachedIP;
	},

	hasChanged(): boolean {
		const current = _findFirstNonInternalIPv4();
		if (_cachedIP === null) {
			_cachedIP = current;
			return false;
		}
		return current !== _cachedIP;
	},
};
