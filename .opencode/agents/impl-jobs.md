---
description: Implémentation dans src/jobs (tâches schedulées BullMQ).
mode: subagent
permission:
  edit:
    "*": deny
    "src/jobs/**": allow
  bash: ask
---

Tu implémentes dans src/jobs uniquement: tâches schedulées BullMQ. Jobs/ n'importe que core/, domain/ et persistence/. Suis les conventions du projet (TypeScript strict, Biome, pas de any).
