import { AxiosResponse } from "axios";
import { client } from "../api/client";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import parseToC, { ParsedToC } from "./parseToC";
import { Page } from "playwright";
import { Manual } from "..";

export default async function downloadGenericManual(
  page: Page,
  manualData: Manual,
  path: string
) {
  // We only need to inspect the first page for this diagnostic.
  const firstPageUrl = `https://techinfo.toyota.com/t3Portal/document/rm/${manualData.id}/xhtml/${manualData.id}_0001.html`;

  console.log("================================================================");
  console.log("            RUNNING FRAME INSPECTOR DIAGNOSTIC");
  console.log("================================================================");
  console.log(`Navigating to the first page: ${firstPageUrl}`);

  try {
    await page.goto(firstPageUrl, {
      timeout: 90000,
      waitUntil: "networkidle",
    });

    console.log("\nPage navigation complete. Inspecting frames...");

    const allFrames = page.frames();

    if (allFrames.length <= 1) {
      console.log("DIAGNOSTIC RESULT: No frames found on the page.");
      console.log("This means the content is likely on the main page itself.");
    } else {
      console.log(`DIAGNOSTIC RESULT: Found ${allFrames.length} total frames.`);
      for (const frame of allFrames) {
        // The main page is a frame with no parent.
        if (frame.parentFrame() === null) {
          console.log(`  - Main Page (URL: ${frame.url()})`);
        } else {
          // This is a child frame.
          console.log(`  - Child Frame (Name: '${frame.name()}', URL: ${frame.url()})`);
        }
      }
    }

    console.log("\nDumping page's outer HTML to see the <frame> or <iframe> tags:");
    console.log("----------------------------------------------------------------");
    // Get the HTML content of the page that defines the frameset
    const pageHtml = await page.content();
    console.log(pageHtml);
    console.log("----------------------------------------------------------------");


  } catch (e) {
    const error = e as Error;
    console.error(`An error occurred during the diagnostic run: ${error.message}`);
    await page.screenshot({ path: "diagnostic-error.png", fullPage: true });
    console.log("Saved screenshot to diagnostic-error.png");
  }
  
  console.log("\nDiagnostic run complete. Please copy the output above.");
  // We will exit gracefully after the diagnostic.
}

// This function is not used in the diagnostic script, but needs to exist.
async function recursivelyDownloadManual(
  page: Page,
  path: string,
  toc: ParsedToC
) {
  // Intentionally empty for diagnostics
}
