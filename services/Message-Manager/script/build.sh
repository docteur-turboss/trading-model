#!/usr/bin/env bash
set -euo pipefail

# ------------------------------
# Build Script - message-manager
# ------------------------------
# Objectifs :
# - Nettoyer les anciens builds
# - Compiler TypeScript en JS
# - Vérifier les types
# - Préparer le dossier dist
# - Compatible CI/CD et exécution locale
# ------------------------------

# Couleurs pour logs
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

echo -e "${GREEN}🚀 Starting build process for message-manager...${NC}"

# 1. Nettoyage des anciens builds
echo -e "${YELLOW}🧹 Cleaning previous build artifacts...${NC}"
rm -rf dist
mkdir -p dist

# 2. Vérification des types TypeScript
echo -e "${YELLOW}🔍 Checking TypeScript types...${NC}"
tsc --noEmit

echo -e "${GREEN}✅ TypeScript types OK${NC}"

# 3. Compilation TypeScript
echo -e "${YELLOW}⚡ Compiling TypeScript to JavaScript...${NC}"
tsc

echo -e "${GREEN}✅ Compilation completed${NC}"

# 4. Copier les fichiers non-TS (par ex. .json, .env.example)
echo -e "${YELLOW}📦 Copying static assets...${NC}"
cp -R src/**/*.json dist/ 2>/dev/null || true
cp -R .env.example dist/ 2>/dev/null || true

# 5. Vérification finale
if [ -d "dist" ]; then
  echo -e "${GREEN}🎯 Build successful! Output is in dist/${NC}"
else
  echo -e "${RED}❌ Build failed!${NC}"
  exit 1
fi

echo -e "${GREEN}🚀 Build process finished.${NC}"