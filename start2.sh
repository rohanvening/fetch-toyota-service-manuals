#!/bin/bash

# Start script for fetching Toyota service manuals with enhanced debugging and error handling

# Set environment variables for debugging and TLS (optional)
export NODE_TLS_REJECT_UNAUTHORIZED=0 # Warning: Use only for testing, not recommended for production

# Define paths for debugging output
DEBUG_DIR="./debug_logs"
RAW_HTML_FILE="$DEBUG_DIR/raw_response.html"
TOC_DEBUG_FILE="$DEBUG_DIR/toc_debug.html"

# Ensure the debug directory exists
mkdir -p "$DEBUG_DIR"

# Print a message to indicate the script is starting
echo "--- Starting Toyota Service Manual Fetch Script ---"

# Prompt user to select a download mode
echo "--- Please select a download mode ---"
echo "1. Fresh:    Create a new, versioned folder for the download."
echo "2. Resume:   Skip any files that already exist."
echo "3. Overwrite: Re-download all files, replacing any that exist."
echo "---------------------------------------"
read -p "Enter your choice (1, 2, or 3): " MODE

# Validate user input
if [[ "$MODE" != "1" && "$MODE" != "2" && "$MODE" != "3" ]]; then
  echo "Invalid choice. Please enter 1, 2, or 3."
  exit 1
fi

# Run pre-flight dependency checks
echo "--- Running Pre-flight Dependency Checks ---"
if ! command -v xvfb-run &> /dev/null; then
  echo "❌ xvfb is not installed. Please install it and try again."
  exit 1
else
  echo "✅ xvfb is installed."
fi

if ! [ -d "node_modules" ]; then
  echo "❌ Node modules are not installed. Running 'npm install'..."
  npm install
  if [ $? -ne 0 ]; then
    echo "Failed to install Node modules. Exiting."
    exit 1
  fi
else
  echo "✅ Base node modules are installed."
fi

echo "✅ All Checks Passed. Starting Application..."

# Define the manual ID and cookies
MANUAL_ID="RM661U" # Replace with the manual ID you want to download
COOKIE_STRING="TISESSIONID=agent-authn-tx-7mka4M2Wk16Ix6uEzjjRrPVpr6g=eAENzEEKwjAQBdC7/HVs0EkJzs6FoqDYK9Q0JUKbKekISund7fYt3oJPGcBIqtPM1moM6Z17qVR+om0VZGTnyCo1UrQdLAxGTR14b5C6MoOX1SB+p018TUQHfySDLDnE7b261+1yeva7uzRnXz+w/gFWgCMn; TISESSIONID=0p0TyB5Gd3hwr7nDdhhTd8hSbZ10sZnNnx2jF4rYDkpLy0XqwgVc!266575291; TITARGET=null; s_fid=0C97F399102E09CE-32A386983C14ED2C; s_cc=true; s_vi=[CS]v1|3440DCF25360AE74-40000FBFC05C14DD[CE]; COOKIECHECK=cookies_enabled; iPlanetDirectoryPro=KAez4PTWK6YmMbBx1wsTkUnpODI.*AAJTSQACMDIAAlNLABxJQ2VWU2ZFTEFNdVVaUEd0K1dBWDkrMTJLa2s9AAR0eXBlAANDVFMAAlMxAAIwMQ..*; ADRUM=s=1753332204537&r=https%3A%2F%2Ftechinfo.toyota.com%2FtechInfoPortal%2Fappmanager%2Ft3%2Fti%3F350141633"

# Run the Node.js application with debugging enabled
echo "--- Starting Node.js Application ---"
node src/index.js -m "$MANUAL_ID" --cookie-string "$COOKIE_STRING" --mode "$MODE"

# Check for errors in the output
if [ $? -ne 0 ]; then
  echo "❌ An error occurred during execution. Checking for debug logs..."

  # Check if raw HTML was saved
