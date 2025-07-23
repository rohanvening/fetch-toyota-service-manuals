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
        console.log(`   --> Navigating to ${htmlUrl}`);
        await page.goto(htmlUrl, { timeout: 60000 });
        
        const finalUrl = page.url();
        console.log(`   --> Navigation complete. Final URL is: ${finalUrl}`);

        // =================================================================
        // FIX: Change '.endsWith' to '.includes' to handle query parameters
        // =================================================================
        if (!finalUrl.includes('.pdf')) {
          throw new Error(`Page did not redirect to a PDF. Final URL: ${finalUrl}`);
        }
        
        console.log(`   --> Downloading and saving to ${filePath}`);
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
        
        const screenshotPath = `error-${sanitizedName.substring(0, 50)}-${Date.now()}.png`;
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot saved to ${screenshotPath}. Continuing...`);
        } catch (screenshotError) {
            console.error("Failed to take screenshot.", screenshotError);
        }
        
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
