# Personal Data Breach Register (Art. 33(5) GDPR)

| Field | Value |
|---|---|
| **Register owner** | Compliance Officer (role, not a named person) |
| **Purpose** | Document every personal data breach (facts, effects, remedial action), whether or not it is notified to the CNIL (Art. 33(5)) |
| **Policy** | [Incident Response Policy](incident-response-policy.md) § 4 |
| **Severity and roles** | Levels L1-L4 and roles of [Incident Response Policy](incident-response-policy.md) §§ 2 and 5 |

## 1. Where the real register is kept

The real register is **not** in this repository. It is a restricted-access
document held outside the public repository, readable only by the Compliance
Officer, the Platform Security Lead and the controller. Its location is recorded
in the internal security documentation, not here.

**No real personal data, and no exploitable detail (vulnerability, key,
address, token, hostname, log extract), may be committed to this public
repository.** This file holds only the template and a fictitious example.

## 2. When to add an entry

Add one entry for every suspected or confirmed personal data breach, including
those judged unlikely to result in a risk to individuals and therefore not
notified. Open the entry at discovery; complete it as the incident progresses.
Never edit a closed entry: add a dated correction under it.

## 3. Entry template

| Field | Content |
|---|---|
| **Entry ID** | `BR-<year>-<nn>` |
| **Incident references** | Incident ticket, post-mortem (`docs/operations/post-mortems/`), severity L1-L4 |
| **Discovered** | Date and time (UTC), who discovered it, how |
| **Breach period** | Start date, end date, duration |
| **Nature** | Confidentiality, integrity or availability loss; cause |
| **Categories and volume of data** | Categories of data; approximate number of records |
| **Data subjects** | Categories and approximate number of persons |
| **Likely consequences** | Effects on the persons concerned |
| **Measures taken** | Containment, remediation, measures to limit the effects |
| **Risk assessment** | None / risk / high risk to individuals, with reasoning |
| **CNIL notification decision** | Notified or not; justification; decision timestamp and delay since awareness (72 h, Art. 33(1)); reasons for any delay |
| **Information of data subjects** | Required (Art. 34) or not; justification; date and means if done |
| **Closure** | Date, owner, follow-up actions |

## 4. Example entry (fictitious)

> **Example only. Not a real incident.**

| Field | Content |
|---|---|
| **Entry ID** | `BR-2099-00` (example) |
| **Incident references** | INC-0000 (example), L3 |
| **Discovered** | 2099-01-01 09:00 UTC, on-call engineer, alert review |
| **Breach period** | 2098-12-31 22:00 to 2099-01-01 09:30 UTC, 11.5 h |
| **Nature** | Confidentiality: edge-proxy access logs readable by an unauthorised internal account; cause: mis-set permission |
| **Categories and volume of data** | Truncated caller IP addresses; about 1 000 log lines |
| **Data subjects** | API callers; number not determinable from truncated IPs |
| **Likely consequences** | Negligible: truncated addresses, internal exposure only |
| **Measures taken** | Permission corrected, access reviewed, no external access found |
| **Risk assessment** | Unlikely to result in a risk to individuals |
| **CNIL notification decision** | Not notified; reasoning above; decided 2099-01-01 14:00 UTC, 5 h after awareness (< 72 h) |
| **Information of data subjects** | Not required (no high risk) |
| **Closure** | 2099-01-03, Compliance Officer, permission check added to review |
