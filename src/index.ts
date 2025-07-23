// =================================================================
// Forcefully disable SSL certificate verification for this process
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// =================================================================

// Use the 'stealth' version of playwright.
import { chromium } from "playwright-extra";

import processCLIArgs, { CLIArgs } from "./processCLIArgs";
import login from "./api/login";
import { join, resolve } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import downloadGenericManual from "./genericManual";
import { Cookie } from "playwright";
import { jar } from "./api/client";
import dayjs from "dayjs";

export interface Manual {
  type: "em" | "rm" | "bm";
  id: string;
  year?: number;
  raw: string;
}

async function run({ manual, email, password, headed, cookieString }: CLIArgs) {
  const genericManuals: Manual[] = [];
  const rawManualIds = new Set(manual.map((m) => m.toUpperCase().trim()));

  console.log("Parsing manual IDs...");
  rawManualIds.forEach((m) => {
    const id = m.includes("@") ? m.split("@")[0] : m;
    const year = m.includes("@") ? parseInt(m.split("@")[1]) : undefined;

    switch (m.slice(0, 2).toUpperCase()) {
      case "EM":
      case "RM":
      case "BM":
        genericManuals.push({
          type: m.slice(0, 2).toLowerCase() as "em" | "rm" | "bm",
          id,
          year,
          raw: m,
        });
        return;
      default:
        console.error(
          `Invalid manual ${m}: manual IDs must start with EM, RM, or BM.`
        );
        process.exit(1);
    }
  });

  const dirPaths: { [manualId: string]: string } = Object.fromEntries(
    genericManuals.map((m) => [m.id, resolve(join(".", "manuals", m.raw))])
  );

  await Promise.all(
    Object.values(dirPaths).map((m) => mkdir(m, { recursive: true }))
  );

  console.log("Setting up STEALTH Playwright...");
  const browser = await chromium.launch({
    headless: false,
    args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
    ]
  });

  let transformedCookies: Cookie[] = [];

  if (cookieString) {
    console.log("Using cookies from command line...");
    // More robustly split the cookie string by semicolon and trim whitespace from each part.
    const cookieStrings = cookieString.split(';').map(c => c.trim());
    
    transformedCookies = cookieStrings.map((c) => {
      // Find the first equals sign to correctly split name and value
      const firstEqual = c.indexOf('=');
      const name = c.substring(0, firstEqual);
      const value = c.substring(firstEqual + 1);
      return {
        name, value,
        domain: ".toyota.com",
        path: "/",
        expires: dayjs().add(1, "day").unix(),
        httpOnly: false,
        secure: true,
        sameSite: "None",
      };
    });

    // =================================================================
    // FIX: Also add these cookies to the axios client's cookie jar
    // =================================================================
    console.log("Populating axios cookie jar...");
    cookieStrings.forEach(cookie => {
        // We need to trim whitespace from the cookie string
        if (cookie) { // Ensure we don't process empty strings
            jar.setCookieSync(cookie, 'https://techinfo.toyota.com');
        }
    });

  } else {
    console.log("No cookie string provided. Please use the --cookie-string argument.");
    process.exit(1);
  }

  const context = await browser.newContext({
    storageState: { cookies: transformedCookies, origins: [] },
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  console.log("Checking that Playwright is logged in...");
  await page.goto("https://techinfo.toyota.com/t3Portal/");

  console.log("Beginning manual downloads...");
  for (const manual of genericManuals) {
    console.log(`Downloading ${manual.raw}... (type = generic)`);
    await downloadGenericManual(page, manual, dirPaths[manual.id]);
  }

  console.log("All manuals downloaded!");
  await browser.close();
  process.exit(0);
}

const args = processCLIArgs();
run(args);
