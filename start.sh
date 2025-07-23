#!/bin/bash

# This script checks for all necessary system dependencies before running the application.

echo "--- Running Pre-flight Dependency Checks ---"

# 1. Check for Git
if ! command -v git &> /dev/null
then
    echo "ERROR: 'git' command not found. Please install Git to continue."
    exit 1
fi
echo "✅ Git is installed."

# 2. Check for Yarn
if ! command -v yarn &> /dev/null
then
    echo "ERROR: 'yarn' command not found. Please install Yarn to continue."
    echo "Installation instructions: https://classic.yarnpkg.com/en/docs/install"
    exit 1
fi
echo "✅ Yarn is installed."

# 3. Check for Node.js modules
if [ ! -d "node_modules" ]; then
    echo "⚠️ Node modules not found. Running 'yarn install'..."
    yarn install
    if [ $? -ne 0 ]; then
        echo "ERROR: 'yarn install' failed. Please check for errors."
        exit 1
    fi
fi
echo "✅ Node modules are installed."

# 4. Check for Playwright browsers
# We need to check for the existence of the playwright-extra browser cache
if [ ! -d "node_modules/playwright-extra/.local-browsers" ]; then
    echo "⚠️ Playwright browsers not found. Running 'npx playwright install --with-deps chromium'..."
    npx playwright install --with-deps chromium
    if [ $? -ne 0 ]; then
        echo "ERROR: Playwright browser installation failed. Please check for errors."
        exit 1
    fi
fi
echo "✅ Playwright browsers are installed."

echo "--- All Checks Passed. Starting Application ---"
echo ""

# Execute the main Node.js script, passing along all command-line arguments
NODE_TLS_REJECT_UNAUTHORIZED=0 ts-node src/index.ts "$@"
