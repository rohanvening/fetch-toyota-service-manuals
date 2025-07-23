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

# 2. Check for and install xvfb for headless browser display
if ! command -v xvfb-run &> /dev/null
then
    echo "⚠️ xvfb-run not found. Installing xvfb..."
    apt-get update && apt-get install -y xvfb
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install xvfb. Please check for errors."
        exit 1
    fi
fi
echo "✅ xvfb is installed."

# 3. Check for base Node.js modules
if [ ! -d "node_modules" ]; then
    echo "⚠️ Node modules not found. Running 'yarn install'..."
    yarn install
    if [ $? -ne 0 ]; then
        echo "ERROR: 'yarn install' failed. Please check for errors."
        exit 1
    fi
fi
echo "✅ Base node modules are installed."

# 4. Check for and install specific stealth plugins if missing
if ! grep -q '"playwright-extra":' package.json; then
    echo "⚠️ playwright-extra not found. Installing..."
    yarn add playwright-extra
fi
if grep -q '"playwright-extra-plugin-stealth":' package.json; then
    echo "⚠️ Found incorrect stealth package. Removing..."
    yarn remove playwright-extra-plugin-stealth
fi
echo "✅ Stealth plugins are configured."

# 5. Check for and create TypeScript declaration file for the stealth plugin
TYPE_DECLARATION_FILE="types.d.ts"
if [ ! -f "$TYPE_DECLARATION_FILE" ]; then
    echo "⚠️ TypeScript declaration file for stealth plugin not found. Creating it..."
    echo "declare module 'playwright-extra-plugin-stealth';" > "$TYPE_DECLARATION_FILE"
fi
echo "✅ TypeScript declarations are in place."


# 6. Check for Playwright browsers
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

# Execute the main Node.js script inside the virtual screen buffer
# and pass along all command-line arguments
xvfb-run --auto-servernum npx ts-node src/index.ts "$@"
