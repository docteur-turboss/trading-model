import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import forge from "node-forge";

function _selectAlgorithm(nodeKey: KeyObject): string {
	return nodeKey.asymmetricKeyType === "rsa"
		? CryptoAlg.RSA_SHA256
		: CryptoAlg.SHA256;
}

function _signTbs(
	tbsBuffer: Buffer,
	nodeKey: KeyObject,
	algorithm: string
): string {
	return createSign(algorithm)
		.update(tbsBuffer)
		.sign(nodeKey)
		.toString("binary");
}

/**
 * Signs a forge certificate using node:crypto (not forge's sign()).
 * Avoids loading PEM into forge's internal structures, keeping key material scoped locally.
 *
 * Mutates the passed-in certificate object (cert.signature, cert.signatureOid, cert.siginfo).
 */
export function signCertWithCaKey(
	cert: forge.pki.Certificate,
	getCaPrivateKey: () => string
): void {
	const pem = Buffer.from(getCaPrivateKey(), CryptoAlg.UTF8);
	try {
		const nodeKey = createPrivateKey(pem);
		const algorithm = _selectAlgorithm(nodeKey);
		_prepareCertForSigning(cert);
		const sigBytes = _signTbs(_extractTbsDer(cert), nodeKey, algorithm);
		_applyAsn1Signature(cert, sigBytes);
	} finally {
		pem.fill(0);
	}
}

function _prepareCertForSigning(cert: forge.pki.Certificate): void {
	const sigOid = forge.pki.oids.sha256WithRSAEncryption;
	cert.signature = "\x00";
	cert.signatureOid = sigOid;
	(cert as unknown as Record<string, unknown>).siginfo = {
		algorithmOid: sigOid,
	};
}

function _extractTbsDer(cert: forge.pki.Certificate): Buffer {
	const fullAsn1 = forge.pki.certificateToAsn1(cert);
	const asn1Values = fullAsn1.value as forge.asn1.Asn1[];
	if (asn1Values.length < 3) {
		throw new Error("Unexpected ASN.1 structure: expected at least 3 elements");
	}
	if (asn1Values[0].type !== forge.asn1.Type.SEQUENCE) {
		throw new Error(
			"Unexpected ASN.1 structure: first element is not a SEQUENCE (TBS certificate)"
		);
	}
	const tbsDer = forge.asn1.toDer(asn1Values[0]).getBytes();
	return Buffer.from(tbsDer, "binary");
}

function _buildSigAsn1(sigBytes: string): forge.asn1.Asn1 {
	return forge.asn1.create(
		forge.asn1.Class.UNIVERSAL,
		forge.asn1.Type.BITSTRING,
		false,
		`\x00${sigBytes}`
	);
}

function _parseSignedCert(fullAsn1: forge.asn1.Asn1): forge.pki.Certificate {
	const fullDer = forge.asn1.toDer(fullAsn1).getBytes();
	return forge.pki.certificateFromAsn1(
		forge.asn1.fromDer(forge.util.createBuffer(fullDer))
	);
}

function _applyAsn1Signature(
	cert: forge.pki.Certificate,
	sigBytes: string
): void {
	const fullAsn1 = forge.pki.certificateToAsn1(cert);
	const asn1Values = fullAsn1.value as forge.asn1.Asn1[];
	asn1Values[2] = _buildSigAsn1(sigBytes);

	const signedCert = _parseSignedCert(fullAsn1);
	cert.signature = signedCert.signature;
	cert.signatureOid = signedCert.signatureOid;
	(cert as unknown as Record<string, unknown>).siginfo = (
		signedCert as unknown as Record<string, unknown>
	).siginfo;
}
