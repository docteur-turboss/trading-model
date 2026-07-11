import forge from "node-forge";

export class SanEntryType {
	private constructor(readonly value: number) {}

	static readonly DNS = new SanEntryType(2);

	static fromNumber(value: number): SanEntryType {
		return new SanEntryType(value);
	}

	static matches(value: number, type: SanEntryType): boolean {
		return value === type.value;
	}

	equals(other: SanEntryType): boolean {
		return this.value === other.value;
	}

	toNumber(): number {
		return this.value;
	}
}

interface CsrExtension {
	name: string;
	altNames?: Array<{ type: SanEntryType; value: string }>;
}

export class CsrParser {
	parse(csrPem: string): {
		commonName: string;
		san: string[];
		publicKeyPem: string;
	} {
		const csr = forge.pki.certificationRequestFromPem(csrPem);
		return {
			commonName: csr.subject.getField("CN")?.value ?? "",
			san: this._extractSanFromCsr(csr),
			publicKeyPem: csr.publicKey
				? forge.pki.publicKeyToPem(csr.publicKey)
				: "",
		};
	}

	private _extractSanFromCsr(
		csr: ReturnType<typeof forge.pki.certificationRequestFromPem>
	): string[] {
		const sanAttr = csr.getAttribute({ name: "extensionRequest" });
		if (!sanAttr) {
			return [];
		}
		const extensions = (sanAttr as unknown as { extensions: CsrExtension[] })
			.extensions;
		if (!extensions) {
			return [];
		}
		const sanExt = extensions.find((ext) => ext.name === "subjectAltName");
		if (!sanExt?.altNames) {
			return [];
		}
		return sanExt.altNames
			.filter((alt) => SanEntryType.matches(Number(alt.type), SanEntryType.DNS))
			.map((alt) => alt.value);
	}
}
