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

# rest of the script unchanged (argument parsing, dependency checks, env, execution)
# ...
