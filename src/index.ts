import { join, resolve } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import parseToC, { ParsedToC } from "./parseToC";
import { client } from "../api/client";
import { Manual } from "../index";

interface DownloadStats {
  downloaded: number;
  skipped: number;
  failed: number;
}

async function downloadFile(url: string, outputPath: string): Promise<boolean> {
  try {
    const response = await client.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
    });
    await writeFile(outputPath, Buffer.from(response.data));
    return true;
  } catch (e) {
    console.warn("Failed to download:", url);
    return false;
  }
}

function buildFilePath(base: string, sectionPath: string, name: string): string {
  const cleanedPath = sectionPath.replace(/[^\w\d\-\s\/]/g, "").replace(/\s+/g, " ");
  const fileName = name.replace(/\//g, "-").replace(/:/g, "-") + ".pdf";
  return join(base, cleanedPath, fileName);
}

function extractPdfPath(href: string): string {
  const segments = href.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last.replace(".html", ".pdf");
}

async function recursiveDownload(
  node: ParsedToC,
  basePath: string,
  currentPath: string,
  manualId: string
): Promise<DownloadStats> {
  let stats: DownloadStats = { downloaded: 0, skipped: 0, failed: 0 };
  for (const [section, content] of Object.entries(node)) {
    if (typeof content === "string") {
      const filePath = buildFilePath(basePath, currentPath, section);
      const href = content;
      const pdfPath = extractPdfPath(href);
      const pdfUrl = `https://techinfo.toyota.com${href.replace(
        /\/t3Portal\/document\/rm\/${manualId}\/xhtml\/[^/]+\.html$/,
        "/pdf/" + pdfPath
      )}`;

      try {
        await mkdir(resolve(filePath, ".."), { recursive: true });
        const alreadyExists = await readFile(filePath).then(() => true).catch(() => false);
        if (alreadyExists) {
          stats.skipped++;
          continue;
        }
        const success = await downloadFile(pdfUrl, filePath);
        if (success) stats.downloaded++;
        else stats.failed++;
      } catch (e) {
        console.error("Error creating or writing file", filePath, e);
        stats.failed++;
      }
    } else {
      const nested = await recursiveDownload(content, basePath, join(currentPath, section), manualId);
      stats.downloaded += nested.downloaded;
      stats.skipped += nested.skipped;
      stats.failed += nested.failed;
    }
  }
  return stats;
}

export default async function downloadGenericManual(
  page: any,
  manual: Manual,
  dirPath: string,
  mode: "fresh" | "resume" | "overwrite"
): Promise<DownloadStats> {
  try {
    console.log("Fetching toc.xml...");
    const tocUrl = `https://techinfo.toyota.com/t3Portal/document/rm/${manual.id}/toc.xml`;
    const response = await client.get(tocUrl);
    const tocXml = response.data;

    console.log("Parsing toc.xml...");
    const parsed: ParsedToC = await parseToC(tocXml);
    const jsonOutPath = join(dirPath, "toc.json");
    await writeFile(jsonOutPath, JSON.stringify(parsed, null, 2));

    console.log("Starting recursive PDF download...");
    const stats = await recursiveDownload(parsed, dirPath, "", manual.id);
    return stats;
  } catch (e) {
    console.error("Error downloading manual:", manual.raw, e);
    return { downloaded: 0, skipped: 0, failed: 1 };
  }
}
