import { AxiosResponse } from "axios";
import { client } from "../api/client";
import { mkdir, writeFile, stat } from "fs/promises";
import { join } from "path";
import parseToC, { ParsedToC } from "./parseToC";
import { Page } from "playwright";
import { Manual } from "..";
import saveStream from "../api/saveStream";

// NEW: Define a type for our download statistics
export interface DownloadStats {
  downloaded: number;
  skipped: number;
  failed: number;
}

export default async function downloadGenericManual(
  page: Page,
  manualData: Manual,
  path: string,
  mode: "fresh" | "resume" | "overwrite"
): Promise<DownloadStats> { // Return the stats
  let tocReq: AxiosResponse;
  try {
    console.log("  - Downloading table of contents...");
    tocReq = await client({
      method: "GET",
      url: `${manualData.type}/${manualData.id}/toc.xml`,
      responseType: "text",
    });
  } catch (e: any) {
    if (e.response && e.response.status === 404) {
      throw new Error(`Manual ${manualData.id} doesn't exist.`);
    }
    const responseData = e.response?.data || "No response data available.";
    console.error("CRITICAL: Failed to download the Table of Contents. The server likely returned an HTML error page instead of XML.");
    console.error("--- Start of Server Response ---");
    console.log(responseData);
    console.error("--- End of Server Response ---");
    throw new Error(`Unknown error getting table of contents: ${e.message}`);
  }

  const files = parseToC(tocReq.data, manualData.year);
  await writeFile(join(path, "toc.json"), JSON.stringify(files, null, 2));

  console.log("  - Downloading all PDF files...");
  const stats = await recursivelyDownloadManual(page, path, files, mode);
  
  // Clear the final progress line
  process.stdout.write("\r" + " ".repeat(100) + "\r");
  
  return stats;
}

async function recursivelyDownloadManual(
  page: Page,
  path: string,
  toc: ParsedToC,
  mode: "fresh" | "resume" | "overwrite",
  stats: DownloadStats = { downloaded: 0, skipped: 0, failed: 0 } // Initialize stats
): Promise<DownloadStats> {
  const entries = Object.entries(toc);
  for (const [index, [name, value]] of entries.entries()) {
    if (typeof value === "string") {
      const sanitizedName = name.replace(/\//g, "-");
      const filePath = `${join(path, sanitizedName)}.pdf`;
      
      // =================================================================
      // NEW: Dynamic logging with process.stdout.write and carriage return
      // =================================================================
      const progress = `[${(index + 1).toString().padStart(3, ' ')}/${entries.length}]`;
      process.stdout.write(`\r    ${progress} Processing: ${sanitizedName}...`);

      if (mode === 'resume') {
          try {
              await stat(filePath);
              stats.skipped++;
              continue;
          } catch (e) {
              // File does not exist, so proceed with download.
          }
      }

      const htmlUrl = `https://techinfo.toyota.com${value}`;

      try {
        await page.goto(htmlUrl, { timeout: 60000 });
        const finalUrl = page.url();

        if (!finalUrl.includes('.pdf')) {
          throw new Error(`Page did not redirect to a PDF. Final URL: ${finalUrl}`);
        }
        
        const pdfStreamResponse = await client.get(finalUrl, {
            responseType: 'stream',
        });

        await saveStream(pdfStreamResponse.data, filePath);
        stats.downloaded++;

      } catch (e) {
        stats.failed++;
        // Clear the line and log the error on its own line
        process.stdout.write("\r" + " ".repeat(100) + "\r");
        console.error(`\n    ❌ Error processing page ${name}: ${(e as Error).message}`);
        continue;
      }
    } else {
        const newPath = join(path, name.replace(/\//g, "-"));
        try {
          await mkdir(newPath, { recursive: true });
        } catch (e) {
          if ((e as any).code !== "EEXIST") {
            console.log(`Could not create directory ${newPath}. Skipping section.`);
            continue;
          }
        }
        await recursivelyDownloadManual(page, newPath, value, mode, stats);
    }
  }
  return stats;
}
