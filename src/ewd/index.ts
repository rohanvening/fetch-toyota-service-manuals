import { join } from "path";
import { mkdir, writeFile, stat } from "fs/promises";
import { client } from "../api/client";
import { AxiosResponse } from "axios";
import parseTitle from "./parseTitle";
import saveStream from "../api/saveStream";
import { Manual } from "..";
import { Page } from "playwright";
import { DownloadStats } from "../genericManual";
import { shutdownManager } from "../state";

// This function has been updated to match the new structure and return download stats.
export default async function downloadEWD(
  page: Page, // Although unused here, it's kept for consistency
  manualData: Manual,
  path: string,
  mode: "fresh" | "resume" | "overwrite"
): Promise<DownloadStats> {
  const parts = ["system", "routing", "overall"];
  const stats: DownloadStats = { downloaded: 0, skipped: 0, failed: 0 };

  for (const part of parts) {
    if (shutdownManager.isShuttingDown) break;
    console.log(`  - Processing EWD part: ${part}...`);
    const partPath = join(path, part);

    try {
      await mkdir(partPath, { recursive: true });
    } catch (e: any) {
      if (e.code !== "EEXIST") {
        throw new Error(`Error creating directory ${path}: ${e}`);
      }
    }

    let titleReq: AxiosResponse;
    try {
      titleReq = await client({
        method: "GET",
        url: `ewdappu/${manualData.id}/ewd/contents/${part}/title.xml`,
        responseType: "text",
      });
    } catch (e: any) {
      if (e.response && e.response.status === 404) {
        console.error(`\x1b[31m❌ EWD part '${part}' for manual ${manualData.id} doesn't appear to exist. Skipping.\x1b[0m`);
        continue;
      }
      throw new Error(`Unknown error getting title XML for EWD ${manualData.id}: ${e}`);
    }

    if (typeof titleReq.data === "string" && /<html/i.test(titleReq.data)) {
        console.error(`\x1b[31m❌ Received HTML instead of XML for EWD part '${part}'. This usually means the session is invalid. Skipping part.\x1b[0m`);
        continue;
    }

    const files = await parseTitle(titleReq.data);
    await writeFile(join(partPath, "title.json"), JSON.stringify(files, null, 2));

    const fileEntries = Object.entries(files);
    for (const [index, [fileName, filePath]] of fileEntries.entries()) {
        if (shutdownManager.isShuttingDown) break;

        const fileExt = filePath.split(".").pop() || 'dat';
        const fullFilePath = join(partPath, `${fileName}.${fileExt}`);
        const progress = `[${(index + 1).toString().padStart(2, ' ')}/${fileEntries.length}]`;

        if (mode === 'resume') {
            try {
                const fileStats = await stat(fullFilePath);
                if (fileStats.size > 1024) { // Skip if > 1KB
                    console.log(`\x1b[33m${progress} ⏩ Skipping existing EWD file: ${fileName}.${fileExt}\x1b[0m`);
                    stats.skipped++;
                    continue;
                }
            } catch {}
        }

        console.log(`${progress} Processing EWD file: ${fileName}.${fileExt}...`);
        const isPdf = fileExt === "pdf";
        const fileUrl = `ewdappu/${manualData.id}/ewd/contents/${part}/${isPdf ? "pdf" : "fig"}/${filePath}`;

        try {
            const fileReq = await client({
                method: "GET",
                url: fileUrl,
                responseType: isPdf ? "stream" : "text",
            });
            
            if (isPdf) {
                await saveStream(fileReq.data, fullFilePath);
            } else {
                await writeFile(fullFilePath, fileReq.data);
            }

            const fileStats = await stat(fullFilePath);
            const fileSizeInKB = Math.round(fileStats.size / 1024);
            console.log(`\x1b[32m${progress} ✅ Saved ${fileName}.${fileExt} (${fileSizeInKB} KB)\x1b[0m`);
            stats.downloaded++;
        } catch(e) {
            stats.failed++;
            console.error(`\x1b[31m${progress} ❌ Error processing EWD file ${fileName}: ${(e as Error).message}\x1b[0m`);
        }
    }
  }
  return stats;
}
