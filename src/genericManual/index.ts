import { AxiosResponse } from "axios";
import { client } from "../api/client";
import { mkdir, writeFile, stat } from "fs/promises";
import { join } from "path";
import parseToC, { ParsedToC } from "./parseToC";
import { Page } from "playwright";
import { Manual } from "..";
import saveStream from "../api/saveStream";

// This 'export default' is the critical line that fixes the error.
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
        await page.goto(htmlUrl, { timeout: 60000 });
        
        const finalUrl = page.url();
        console.log(`   --> Navigation complete. Final URL is: ${finalUrl}`);

        if (!finalUrl.endsWith('.pdf')) {
          throw new Error(`Page did not redirect to a PDF. Final URL: ${finalUrl}`);
        }
        
        console.log(`   --> Downloading and saving to ${filePath}`);
        const pdfStreamResponse = await client.get(finalUrl, {
            responseType: 'stream',
        });
