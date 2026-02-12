#!/usr/bin/env bash
set -euo pipefail

# ------------------------------
# Lint Script - message-manager
# ------------------------------
# Objectifs :
# - Linter tout le code TypeScript et JS
# - Appliquer auto-fix si possible
# - Vérifier la qualité du code avant commit ou CI
# ------------------------------

# Couleurs pour logs
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

echo -e "${GREEN}🔍 Starting linting process...${NC}"

# 1. Vérification des fichiers TypeScript et JS dans src/ et tests/
TARGET_DIRS="src tests"

# 2. Lancer ESLint avec auto-fix
echo -e "${YELLOW}🛠️  Running ESLint with auto-fix...${NC}"
npx eslint $TARGET_DIRS --ext .ts,.tsx,.js,.jsx --fix || {
    echo -e "${RED}❌ ESLint found issues that could not be fixed automatically.${NC}"
    exit 1
}

# 3. Lancer ESLint en mode vérification stricte pour CI
echo -e "${YELLOW}🔎 Verifying ESLint compliance...${NC}"
npx eslint $TARGET_DIRS --ext .ts,.tsx,.js,.jsx --max-warnings 0 || {
    echo -e "${RED}❌ Lint verification failed.${NC}"
    exit 1
}

echo -e "${GREEN}✅ Linting passed successfully!${NC}"