import { createWriteStream } from "fs";

export default function saveStream(stream: any, path: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const writer = createWriteStream(path);
    stream.pipe(writer);

    let error: Error | null = null;

    writer.on("error", (err) => {
      error = err;
      writer.close();
      reject(err);
    });

    writer.on("close", () => {
      if (!error) {
        resolve();
      }
    });
  });
}
