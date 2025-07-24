import { xml2js } from "xml-js";

// This is the structure of the parsed Table of Contents
export interface ParsedToC {
  [key: string]: ParsedToC | string;
}

// This interface matches the structure of the XML from the TIS website
interface TocElement {
  name: string;
  type: "element";
  elements?: TocElement[];
  attributes?: {
    id?: string;
    href?: string;
  };
}

/**
 * Recursively parses the XML structure from xml-js into our nested ParsedToC object.
 * @param element The current XML element to process.
 * @param year The optional model year to filter by.
 */
function recursiveParse(element: TocElement, year?: number): ParsedToC | string | null {
  // Base case: This is a link to a page
  if (element.attributes?.href) {
    const titleElement = element.elements?.find(e => e.name === 'title');
    if (titleElement) {
      const titleTextElement = titleElement.elements?.find(e => e.type === 'text');
      if (titleTextElement) {
        const title = ((titleTextElement as any).text || '').trim();
        // If a year is specified, only include pages that contain that year in their title
        if (year && !title.includes(String(year))) {
          return null; // Exclude this page
        }
        return element.attributes.href;
      }
    }
  }

  // Recursive step: This is a folder/category
  if (element.elements) {
    const result: ParsedToC = {};
    for (const child of element.elements) {
      if (child.name === 'title') continue; // Skip title elements of folders

      const titleElement = child.elements?.find(e => e.name === 'title');
      if (titleElement) {
        const titleTextElement = titleElement.elements?.find(e => e.type === 'text');
        if (titleTextElement) {
          const title = ((titleTextElement as any).text || '').trim();
          const parsedChild = recursiveParse(child, year);
          if (parsedChild && Object.keys(parsedChild).length > 0) { // Only add if it's not null or empty
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
  const parsed = xml2js(xml, { compact: false }) as TocElement;
  const root = parsed.elements?.find(e => e.name === 'toc');
  if (!root) {
    throw new Error("Could not find root <toc> element in XML.");
  }

  const result = recursiveParse(root, year);
  return result as ParsedToC;
}
