import { createPrivateKey, createSign } from 'node:crypto';

import forge from 'node-forge';

/**
 * Signs a forge certificate using node:crypto (not forge's sign()).
 * Avoids loading PEM into forge's internal structures, keeping key material scoped locally.
 *
 * Mutates the passed-in certificate object (cert.signature, cert.signatureOid, cert.siginfo).
 */
export function signCertWithCaKey(cert: forge.pki.Certificate, getCaPrivateKey: () => string): void {
  const pem = Buffer.from(getCaPrivateKey(), 'utf8');
  try {
    const nodeKey = createPrivateKey(pem);
    const algorithm = nodeKey.asymmetricKeyType === 'rsa' ? 'RSA-SHA256' : 'sha256';

    const sigOid = forge.pki.oids['sha256WithRSAEncryption'];
    cert.signature = '\x00';
    cert.signatureOid = sigOid;
    (cert as unknown as Record<string, unknown>).siginfo = {
      algorithmOid: sigOid,
    };

    const fullAsn1 = forge.pki.certificateToAsn1(cert);
    const asn1Values = fullAsn1.value as forge.asn1.Asn1[];
    if (asn1Values.length < 3) {
      throw new Error('Unexpected ASN.1 structure: expected at least 3 elements');
    }
    if (asn1Values[0].type !== forge.asn1.Type.SEQUENCE) {
      throw new Error('Unexpected ASN.1 structure: first element is not a SEQUENCE (TBS certificate)');
    }
    const tbs = asn1Values[0];
    const tbsDer = forge.asn1.toDer(tbs).getBytes();
    const tbsBuffer = Buffer.from(tbsDer, 'binary');

    const sigBuffer = createSign(algorithm).update(tbsBuffer).sign(nodeKey);
    const sigBytes = sigBuffer.toString('binary');

    const asn1Sig = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.BITSTRING,
      false,
      '\x00' + sigBytes
    );
    asn1Values[2] = asn1Sig;

    const fullDer = forge.asn1.toDer(fullAsn1).getBytes();
    const signedCert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(fullDer))
    );

    cert.signature = signedCert.signature;
    cert.signatureOid = signedCert.signatureOid;
    (cert as unknown as Record<string, unknown>).siginfo =
      (signedCert as unknown as Record<string, unknown>).siginfo;
  } finally {
    pem.fill(0);
  }
}
