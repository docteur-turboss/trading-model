# ADR-0084: Text Signals Are Stored as Documents and Enriched Into v1 Numeric Signals

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0036](./0036-multi-dimension-signals-mvp.md) (schema v1, "text needs schema v2 with an enrichment step"), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand/contract), [ADR-0051](./0051-mysql-retention-cronjob.md) (retention), [ADR-0061](./0061-n-1-compatibility-of-public-api-and-bus-messages.md) (N-1 compatibility), [ADR-0075](./0075-non-commercial-signal-sources-admitted-and-tagged.md) (licence order), [ADR-0030](./0030-mt4-point-in-time-features-and-success-criteria.md) (point in time), [ADR-0076](./0076-multi-asset-trainer-shared-encoders-and-agent-hierarchy.md) (agent hierarchy), [ADR-0081](./0081-signal-inputs-to-the-network.md) (signal inputs to the network)
**Verified by:** manual review 2026-11-20 (owner decision at the review of PR #1471: option B, 90 days; no code yet, the implementation issues name their checks)

## Context

Issue #1307 asks for text signals: press RSS feeds, SEC litigation releases, court cases (CourtListener), EU law (EUR-Lex), GDELT. Schema v1 (`services/financial-scraper/src/domain/signals.ts`) only stores numbers: a payload is a measure (`metric`, numeric `value`, `unit`). ADR-0036 defers text to "schema v2 with an enrichment step".

State on 2026-11-16:

- **A consumer exists, its value is not measured.** The trainer reads numeric signals behind `FEATURE_SIGNAL_INPUTS` (ADR-0081, `SUBJECT:dimension:metric`, value + age + confidence per metric). The with/without measurement is issue #1464, still open. The owner decided to wait for it before implementing text signals; this ADR only fixes the design and lists the tool options.
- **No enrichment component exists**, and nothing in the cluster has a GPU.
- **The collector can already fetch text.** A `rest_api` request accepts `format: "text"` (raw body). An RSS or Atom feed is a GET returning XML: it needs an adapter, not a new protocol worker. The repository has no XML parser.
- **A legal source is in service** (Federal Register document counts, #1289): the `legal` payload (`jurisdiction`) is confirmed for numbers.

Text raises questions numbers do not:

1. **Copyright.** A press article, and often its summary, is protected. Storing and serving it is a reproduction.
2. **Personal data.** Court decisions and social posts name people (GDPR: lawful basis, minimization, retention).
3. **Look-ahead bias.** A language model trained on text published after a document knows what followed it. Scored by such a model, a 2024 article carries 2025 knowledge, and a backtest on it leaks the future (ADR-0030 point-in-time rule).
4. **Reproducibility.** A new version of the enrichment tool gives other numbers for the same text. A value recomputed later was not available at the time.

## Decision

1. **No schema v2 for `signals`.** The enrichment step turns documents into ordinary v1 numeric signals, aggregated per subject and per day. Examples: `news_count`, `news_sentiment_mean`, `legal_event_count:litigation`. `SIGNAL_SCHEMA_VERSION` stays 1, the `signals` table, the API and ADR-0081 are unchanged, and an N-1 reader sees new metrics only (ADR-0061: additive). The payload `details` names the tool and its version (`enricher`) and the number of documents counted.
2. **Documents in their own table, `signal_documents`** (new migration, expand only): `id` (sha256 of source and feed item id or URL), `source_id`, `url`, `title`, `published_at` (as the source says), `first_seen_at`, `content_hash`, `language`, and the enrichment result per tool version. No body is stored: the enrichment reads title and feed description in memory, then drops the description. Court and social sources store no party or author name, only the case id, the court, the date and the nature of the case. The table is not served by the API. It is purged by the retention job (ADR-0051) after 90 days, since derived signals keep the numbers: the migration that creates it also adds it to `scripts/retention-mysql.sh` and to the `retention` user grants of `deploy/k8s/jobs/migration-user-job.yaml` (SELECT, DELETE), and the table gets its rows in `docs/compliance/data-processing-register.md` and `docs/compliance/data-retention-policy.md`.
3. **RSS and Atom through `rest_api`** with `format: "text"` and one `rss` adapter in `SOURCE_ADAPTERS`, with an XML parser added to financial-scraper. `html_scrape` stays out: one adapter per site, breaks on every redesign, `robots.txt` to obey. A source enters the registry under the ADR-0075 order, after its terms are read.
4. **Point in time.** A document's time is `first_seen_at`. A derived signal is stamped with the enrichment time of the newest document it counts, never earlier. A new tool version does not rewrite past signals: it writes its own metric from its first day of service. A backfill of old documents with a new tool is refused, since its values were not available at the time.
5. **Entity linking by the registry.** A document is attached to an asset or a sector by aliases declared in the registry (name, ticker, issuer). A document that matches no subject is counted for no one. No statistical entity linking in the first step.
6. **Deduplication.** The same event seen by several sources counts once: same normalized title hash within 48 h. Near-duplicates (rewritten titles) are out of scope of the first step.
7. **Enrichment tool: option B**, decided by the owner at the review of this ADR (2026-11-20), from the options below. Volume assumed for the costs: 500 documents a day (about ten feeds); short texts (title + description, about 1,500 input tokens with instructions).

   | Option | Run cost | Look-ahead bias | Data leaves the cluster | Licence | Quality on headlines | Operations |
   | --- | --- | --- | --- | --- | --- | --- |
   | **A. Lexicon + rules** in the collector (finance word lists, keywords per event type) | Negligible CPU | None | No | Loughran-McDonald lists: free for academic use, commercial use under licence (to read, ADR-0075 rank 2) | Weak: negation and context missed | None |
   | **B. Small local encoder** (BERT-size model, about 110 M parameters, ONNX on CPU, a finance sentiment head and a zero-shot classifier for event types) | Estimate 50-200 ms per text on one core: under 2 min CPU a day; 0.5-1 GB memory; image +110-440 MB | Limited to the model's pre-training date; fixed weights | No | Weights licence to read per model before choosing | Good on sentiment, fair on event types | Native `onnxruntime-node` dependency, model file versioned with the image |
   | **C. Local LLM** (7-8 B parameters, quantized, llama.cpp-type server) | Estimate seconds to tens of seconds per text on CPU: 1-3 h CPU a day; 5-8 GB memory | High: pre-training data after much of the history | No | Varies (some Apache 2.0, some community licences) | Good, flexible (entities, event types, structured output) | New service, image and manifests; no GPU in the cluster |
   | **D. External LLM API** (example: Claude Haiku 5.5, $0.10 / $0.50 per million input / output tokens, batches -50 %) | About $0.11 a day, $3.4 a month ($1.7 in batch); grows linearly with volume | High: knowledge cutoff after the history | Yes: the provider processes the texts (a processor for personal data, DPA needed) | Provider terms of use | Best, flexible | First outbound secret and egress rule of the collector; the provider retires models, so the tool version changes under us |

   Chosen for the first step: **B**, with A's rules for event types where a keyword is enough. It is the only option with no data leaving the cluster, a fixed tool version, a bounded look-ahead bias and no monthly bill, at a CPU cost the collector absorbs. D is the cheapest to build and the best on quality, but its look-ahead bias makes past values unusable for training, and court texts would leave the cluster.
8. **Sequence.** Implementation issues (migration and table, `rss` adapter and first source, enrichment step, entity aliases in the registry) are opened once #1464 reports (tool chosen: B). If #1464 shows numeric signals do not help the model, text signals wait for a consumer that uses them (the agent hierarchy of ADR-0076).

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Schema v2: a text payload in `signals` | First version change of the schema: every reader (trainer, API, ADR-0081 join) must handle two shapes, and the table serves text to clients, with the copyright and personal-data exposure that implies; the trainer only reads numbers |
| Store the full article body | Copyright reproduction without need: the numbers are kept, the text is not served |
| A new protocol worker `rss` | `rest_api` already fetches raw text; only the parsing differs, which is an adapter's job |
| `html_scrape` sources now | One fragile adapter per site and `robots.txt` to obey; feeds first, as #1307 says |
| Backfill history with the chosen tool | Values that did not exist at the time: a backtest on them leaks the future |
| Statistical entity linking (NER + knowledge base) | A component of its own for a first step that only needs a few dozen subjects; registry aliases are enough |
| A dedicated enrichment service from the start | Needed only for option C; for A, B and D the collector pod runs it, as ADR-0036 chose for the collector itself |

## Consequences

- The trainer can read text-derived metrics like any other signal, with no code change: `TRAINER_SIGNAL_FEATURES=AAPL:legal:legal_event_count:litigation`.
- A tool change starts a new metric with no history: a model trained on it needs time before the metric is useful.
- No text is served or kept beyond 90 days: a better tool later cannot reprocess old documents (by design, decision 4).
- Copyright and personal-data risk is kept low by storing no body and no names, but each text source still needs its terms read, and court sources a check that the stored fields name no one.
- Option B adds a model file (110-440 MB) and the native `onnxruntime-node` dependency to the financial-scraper image; the licence of the chosen weights is read before the implementation, under the ADR-0075 order.
