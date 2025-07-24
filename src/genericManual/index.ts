import { AxiosResponse } from "axios";
import { client } from "../api/client";
import { mkdir, writeFile, stat } from "fs/promises";
import { join } from "path";
import parseToC, { ParsedToC } from "./parseToC";
import { Page } from "playwright";
import { Manual } from "..";
import saveStream from "../api/saveStream";
import { shutdownManager } from "../state";

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
): Promise<DownloadStats> {
  let tocReq: AxiosResponse;
  try {
    console.log("  - Downloading table of contents...");
    // This uses the shared axios client, which has been populated with the correct cookies
    tocReq = await client({
      method: "GET",
      url: `${manualData.type}/${manualData.id}/toc.xml`,
      responseType: "text",
    });
  } catch (e: any) {
    if (shutdownManager.isShuttingDown) return { downloaded: 0, skipped: 0, failed: 0 };
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
  // Create the toc.js file needed by the interactive viewer
  await writeFile(join(path, "toc.js"), `document.toc = ${JSON.stringify(files, null, 2)};`);

  console.log("  - Downloading all PDF files...");
  const stats = await recursivelyDownloadManual(page, path, files, mode);
  
  return stats;
}

async function recursivelyDownloadManual(
  page: Page,
  path: string,
  toc: ParsedToC,
  mode: "fresh" | "resume" | "overwrite",
  stats: DownloadStats = { downloaded: 0, skipped: 0, failed: 0 }
): Promise<DownloadStats> {
  const entries = Object.entries(toc);
  for (const [index, [name, value]] of entries.entries()) {
    if (shutdownManager.isShuttingDown) break;

    if (typeof value === "string") {
      const sanitizedName = name.replace(/\//g, "-");
      const filePath = `${join(path, sanitizedName)}.pdf`;
      
      const progress = `[${(index + 1).toString().padStart(3, ' ')}/${entries.length}]`;
      
      if (mode === 'resume') {
          try {
              const fileStats = await stat(filePath);
              if (fileStats.size > 15 * 1024) {
                console.log(`\x1b[33m${progress} ⏩ Skipping existing file: ${sanitizedName}.pdf\x1b[0m`);
                stats.skipped++;
                continue;
              }
          } catch (e) {
              // File does not exist, so proceed with download.
          }
      }

      console.log(`${progress} Processing: ${sanitizedName}...`);
      const htmlUrl = `https://techinfo.toyota.com${value}`;

      try {
        await page.goto(htmlUrl, { timeout: 60000 });
        const finalUrl = page.url();

        if (!finalUrl.includes('.pdf')) {
          throw new Error(`Page did not redirect to a PDF. Final URL: ${finalUrl}`);
        }
        
        // This uses the shared axios client, which has the correct cookies
        const pdfStreamResponse = await client.get(finalUrl, {
            responseType: 'stream',
        });

        await saveStream(pdfStreamResponse.data, filePath);

        const fileStats = await stat(filePath);
        const fileSizeInKB = Math.round(fileStats.size / 1024);
        
        if (fileStats.size < 1) {
            stats.failed++;
            console.error(`\x1b[31m${progress} ❌ Error processing page ${name}: Downloaded file is empty (0 KB).\x1b[0m`);
            continue;
        }

        console.log(`\x1b[32m${progress} ✅ Successfully saved ${sanitizedName}.pdf (${fileSizeInKB} KB)\x1b[0m`);

        stats.downloaded++;

      } catch (e) {
        if (shutdownManager.isShuttingDown) break;
        stats.failed++;
        console.error(`\x1b[31m${progress} ❌ Error processing page ${name}: ${(e as Error).message}\x1b[0m`);
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
