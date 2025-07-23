import { AxiosResponse } from "axios";
import { client } from "../api/client";
import { mkdir, writeFile, stat } from "fs/promises";
import { join } from "path";
import parseToC, { ParsedToC } from "./parseToC";
import { Page } from "playwright";
import { Manual } from "..";
import saveStream from "../api/saveStream";

export default async function downloadGenericManual(
  page: Page,
  manualData: Manual,
  path: string,
  mode: "fresh" | "resume" | "overwrite",
  cookieString: string | undefined // Keep for PDF downloads
) {
  if (!cookieString) {
    throw new Error("Cannot download table of contents: Cookie string is missing.");
  }

  let tocContent: string;
  try {
    console.log("Downloading table of contents using authenticated browser...");
    // =================================================================
    // FIX: Use the authenticated Playwright page to fetch the XML
    // =================================================================
    const tocUrl = `https://techinfo.toyota.com/t3Portal/external/en/${manualData.type}/${manualData.id}/toc.xml`;
    const response = await page.goto(tocUrl);

    if (!response || !response.ok()) {
        throw new Error(`Failed to fetch toc.xml, status: ${response?.status()}`);
    }
    
    // Get the raw text content of the page, which is our XML
    tocContent = await response.text();

  } catch (e: any) {
    if (e.response && e.response.status === 404) {
      throw new Error(`Manual ${manualData.id} doesn't exist.`);
    }
    throw new Error(`Unknown error getting table of contents: ${e}`);
  }

  let files: ParsedToC;
  try {
    files = parseToC(tocContent, manualData.year);
  } catch (e) {
      console.error("CRITICAL: Failed to parse the Table of Contents. The server likely returned an HTML error page instead of XML.");
      console.error("--- Start of Server Response ---");
      console.log(tocContent);
      console.error("--- End of Server Response ---");
      throw e;
  }

  await writeFile(join(path, "toc.json"), JSON.stringify(files, null, 2));

  console.log("Downloading full manual...");
  await recursivelyDownloadManual(page, path, files, mode);
}

async function recursivelyDownloadManual(
  page: Page,
  path: string,
  toc: ParsedToC,
  mode: "fresh" | "resume" | "overwrite"
) {
  for (const [name, value] of Object.entries(toc)) {
    if (typeof value === "string") {
      const sanitizedName = name.replace(/\//g, "-");
      const filePath = `${join(path, sanitizedName)}.pdf`;
      
      if (mode === 'resume') {
          try {
              await stat(filePath);
              console.log(`Skipping existing file: ${sanitizedName}.pdf`);
              continue;
          } catch (e) {
              // File does not exist, so proceed with download.
          }
      }

      const htmlUrl = `https://techinfo.toyota.com${value}`;
      console.log(`Processing page ${sanitizedName}...`);

      try {
        await page.goto(htmlUrl, { timeout: 60000 });
        const finalUrl = page.url();

        if (!finalUrl.includes('.pdf')) {
          throw new Error(`Page did not redirect to a PDF. Final URL: ${finalUrl}`);
        }
        
        // Use the shared client for PDF downloads as it has the cookie jar populated
        const pdfStreamResponse = await client.get(finalUrl, {
            responseType: 'stream',
        });

        await saveStream(pdfStreamResponse.data, filePath);

        const fileStats = await stat(filePath);
        const fileSizeInKB = Math.round(fileStats.size / 1024);
        console.log(`   --> Successfully saved ${sanitizedName}.pdf (${fileSizeInKB} KB)`);
        
        await page.waitForTimeout(1000);

      } catch (e) {
        const error = e as Error;
        console.error(`Error processing page ${name}: ${error.message}`);
        continue;
      }
      continue;
    }

    const newPath = join(path, name.replace(/\//g, "-"));
    try {
      await mkdir(newPath, { recursive: true });
    } catch (e) {
      if ((e as any).code !== "EEXIST") {
        console.log(`Could not create directory ${newPath}. Skipping section.`);
        continue;
      }
    }
    await recursivelyDownloadManual(page, newPath, value, mode);
  }
}
