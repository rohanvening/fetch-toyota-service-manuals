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
  type: "em" | "rm" | "bm";
  id: string;
  year?: number;
  raw: string;
}

interface ExtendedCLIArgs extends CLIArgs {
  mode?: "fresh" | "resume" | "overwrite";
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
  let browser: Browser | null = null;
  let context: any = null;
  if (cookieString && cookieString.trim()) {
    // For HTTP (axios/tough-cookie)
    await injectCookiesToToughCookie(cookieString, jar, "techinfo.toyota.com");

    // For Playwright
    browser = await chromium.launch({ headless: true });
    context = await injectCookiesToPlaywright(browser, cookieString);
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
      case "BM":
        genericManuals.push({
          type: prefix2.toLowerCase() as "em" | "rm" | "bm",
          id,
          year,
          raw: m,
        });
        return;
      default:
        console.error(
          `Invalid manual ${m}: manual IDs must start with EWD, EM, RM, or BM.`
        );
        process.exit(1);
    }
    // --- End: Enhanced prefix check for EWD ---
  });

  let dirPaths: { [manualId: string]: string } = Object.fromEntries(
    genericManuals.map((m) => [m.id, resolve(join(".", "manuals", m.raw))])
  );

  if (mode === "fresh") {
    console.log("Mode: Fresh Download. Creating versioned folders...");
    const datePrefix = new Date().toISOString().split("T")[0];

    const versionedDirPaths: { [manualId: string]: string } = {};
    for (const m of genericManuals) {
      let versionedPath = resolve(
        join(".", "manuals", `${datePrefix}_${m.raw}`)
      );
      let counter = 1;
      while (true) {
        try {
          await stat(versionedPath);
          versionedPath = resolve(
            join(
              ".",
              "manuals",
              `${datePrefix}_${m.raw}_(${++counter})`
            )
          );
        } catch (e) {
          break;
        }
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
    const accessorHTML = await readFile(
      join(__dirname, "..", "accessor/index.html"),
      "utf-8"
    );
    await Promise.all(
      Object.values(dirPaths).map((m) =>
        writeFile(join(m, "index.html"), accessorHTML)
      )
    );
  } catch (e) {
    console.error("Failed to copy accessor/index.html:", e);
  }

  // --- Begin: Download logic, no features lost ---
  try {
    for (const manual of genericManuals) {
      const manualDir = dirPaths[manual.id];
      if (manual.type === "em") {
        // Both EM and EWD types routed here!
        console.log(`Downloading EWD manual: ${manual.raw}`);
        await downloadEWD(manual, manualDir);
      } else {
        // RM and BM go here
        console.log(
          `Downloading ${manual.type.toUpperCase()} manual: ${manual.raw}`
        );
        if (!context) {
          if (!browser) browser = await chromium.launch({ headless: true });
          context = await browser.newContext();
        }
        const page = await context.newPage();
        await downloadGenericManual(page, manual, manualDir, mode);
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
  }
  // --- End: Download logic, no features lost ---
}

(async () => {
  const cliArgs = processCLIArgs();
  await run(cliArgs);
})();
