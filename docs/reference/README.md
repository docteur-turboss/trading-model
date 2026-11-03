# Implementation Reference

This section documents the internal implementation of key modules. These are not general concept explanations — they describe how specific modules in the codebase work.

> For conceptual explanations (what and why, independent of implementation), see [Concepts](../concepts/README.md).

| Document | Description | Module |
| -------- | ----------- | ------ |
| [Genetic Algorithm](genetic-algorithm.md) | GA module: genome structure, operators, NSGA-II, adaptive control | `trader-trainer` GA module |
| [Neural Network](neural-network.md) | NN module: architecture, activations, optimizers, training modes | `trader-trainer` NN module |
| [Training Process](training-process.md) | End-to-end training pipeline: data prep, evolution loop, wallet simulation | `trader-trainer` Trainer |
| [Table Schemas](table-schemas.md) | MySQL DDL, column definitions, TypeScript interfaces | `financial-scraper` |

For platform-level architecture, see [Bounded Contexts](../architecture/bounded-contexts.md) and [Service Architecture](../services/README.md).
