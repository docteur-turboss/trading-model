#!/usr/bin/env bash
set -euo pipefail

# ------------------------------
# Dev Script - message-manager
# ------------------------------
# Objectifs :
# - Build TypeScript en mode watch
# - Lancer le serveur local avec reload automatique
# - Support des changements de code en temps réel
# - Compatible CI/CD et dev local
# ------------------------------

# Couleurs pour logs
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

echo -e "${GREEN}🚀 Starting development environment for message-manager...${NC}"

# 1. Nettoyage du dist (optionnel, mais sécurise le watch)
echo -e "${YELLOW}🧹 Cleaning previous build artifacts...${NC}"
rm -rf dist
mkdir -p dist

# 2. Compilation TS en watch
echo -e "${YELLOW}⚡ Starting TypeScript compiler in watch mode...${NC}"
tsc --watch --preserveWatchOutput &
TSC_PID=$!

# 3. Lancement serveur Node avec reload automatique via nodemon
echo -e "${YELLOW}🖥️  Launching app with nodemon...${NC}"
nodemon --watch dist --ext js --exec "node dist/app/index.js" &
NODE_PID=$!

# 4. Gestion des signaux pour arrêt propre
trap "echo -e '${YELLOW}🛑 Stopping development environment...${NC}'; kill $TSC_PID $NODE_PID; exit 0" SIGINT SIGTERM

# 5. Wait indéfiniment pour garder le script actif
wait $TSC_PID $NODE_PID