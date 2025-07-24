#!/bin/bash

# =================================================================
# Help Menu Function
# =================================================================
show_help() {
cat << EOF
Usage: ./start.sh -m <MANUAL_ID> --cookie-string 'YOUR_COOKIE_STRING' [--mode <MODE>]

This script downloads Toyota Technical Information System (TIS) manuals.

================================================================================
==  IMPORTANT PREREQUISITES & WARNING
================================================================================
1.  A valid TIS subscription is REQUIRED. A 48-hour subscription is sufficient.
    You can purchase one from: https://techinfo.toyota.com

2.  These manuals are copyrighted by Toyota. This tool is for personal archival
    purposes only. DO NOT SHARE the downloaded manuals.

3.  You must find your vehicle's Manual ID from the TIS portal after logging in.
    - Navigate to your vehicle's Repair Manual (RM) or Electrical Wiring Diagram (EWD).
    - When the viewer window pops up, look at the URL.
    - The Manual ID will be a code like 'RM12345', 'EM12345' or 'EWD12345'.

================================================================================

Required Arguments:
  -m, --manual <MANUAL_ID>    The ID of the manual to download (e.g., RM661U, EWD353U).
                              Can be specified multiple times.

  --cookie-string '...'       A valid cookie string from an authenticated TIS session in your browser.
                              This is required for authentication.

Optional Arguments:
  --mode <MODE>               Download mode. Can be 'fresh', 'resume', or 'overwrite'.
                              If not provided, you will be prompted to choose.
  -h, --help                  Display this help and exit.

Download Modes:
  - fresh:    Creates a new, versioned folder for the download (e.g., YYYY-MM-DD_RM1234).
  - resume:   Skips any PDF files that already exist in the target folder.
  - overwrite: Re-downloads all files, overwriting any that exist.

Example:
  ./start.sh -m RM661U -m EWD353U --mode resume --cookie-string 'TISESSIONID=...;'

Cookie Heist Instructions:
  To get your cookie string:
  1. Open a new Incognito Window in your browser.
  2. Open Developer Tools (F12) and go to the "Network" tab.
  3. Log into https://techinfo.toyota.com/t3Portal/
  4. In the Network tab's filter bar, find any request to 'techinfo.toyota.com'.
  5. Click on it, go to the "Headers" tab, and find the "Request Headers" section.
  6. Find the 'cookie' header, right-click its entire value, and select "Copy value".
EOF
}

# =================================================================
# Argument Parsing
# =================================================================
COOKIE_STRING=""
NODE_ARGS=()

# Check for help flag first
for arg in "$@"; do
  if [ "$arg" == "-h" ] || [ "$arg" == "--help" ]; then
    show_help
    exit 0
  fi
done

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --cookie-string)
      COOKIE_STRING="$2"
      shift 2
      ;;
    --mode)
      NODE_ARGS+=(--mode "$2")
      shift 2
      ;;
    -m|--manual)
      NODE_ARGS+=(-m "$2")
      shift 2
      ;;
    # FIX: Recognize and ignore old, unsupported arguments
    -e|--email|-p|--password)
      echo "Warning: The '$1' argument is deprecated and will be ignored. Please use --cookie-string."
      shift 2
      ;;
    *)
      # Pass any other arguments directly to the Node.js script
      NODE_ARGS+=("$1")
      shift
      ;;
  esac
done

# If cookie string is missing, prompt for it
if [ -z "$COOKIE_STRING" ]; then
    echo "⚠️ ERROR: --cookie-string argument not provided."
    echo ""
    echo "--- How to get your Cookie String ---"
    echo "1. Open a new Incognito Window in your browser and open Developer Tools (F12)."
    echo "2. Go to the 'Network' tab in Developer Tools."
    echo "3. Log into https://techinfo.toyota.com/t3Portal/"
    echo "4. In the Network tab, find a request, go to Headers -> Request Headers."
    echo "5. Find the 'cookie' header, right-click its value, and select 'Copy value'."
    echo "---------------------------------------"
    echo ""
    read -p "Please paste your cookie string here and press Enter: " COOKIE_STRING
    if [ -z "$COOKIE_STRING" ]; then
        echo "No cookie string provided. Aborting."
        exit 1
    fi
fi

# If mode is missing, prompt for it
if ! [[ " ${NODE_ARGS[@]} " =~ " --mode " ]]; then
    echo ""
    echo "--- Please select a download mode ---"
    echo "1. Fresh:    Create a new, versioned folder for the download."
    echo "2. Resume:   Skip any files that already exist."
    echo "3. Overwrite: Re-download all files, replacing any that exist."
    echo "---------------------------------------"
    read -p "Enter your choice (1, 2, or 3): " MODE_CHOICE
    case $MODE_CHOICE in
        1) NODE_ARGS+=(--mode "fresh") ;;
        2) NODE_ARGS+=(--mode "resume") ;;
        3) NODE_ARGS+=(--mode "overwrite") ;;
        *) echo "Invalid choice. Aborting."; exit 1 ;;
    esac
fi

# =================================================================
# Pre-flight Dependency Checks
# =================================================================
echo "--- Running Pre-flight Dependency Checks ---"
if ! command -v xvfb-run &> /dev/null; then
    echo "⚠️ xvfb-run not found. Installing xvfb..."
    apt-get update && apt-get install -y xvfb
fi
echo "✅ xvfb is installed."

if [ ! -d "node_modules" ]; then
    echo "⚠️ Node modules not found. Running 'yarn install'..."
    yarn install
fi
echo "✅ Base node modules are installed."

# FIX: Check for and install playwright-extra if it's missing
if ! grep -q '"playwright-extra":' package.json; then
    echo "⚠️ Stealth plugin 'playwright-extra' not found in package.json. Running 'yarn add'..."
    yarn add playwright-extra
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to add playwright-extra. Please check for errors."
        exit 1
    fi
fi
echo "✅ Stealth plugins are configured."

echo "--- All Checks Passed. Starting Application ---"
echo ""

# Export the cookie string as an environment variable
export TIS_COOKIE_STRING="$COOKIE_STRING"

# Execute the main Node.js script, passing the cleaned arguments
xvfb-run --auto-servernum npx ts-node src/index.ts "${NODE_ARGS[@]}"
