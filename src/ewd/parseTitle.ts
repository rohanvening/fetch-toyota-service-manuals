import { xml2js } from "xml-js";

// This is the structure of the parsed EWD title file
export interface ParsedTitle {
  [key: string]: string;
}

// This interface matches the structure of the EWD XML
interface TitleElement {
  name: string;
  type: "element";
  elements?: TitleElement[];
  attributes?: {
    code?: string;
    fig?: string;
  };
}

/**
 * Parses the raw title.xml string from an EWD into a simple key-value object.
 * @param xml The raw XML string from the TIS website.
 */
export default async function parseTitle(xml: string): Promise<ParsedTitle> {
  const parsed = xml2js(xml, { compact: false }) as TitleElement;
  const root = parsed.elements?.find(e => e.name === 'title');
  if (!root || !root.elements) {
    throw new Error("Could not find root <title> element in XML.");
  }

  const files: ParsedTitle = {};

  // EWD title files have a flat structure
  for (const element of root.elements) {
    if (element.name === 'fig' && element.attributes?.code && element.attributes?.fig) {
      const name = element.attributes.code;
      const path = element.attributes.fig;
      files[name] = path;
    }
  }

  return files;
}
