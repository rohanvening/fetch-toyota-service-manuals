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
  path: string
) {
  // Download and parse the Table of Contents XML
  let tocReq: AxiosResponse;
  try {
    console.log("Downloading table of contents...");
    tocReq = await client({
      method: "GET",
      url: `${manualData.type}/${manualData.id}/toc.xml`,
      responseType: "text",
    });
  } catch (e: any) {
    if (e.response && e.response.status === 404) {
      throw new Error(`Manual ${manualData.id} doesn't exist.`);
    }
    throw new Error(`Unknown error getting table of contents: ${e}`);
  }

  const files = parseToC(tocReq.data, manualData.year);

  // Save the parsed table of contents to disk
  console.log("Saving table of contents...");
  await writeFile(join(path, "toc.json"), JSON.stringify(files, null, 2));

  console.log("Downloading full manual...");
  await recursivelyDownloadManual(page, path, files);
}

async function recursivelyDownloadManual(
  page: Page,
  path: string,
  toc: ParsedToC
) {
  for (const [name, value] of Object.entries(toc)) {
    if (typeof value === "string") {
      const sanitizedName = name.replace(/\//g, "-");
      const filePath = `${join(path, sanitizedName)}.pdf`;
      const htmlUrl = `https://techinfo.toyota.com${value}`;
      
      console.log(`Processing page ${sanitizedName}...`);

      try {
        // =================================================================
        // CORRECTED: Set waitUntil to 'commit' to handle the redirect page.
        // =================================================================
        const response = await page.goto(htmlUrl, {
          timeout: 60000,
          waitUntil: "commit", // This is the key change!
        });

        if (!response) {
            console.log(`Could not get a response for ${name}. Skipping.`);
            continue;
        }

        const pdfUrl = response.url();

        if (!pdfUrl.endsWith('.pdf')) {
            console.log(`Page ${name} did not redirect to a PDF. Final URL: ${pdfUrl}. Skipping.`);
            continue;
        }
        
        console.log(`   --> Redirected to PDF: ${pdfUrl}`);
        console.log(`   --> Downloading and saving to ${filePath}`);

        const pdfStreamResponse = await client.get(pdfUrl, {
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
    await recursivelyDownloadManual(page, newPath, value);
  }
}
