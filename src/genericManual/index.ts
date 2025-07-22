import { AxiosResponse } from "axios";
import { client } from "../api/client";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import parseToC, { ParsedToC } from "./parseToC";
import { Page } from "playwright";
import { Manual } from "..";

export default async function downloadGenericManual(
  page: Page,
  manualData: Manual,
  path: string
) {
  // download ToC
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
      throw new Error(
        `Manual ${manualData.id} doesn't appear to exist-- are you sure the ID is right?`
      );
    }
    throw new Error(
      `Unknown error getting title XML for manual ${manualData.raw}: ${e}`
    );
  }

  const files = parseToC(tocReq.data, manualData.year);

  // write to disk
  console.log("Saving table of contents...");
  await Promise.all([
    writeFile(join(path, "toc-full.xml"), tocReq.data),
    writeFile(
      join(path, "toc-downloaded.json"),
      JSON.stringify(files, null, 2)
    ),
    writeFile(
      join(path, "toc.js"),
      `document.toc = JSON.parse(\`${JSON.stringify(files).replaceAll(
        '\\"',
        ""
      )}\`);`
    ),
  ]);

  console.log("Downloading full manual...");
  await recursivelyDownloadManual(page, path, files);
}

// =================================================================
// This is the updated function with intelligent waiting
// =================================================================
async function recursivelyDownloadManual(
  page: Page,
  path: string,
  toc: ParsedToC
) {
  const exploded = Object.entries(toc);

  for (const explIdx in exploded) {
    const [name, value] = exploded[explIdx];

    if (typeof value === "string") {
      const sanitizedName = name.replace(/\//g, "-");
      const sanitizedPath = `${join(path, sanitizedName)}.pdf`;
      console.log(`Downloading page ${sanitizedName}...`);

      try {
        // Navigate with a long timeout
        await page.goto(`https://techinfo.toyota.com${value}`, {
          timeout: 90000,
          waitUntil: "networkidle",
        });

        // =================================================================
        // NEW: Wait for a specific element that indicates content has loaded.
        // The content appears to be in a frame named 'main_frame'.
        // =================================================================
        console.log("Waiting for the main content frame ('main_frame')...");
        const contentFrame = page.frame("main_frame");
        if (!contentFrame) {
            throw new Error("Could not find the 'main_frame' where content is located.");
        }

        // Now, within that frame, wait for a content element to be visible.
        // A common element is a div with class 'sect'.
        console.log("Waiting for content element '.sect' to be visible in frame...");
        await contentFrame.waitForSelector(".sect", { state: 'visible', timeout: 15000 });
        console.log("Content element found. Preparing to generate PDF.");

        // Take a debug screenshot to see what the page looks like.
        const debugScreenshotPath = `debug-${sanitizedName.substring(0, 50)}.png`;
        await page.screenshot({ path: debugScreenshotPath, fullPage: true });
        console.log(`Debug screenshot saved to ${debugScreenshotPath}`);

        // Generate the PDF from the content frame only
        await contentFrame.page().pdf({
          path: sanitizedPath,
          margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
          format: "A4",
          printBackground: true, // Helps with rendering CSS backgrounds
        });

        console.log(`Successfully saved PDF to ${sanitizedPath}`);
        // Add a small polite wait
        await page.waitForTimeout(1000);

      } catch (e) {
        const error = e as Error;
        console.error(`Error saving page ${name}: ${error.message}`);
        
        const errorScreenshotPath = `error-${sanitizedName.substring(0, 50)}-${Date.now()}.png`;
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
        
        console.log(`Error screenshot saved to ${errorScreenshotPath}. Continuing...`);
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
