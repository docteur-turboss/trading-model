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
		const parts = token.split(".");
		if (parts.length !== 3) {
			throw new Error("Invalid JWT format");
		}
		return {
			header: this.parseBase64Json<JwtHeader>(parts[0]),
			payload: this.parseBase64Json<TData>(parts[1]),
			message: `${parts[0]}.${parts[1]}`,
			signature: Buffer.from(parts[2], "base64url"),
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
