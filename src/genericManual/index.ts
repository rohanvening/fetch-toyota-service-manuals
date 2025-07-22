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
        // FINAL CORRECTED LOGIC
        // =================================================================
        // Step 1: Start the navigation but don't wait for it to finish.
        // This lets the script on the page start running.
        page.goto(htmlUrl, { waitUntil: "load", timeout: 60000 });

        // Step 2: Wait specifically for the URL to change to a PDF URL.
        // This is the most reliable way to handle a JS redirect.
        console.log(`   --> Waiting for redirect to PDF...`);
        await page.waitForURL('**/*.pdf', { timeout: 30000 });
        
        // Step 3: Once the wait is over, the current URL is the PDF URL.
        const pdfUrl = page.url();
        console.log(`   --> Redirected to PDF: ${pdfUrl}`);
        console.log(`   --> Downloading and saving to ${filePath}`);

        // Step 4: Use our axios client to download the PDF as a stream.
        const pdfStreamResponse = await client.get(pdfUrl, {
            responseType: 'stream',
        });

        // Step 5: Save the stream to a file.
        await saveStream(pdfStreamResponse.data, filePath);

        // Step 6: Get the file stats and log the size.
        const fileStats = await stat(filePath);
        const fileSizeInKB = Math.round(fileStats.size / 1024);
        console.log(`   --> Successfully saved ${sanitizedName}.pdf (${fileSizeInKB} KB)`);
        
        await page.waitForTimeout(1000); // Polite wait

      } catch (e) {
        const error = e as Error;
        console.error(`Error processing page ${name}: ${error.message}`);
        continue;
      }

      continue;
    }

    // This part handles nested directories in the table of contents
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
