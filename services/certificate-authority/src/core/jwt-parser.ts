export interface JwtHeader {
	alg: string;
	kid?: string;
	typ?: string;
}

export interface JwtTokenParts<TData = Record<string, unknown>> {
	header: JwtHeader;
	payload: TData;
	message: string;
	signature: Buffer;
}

export class JwtParser {
	parse<TData = Record<string, unknown>>(token: string): JwtTokenParts<TData> {
		const [headerB64, payloadB64, signatureB64] = token.split(".");
		if (!(headerB64 && payloadB64 && signatureB64)) {
			throw new Error("Invalid JWT format");
		}
		return {
			header: this.parseBase64Json<JwtHeader>(headerB64),
			payload: this.parseBase64Json<TData>(payloadB64),
			message: `${headerB64}.${payloadB64}`,
			signature: Buffer.from(signatureB64, "base64url"),
		};
	}

	parseBase64Json<TData>(str: string): TData {
		try {
			const decoded = Buffer.from(str, "base64url").toString("utf8");
			return JSON.parse(decoded) as TData;
		} catch {
			throw new Error("Failed to parse JWT segment");
		}
	}
}
