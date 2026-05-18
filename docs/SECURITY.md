# Security Policy

## Scope

This repository contains a distributed AI-based trading system composed of multiple microservices, including data ingestion, model training, live trading execution, and centralized supervision.

Due to the nature of the project — **financial markets interaction and real order execution** — security issues are treated as **high impact by default**.

## Supported Versions

Only the following versions receive security updates:

| Version                       | Supported |
| ----------------------------- | --------- |
| `main` (pre-release)          | ✅         |
| `v1.x` (first stable release) | ✅         |
| `< v1.0.0`                    | ❌         |

> ⚠️ Development branches, forks, and experimental builds are **not supported**.

## Reporting a Vulnerability

### ❗ Do NOT open public issues for security vulnerabilities

If you discover a security vulnerability, **do not disclose it publicly**.

Instead, report it privately using one of the following channels:

* **Email**: `docteur.turboss@gmail.com`
* **GitHub**: Private Security Advisory (preferred if available)

Please include:

* A clear description of the vulnerability
* Affected services or components
* Steps to reproduce (if applicable)
* Potential impact (financial, data, execution, integrity)
* Any suggested mitigation or patch

## Response Timeline

You can expect the following response process:

| Stage                      | Target Time                    |
| -------------------------- | ------------------------------ |
| Acknowledgement            | ≤ 72 hours                     |
| Initial assessment         | ≤ 7 days                       |
| Fix or mitigation proposal | As soon as reasonably possible |

If the vulnerability is accepted:

* A fix will be developed and tested
* A security advisory may be published
* Credit will be given unless anonymity is requested

If the vulnerability is declined:

* A clear explanation will be provided

## Vulnerability Categories of Interest

We consider the following classes **high priority**:

* Remote code execution (RCE)
* Authentication or authorization bypass
* mTLS misconfiguration or certificate validation issues
* Order execution manipulation
* Risk limit bypass
* Model poisoning or training data manipulation
* Central monitor compromise
* Secret leakage (API keys, certificates, credentials)
* Supply chain vulnerabilities affecting dependencies

## Out-of-Scope Issues

The following are **not considered security vulnerabilities**:

* Purely theoretical attacks without practical impact
* Issues requiring physical access to infrastructure
* Misuse of the system contrary to documentation
* Performance issues without security impact

## Financial Risk Disclaimer

This project may interact with real financial markets.

Security vulnerabilities **can result in real financial loss**.
Any testing against live systems **without explicit authorization** is strictly prohibited.

## Disclosure Policy
We follow **responsible disclosure principles**:

* No public disclosure before a fix is available
* Coordinated release of patches and advisories
* Clear communication with affected users

## No Warranty

As far as permitted by law, this software is provided **"AS IS"**, without warranty of any kind.
The maintainers are not liable for any damages resulting from its use.

## Contact

For any security-related matter, contact:

**Security Team**
`docteur.turboss@gmail.com` yeah, that's still me
