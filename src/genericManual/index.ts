import axios, { AxiosResponse } from "axios";
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
  cookieString: string | undefined // Accept the cookie string
) {
  if (!cookieString) {
    throw new Error("Cannot download table of contents: Cookie string is missing.");
  }

  let tocReq: AxiosResponse;
  try {
    console.log("Downloading table of contents...");
    // =================================================================
    // FIX: Use a direct axios call with a full set of browser headers
    // =================================================================
    tocReq = await axios.get(
      `https://techinfo.toyota.com/t3Portal/external/en/${manualData.type}/${manualData.id}/toc.xml`,
      {
        responseType: "text",
        headers: {
          Cookie: cookieString,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
          "Accept-Language": "en-US,en;q=0.9",
          "Connection": "keep-alive",
          "Referer": "https://techinfo.toyota.com/",
        },
      }
    );
  } catch (e: any) {
    if (e.response && e.response.status === 404) {
      throw new Error(`Manual ${manualData.id} doesn't exist.`);
    }
    throw new Error(`Unknown error getting table of contents: ${e}`);
  }

  const files = parseToC(tocReq.data, manualData.year);
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
