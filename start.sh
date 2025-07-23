#!/bin/bash

# This script checks for all necessary system and project dependencies before running the application.

echo "--- Running Pre-flight Dependency Checks ---"

# Function to check for a command
check_command() {
    if ! command -v "$1" &> /dev/null
    then
        echo "ERROR: '$1' command not found. Please install it to continue."
        exit 1
    fi
    echo "✅ $1 is installed."
}

# 1. Check for system tools
check_command "git"
check_command "yarn"

# 2. Check for base Node.js modules
if [ ! -d "node_modules" ]; then
    echo "⚠️ Node modules not found. Running 'yarn install'..."
    yarn install
    if [ $? -ne 0 ]; then
        echo "ERROR: 'yarn install' failed. Please check for errors."
        exit 1
    fi
fi
echo "✅ Base node modules are installed."

# 3. Check for and install specific stealth plugins if missing
missing_stealth=false
if ! grep -q '"playwright-extra":' package.json; then
    missing_stealth=true
fi
if ! grep -q '"playwright-extra-plugin-stealth":' package.json; then
    missing_stealth=true
fi

if [ "$missing_stealth" = true ]; then
    echo "⚠️ Stealth plugins not found in package.json. Running 'yarn add'..."
    yarn add playwright-extra playwright-extra-plugin-stealth
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to add stealth plugins. Please check for errors."
        exit 1
    fi
fi
echo "✅ Stealth plugins are configured."

# 4. Check for and create TypeScript declaration file for the stealth plugin
# This fixes the "Could not find a declaration file" error.
TYPE_DECLARATION_FILE="types.d.ts" # Create file in the root directory
if [ ! -f "$TYPE_DECLARATION_FILE" ]; then
    echo "⚠️ TypeScript declaration file for stealth plugin not found. Creating it..."
    # Create the declaration file with the required content
    echo "declare module 'playwright-extra-plugin-stealth';" > "$TYPE_DECLARATION_FILE"
fi
echo "✅ TypeScript declarations are in place."


# 5. Check for Playwright browsers
if [ ! -d "node_modules/playwright-extra/.local-browsers" ]; then
    echo "⚠️ Playwright browsers not found. Running 'npx playwright install chromium'..."
    npx playwright install chromium
    if [ $? -ne 0 ]; then
        echo "ERROR: Playwright browser installation failed. Please check for errors."
        exit 1
    fi
fi
echo "✅ Playwright browsers are installed."

echo "--- All Checks Passed. Starting Application ---"
echo ""

# Execute the main Node.js script, passing along all command-line arguments
npx ts-node src/index.ts "$@"
