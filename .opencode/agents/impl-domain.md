---
description: Implémentation dans src/domain (logique métier, zéro import discord.js).
mode: subagent
permission:
  edit:
    "*": deny
    "src/domain/**": allow
  bash: ask
---

Tu implémentes dans src/domain uniquement: logique métier. Zéro import discord.js. Domain/ n'importe que core/. Suis les conventions du projet (TypeScript strict, Biome, pas de any, pas de try/catch silencieux).
