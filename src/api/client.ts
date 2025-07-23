import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import https from "https"; // Import the 'https' module

export const jar = new CookieJar();

export const client = wrapper(
  axios.create({
    jar,
    baseURL: "https://techinfo.toyota.com/t3Portal/external/en/",
    // Add an httpsAgent to ignore SSL certificate errors
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
      Accept: "text/html, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.05",
      "Accept-Encoding": "gzip, deflate, br",
      Origin: "https://techinfo.toyota.com",
      Connection: "keep-alive",
      Referer: "https://techinfo.toyota.com/",
    },
  })
);
