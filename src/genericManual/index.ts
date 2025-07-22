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
// This is the updated function with more robust download logic
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
        // Navigate with a longer timeout and wait for network to be idle
        await page.goto(`https://techinfo.toyota.com${value}`, {
          timeout: 90000, // 90-second timeout
          waitUntil: "networkidle", // Wait until network activity has ceased
        });

        // Optional: Try to remove any floating footers/headers that might block content
        await page.evaluate(() => {
            const footer = document.querySelector(".footer");
            if (footer) footer.remove();
        }).catch(() => console.log("Could not remove footer, continuing..."));

        // Create the PDF
        await page.pdf({
          path: sanitizedPath,
          margin: { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" },
          format: "A4",
        });

        // Add a small polite wait to avoid overwhelming their servers
        await page.waitForTimeout(1500);

      } catch (e) {
        const error = e as Error;
        console.error(`Error saving page ${name}: ${error.message}`);
        
        // Take a screenshot so we can see what the page looked like when it failed
        await page.screenshot({ path: `error-${sanitizedName}-${Date.now()}.png`, fullPage: true });
        
        console.log(`Screenshot saved for ${name}. Continuing to next page.`);
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
