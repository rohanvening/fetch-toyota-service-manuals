#!/bin/bash

# =================================================================
# Help Menu Function
# =================================================================
show_help() {
cat << EOF
Usage: ./start.sh -m <MANUAL_ID> --cookie-string 'YOUR_COOKIE_STRING'

This script downloads PDF versions of Toyota Technical Information System (TIS) manuals.

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
    - The Manual ID will be a code like 'RM12345' or 'EM12345'.

================================================================================

Required Arguments:
  -m, --manual <MANUAL_ID>    The ID of the manual to download (e.g., RM661U).
                              Can be specified multiple times.

  --cookie-string '...'       A valid cookie string from an authenticated TIS session in your browser.
                              This is required for authentication.

Optional Arguments:
  -h, --help                  Display this help and exit.

Example:
  ./start.sh -m RM661U -m EM1234 --cookie-string 'TISESSIONID=...; iPlanetDirectoryPro=...;'

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
MANUALS=()

# Check for help flag first
for arg in "$@"; do
  if [ "$arg" == "-h" ] || [ "$arg" == "--help" ]; then
    show_help
    exit 0
  fi
done

# Parse arguments for the Node.js script
while [[ $# -gt 0 ]]; do
  case $1 in
    --cookie-string)
      COOKIE_STRING="$2"
      shift # past argument
      shift # past value
      ;;
    *)
      # Pass any other arguments directly to the Node.js script
      MANUALS+=("$1")
      shift # past argument
      ;;
  esac
done

# If cookie string is missing, show instructions and prompt for it
if [ -z "$COOKIE_STRING" ]; then
    echo "⚠️ ERROR: --cookie-string argument not provided."
    echo ""
    echo "--- How to get your Cookie String ---"
    echo "1. Open a new Incognito Window in your browser."
    echo "2. Open Developer Tools (F12) and go to the 'Network' tab."
    echo "3. Log into https://techinfo.toyota.com/t3Portal/"
    echo "4. In the Network tab's filter bar, find any request to 'techinfo.toyota.com'."
    echo "5. Click on it, go to the 'Headers' tab, and find the 'Request Headers' section."
    echo "6. Find the 'cookie' header, right-click its entire value, and select 'Copy value'."
    echo "---------------------------------------"
    echo ""
    read -p "Please paste your cookie string here and press Enter: " COOKIE_STRING
    if [ -z "$COOKIE_STRING" ]; then
        echo "No cookie string provided. Aborting."
        exit 1
    fi
fi

# Re-assemble the arguments for the Node.js script
set -- "${MANUALS[@]}" --cookie-string "$COOKIE_STRING"


# =================================================================
# Pre-flight Dependency Checks
# =================================================================
echo "--- Running Pre-flight Dependency Checks ---"

check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "ERROR: '$1' command not found. Please install it."
        exit 1
    fi
    echo "✅ $1 is installed."
}

check_command "git"
check_command "yarn"

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

echo "--- All Checks Passed. Starting Application ---"
echo ""

# Execute the main Node.js script inside the virtual screen buffer
xvfb-run --auto-servernum npx ts-node src/index.ts "$@"
