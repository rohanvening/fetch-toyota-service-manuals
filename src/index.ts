// =================================================================
// Forcefully disable SSL certificate verification for this process
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// =================================================================

import { chromium } from "playwright-extra";
import { Browser, Cookie } from "playwright";
import processCLIArgs, { CLIArgs } from "./processCLIArgs";
import { join, resolve } from "path";
import { mkdir, readFile, writeFile, stat } from "fs/promises";
import downloadGenericManual, { DownloadStats } from "./genericManual";
import { jar } from "./api/client";
import dayjs from "dayjs";
import { shutdownManager } from "./state";

export interface Manual {
  type: "em" | "rm" | "bm";
  id: string;
  year?: number;
  raw: string;
}

interface ExtendedCLIArgs extends CLIArgs {
    mode?: "fresh" | "resume" | "overwrite";
}

async function run(args: ExtendedCLIArgs) {
  const cookieString = process.env.TIS_COOKIE_STRING;
  const { manual, mode = "resume" } = args;
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

  let dirPaths: { [manualId: string]: string } = Object.fromEntries(
    genericManuals.map((m) => [m.id, resolve(join(".", "manuals", m.raw))])
  );

  if (mode === 'fresh') {
      console.log("Mode: Fresh Download. Creating versioned folders...");
      const datePrefix = new Date().toISOString().split('T')[0];
      
      const versionedDirPaths: { [manualId: string]: string } = {};
      for (const m of genericManuals) {
          let versionedPath = resolve(join(".", "manuals", `${datePrefix}_${m.raw}`));
          let counter = 1;
          while (true) {
              try {
                  await stat(versionedPath);
                  versionedPath = resolve(join(".", "manuals", `${datePrefix}_${m.raw}_(${++counter})`));
              } catch (e) { break; }
          }
          versionedDirPaths[m.id] = versionedPath;
      }
      dirPaths = versionedDirPaths;
  } else {
      console.log(`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}.`);
  }

  await Promise.all(
    Object.values(dirPaths).map((m) => mkdir(m, { recursive: true }))
  );

  console.log("Copying accessor into manuals...");
  try {
    const accessorHTML = await readFile(join(__dirname, "..", "accessor/index.html"), "utf-8");
    await Promise.all(
      Object.values(dirPaths).map((m) => writeFile(join(m, "index.html"), accessorHTML))
    );
  } catch (e) {
    console.error("Unable to copy accessor file into manuals.", e);
  }

  console.log("Setting up STEALTH Playwright...");
  const browser: Browser = await chromium.launch({
    headless: false,
    args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
    ]
  });

  const cleanup = async () => {
    shutdownManager.isShuttingDown = true;
    console.log("\nCaught interrupt signal. Shutting down gracefully...");
    if (browser) {
      await browser.close();
      console.log("Browser closed.");
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  let transformedCookies: Cookie[] = [];

  if (cookieString) {
    console.log("Using cookies from environment variable...");
    const cookieStrings = cookieString.split(';').map(c => c.trim());
    
    transformedCookies = cookieStrings.map((c) => {
      const firstEqual = c.indexOf('=');
      const name = c.substring(0, firstEqual);
      const value = c.substring(firstEqual + 1);
      return { name, value, domain: ".toyota.com", path: "/", expires: dayjs().add(1, "day").unix(), httpOnly: false, secure: true, sameSite: "None" };
    });

    console.log("Populating axios cookie jar...");
    cookieStrings.forEach(cookie => {
        if (cookie) {
            jar.setCookieSync(cookie, 'https://techinfo.toyota.com');
        }
    });

  } else {
    console.log("No cookie string provided via environment variable. Aborting.");
    process.exit(1);
  }

  const context = await browser.newContext({
    storageState: { cookies: transformedCookies, origins: [] },
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  console.log("Checking that Playwright is logged in by validating cookie...");
  try {
    await page.goto("https://techinfo.toyota.com/t3Portal/");
    if (page.url().includes("login.toyota.com")) {
      console.error("\nERROR: Cookie validation failed. You were redirected to a login page.");
      await browser.close();
      process.exit(1);
    }
    console.log("Cookie appears to be valid. Proceeding with downloads.");
  } catch (e) {
      console.error("An error occurred during cookie validation:", e);
      await browser.close();
      process.exit(1);
  }

  console.log("Beginning manual downloads...");
  const totalStats: DownloadStats = { downloaded: 0, skipped: 0, failed: 0 };

  for (const manual of genericManuals) {
    console.log(`\nDownloading ${manual.raw}...`);
    const manualStats = await downloadGenericManual(page, manual, dirPaths[manual.id], mode);
    totalStats.downloaded += manualStats.downloaded;
    totalStats.skipped += manualStats.skipped;
    totalStats.failed += manualStats.failed;
  }

  console.log("\n--- Download Complete ---");
  console.log(`✅ Downloaded: ${totalStats.downloaded}`);
  console.log(`⏩ Skipped:    ${totalStats.skipped}`);
  console.log(`❌ Failed:     ${totalStats.failed}`);
  console.log("-------------------------");

  await browser.close();
  process.exit(0);
}

const args = processCLIArgs();
run(args);
