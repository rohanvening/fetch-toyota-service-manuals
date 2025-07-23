import { AxiosResponse } from "axios";
import { client } from "../api/client";
import { mkdir, writeFile, stat } from "fs/promises";
import { join } from "path";
import parseToC, { ParsedToC } from "./parseToC";
import { Page } from "playwright";
import { Manual } from "..";

/**
 * Sanitizes a string to make it safe for use as a Windows-compatible filename.
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

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
    if (typeof value === "string") {
      const sanitizedName = sanitizeFileName(name);
      const filePath = `${join(path, sanitizedName)}.pdf`;
      const progress = `[${(index + 1).toString().padStart(3, ' ')}/${entries.length}]`;

      if (mode === 'resume') {
        try {
          const fileStats = await stat(filePath);
          const fileSizeInKB = Math.round(fileStats.size / 1024);

          if (fileSizeInKB > 15) {
            console.log(`\x1b[33m${progress} ⏩ Skipping existing file: ${sanitizedName}.pdf (${fileSizeInKB} KB)\x1b[0m`);
            stats.skipped++;
            continue;
          } else {
            console.log(`\x1b[36m${progress} ⚠️  Found small file (${fileSizeInKB} KB). Re-downloading ${sanitizedName}.pdf...\x1b[0m`);
          }
        } catch {
          // File does not exist — will proceed to download
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

        const pdfArrayBuffer = await page.evaluate(async (url) => {
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          return Array.from(new Uint8Array(buffer));
        }, finalUrl);

        if (!pdfArrayBuffer || pdfArrayBuffer.length === 0) {
          throw new Error("Downloaded PDF buffer was empty.");
        }

        const pdfBuffer = Buffer.from(pdfArrayBuffer);
        await writeFile(filePath, pdfBuffer);

        const fileStats = await stat(filePath);
        const fileSizeInKB = Math.round(fileStats.size / 1024);

        if (fileStats.size < 1) {
          stats.failed++;
          console.error(`\x1b[31m${progress} ❌ Error: Downloaded file is empty (0 KB).\x1b[0m`);
          continue;
        }

        console.log(`\x1b[32m${progress} ✅ Saved ${sanitizedName}.pdf (${fileSizeInKB} KB)\x1b[0m`);
        stats.downloaded++;

      } catch (e) {
        stats.failed++;
        console.error(`\x1b[31m${progress} ❌ Error processing ${name}: ${(e as Error).message}\x1b[0m`);
        continue;
      }

    } else {
      const sanitizedFolder = sanitizeFileName(name);
      const newPath = join(path, sanitizedFolder);

      try {
        await mkdir(newPath, { recursive: true });
      } catch (e: any) {
        if (e.code !== "EEXIST") {
          console.log(`Could not create directory ${newPath}. Skipping section.`);
          continue;
        }
      }

      await recursivelyDownloadManual(page, newPath, value, mode, stats);
    }
  }
  return stats;
}
