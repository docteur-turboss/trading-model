import { HttpClient } from "config/httpClient";

export default class {
    private httpClient: HttpClient;
    constructor(
        private RootCACertPath: string,
        private CertificatPath: string,
        private KeyCertificatPath: string
    ) {
        this.httpClient = new HttpClient({
            ca: RootCACertPath,
            cert: CertificatPath,
            key: KeyCertificatPath
        });

        
    }
}