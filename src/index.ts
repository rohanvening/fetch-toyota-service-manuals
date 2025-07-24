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
import downloadEWD from "./ewd";
import { jar } from "./api/client";
import dayjs from "dayjs";
import tough from "tough-cookie";

export interface Manual {
  // ...
}

interface ExtendedCLIArgs extends CLIArgs {
  // ...
}

// Helper to parse cookie string into an array of objects
function parseCookieString(cookieString: string, domain: string) {
  // Split by ; but ignore empty
  return cookieString
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [name, ...rest] = c.split("=");
      return {
        name: name.trim(),
        value: rest.join("=").trim(),
        domain,
        path: "/",
        httpOnly: false,
        secure: true,
      } as Cookie;
    });
}

async function injectCookiesToPlaywright(browser: Browser, cookieString: string) {
  const context = await browser.newContext();
  // Correct domain for Toyota TIS
  const domain = ".techinfo.toyota.com";
  const cookies = parseCookieString(cookieString, domain);
  await context.addCookies(cookies);
  return context;
}

async function injectCookiesToToughCookie(cookieString: string, jar: tough.CookieJar, domain: string) {
  // tough-cookie expects one cookie at a time, and needs a URL for setCookie
  const url = `https://${domain}/`;
  const parts = cookieString.split(";").map((c) => c.trim()).filter(Boolean);
  for (const part of parts) {
    await new Promise((resolve, reject) => {
      jar.setCookie(part, url, {}, (err) => (err ? reject(err) : resolve(void 0)));
    });
  }
}

async function run(args: ExtendedCLIArgs) {
  const cookieString = process.env.TIS_COOKIE_STRING;
  const { manual, mode = "resume" } = args;
  const genericManuals: Manual[] = [];
  const rawManualIds = new Set(manual.map((m) => m.toUpperCase().trim()));

  // Print the cookie string for debug
  console.log("DEBUG: TIS_COOKIE_STRING =", cookieString);

  // --- Inject cookies into both HTTP and Playwright ---
  if (cookieString && cookieString.trim()) {
    // For HTTP (axios/tough-cookie)
    await injectCookiesToToughCookie(cookieString, jar, "techinfo.toyota.com");

    // For Playwright
    const browser = await chromium.launch({ headless: true });
    const context = await injectCookiesToPlaywright(browser, cookieString);

    // Use `context` for all Playwright page interactions
    // ... (rest of your logic, pass this context/page to wherever needed)
    // Don't forget to close context/browser when done
  }

  console.log("Parsing manual IDs...");
  rawManualIds.forEach((m) => {
    const id = m.includes("@") ? m.split("@")[0] : m;
    const year = m.includes("@") ? parseInt(m.split("@")[1]) : undefined;

    // --- Begin: Enhanced prefix check for EWD ---
    const prefix3 = m.slice(0, 3).toUpperCase();
    const prefix2 = m.slice(0, 2).toUpperCase();
    if (prefix3 === "EWD") {
      genericManuals.push({
        type: "em", // treat EWD-prefixed as EM
        id,
        year,
        raw: m,
      });
      return;
    }
    switch (prefix2) {
      case "EM":
      case "RM":
        // ... rest of your logic
        break;
      // ... etc
    }
  });

  // ... rest of your run logic
}

(async () => {
  const cliArgs = processCLIArgs();
  await run(cliArgs);
})();
