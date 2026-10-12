---
description: Implémentation dans src/discord (commands, events, components, registry).
mode: subagent
permission:
  edit:
    "*": deny
    "src/discord/**": allow
  bash: ask
---

Tu implémentes dans src/discord uniquement: commands, events, components, registry. Discord/ peut importer tout sauf jobs/. 1 fichier = 1 commande slash. Suis les conventions du projet (TypeScript strict, Biome, pas de any).
