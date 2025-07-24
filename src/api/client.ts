import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

export const jar = new CookieJar();

// Reverted to the original version without the incompatible httpsAgent
export const client = wrapper(
  axios.create({
    jar,
    baseURL: "https://techinfo.toyota.com/t3Portal/external/en/",
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
