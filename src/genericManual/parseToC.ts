import { xml2js, Element } from "xml-js";

// This is the structure of the parsed Table of Contents
export interface ParsedToC {
  [key: string]: ParsedToC | string;
}

/**
 * Recursively parses the XML structure from xml-js into our nested ParsedToC object.
 * @param element The current XML element to process.
 * @param year The optional model year to filter by.
 */
function recursiveParse(element: Element, year?: number): ParsedToC | string | null {
  // Base case: This is a link to a page
  if (element.attributes?.href) {
    const titleElement = element.elements?.find(e => e.name === 'title');
    if (titleElement && titleElement.elements) {
      // Find the text node within the <title> element
      const titleTextElement = titleElement.elements.find(e => e.type === 'text');
      if (titleTextElement && titleTextElement.text) {
        const title = (titleTextElement.text as string).trim();
        // If a year is specified, only include pages that contain that year in their title
        if (year && !title.includes(String(year))) {
          return null; // Exclude this page
        }
        return element.attributes.href as string;
      }
    }
  }

  // Recursive step: This is a folder/category
  if (element.elements) {
    const result: ParsedToC = {};
    for (const child of element.elements) {
      if (child.type !== 'element' || child.name === 'title') continue; // Skip non-elements and title elements of folders

      const titleElement = child.elements?.find(e => e.name === 'title');
      if (titleElement && titleElement.elements) {
        const titleTextElement = titleElement.elements.find(e => e.type === 'text');
        if (titleTextElement && titleTextElement.text) {
          const title = (titleTextElement.text as string).trim();
          const parsedChild = recursiveParse(child, year);
          // Only add if it's not null or an empty object
          if (parsedChild && (typeof parsedChild === 'string' || Object.keys(parsedChild).length > 0)) {
            result[title] = parsedChild as ParsedToC | string;
          }
        }
      }
    }
    // If after filtering, the folder is empty, return null so it gets excluded
    return Object.keys(result).length > 0 ? result : null;
  }

  return null;
}


/**
 * Parses the raw toc.xml string into a structured JSON object.
 * @param xml The raw XML string from the TIS website.
 * @param year An optional model year to filter the results by.
 */
export default function parseToC(xml: string, year?: number): ParsedToC {
  const parsed = xml2js(xml, { compact: false }) as Element;
  const root = parsed.elements?.find(e => e.name === 'toc');
  if (!root) {
    throw new Error("Could not find root <toc> element in XML.");
  }

  const result = recursiveParse(root, year);
  return result as ParsedToC;
}
