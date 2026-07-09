import forge from "node-forge";

interface CsrExtension {
	name: string;
	altNames?: Array<{ type: number; value: string }>;
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
			.filter((alt) => alt.type === 2)
			.map((alt) => alt.value);
	}
}
