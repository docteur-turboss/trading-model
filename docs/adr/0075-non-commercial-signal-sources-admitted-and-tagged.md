# ADR-0075: Free Personal-Use Signal Sources Are Admitted, Tagged by Their Terms

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0036](./0036-multi-dimension-signals-mvp.md) (decision 2 amended here)
**Verified by:** `services/financial-scraper/tests/unit/signals/signal-registry.spec.ts`, `services/financial-scraper/tests/unit/signals/signal-collector.spec.ts`

## Context

ADR-0036 decision 2 only admits sources free for any use. No source of equity, ETF or crypto prices passes that test, while the project targets several asset classes. Owner decision (issue #1264, 2026-11-15): no source may cost money for the use made, and sources are preferred in this order.

## Decision

1. **Rank 1**: commercial use allowed for free (`accessPolicy.terms` `public-domain` or `attribution`). Every source should reach it.
2. **Rank 2**: personal or research use free, commercial use forbidden or under licence (`terms: "non-commercial"`). Admitted, marked as such.
3. **Licence check for rank 2**: the entry records whether a commercial licence exists (`commercialLicence`: `available` with `commercialLicenceUrl`, `unavailable`, `unknown`). It is information, never a purchase. `unknown` is accepted and counted apart.

A rank 2 source is kept only if no rank 1 source gives the same data; the ADR or PR adding it shows it. A `non-commercial` entry carries `restrictions` (the clause read, quoted short, with the reading date); `commercialLicence` and `restrictions` are refused on rank 1 terms. A source paid for the use made, or whose terms cannot be found, stays unwritable.

The gauge `fs_signal_sources{terms,commercial_licence}` counts the registry sources, and startup logs the `non-commercial` ones by name, so a company sees which to replace or license before commercial use. The schema stays v1 (additive).

## Consequences

- Rank 2 sources can enter the registry (one PR each); nothing is added here.
- In production, financial-scraper refuses to start while an active `non-commercial` source (its key set) is missing from `SIGNAL_NON_COMMERCIAL_ACCEPTED`; elsewhere the gauge and the `warn` log remain the only signal.
