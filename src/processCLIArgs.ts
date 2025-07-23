import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";

export interface CLIArgs {
  manual: string[];
  email?: string;
  password?: string;
  cookieString?: string;
  headed?: boolean;
  help?: boolean;
  mode?: "fresh" | "resume" | "overwrite"; // Add the new mode option
}

const sections = [
  {
    header: "Toyota/Lexus/Scion Workshop Manual Downloader",
    content:
      "Download the full workshop manual for your car. Must have a valid TIS subscription.",
  },
  {
    header: "Options",
    optionList: [
      {
        name: "manual",
        alias: "m",
        type: String,
        multiple: true,
        description:
          "Required. Manual ID(s) to download. Use multiple times for multiple manuals.\nFor non-electrical manuals, add @YEAR to the end to only download pages for that year.",
      },
      {
        name: "cookie-string",
        alias: "c",
        type: String,
        description:
          "Required. Your TIS cookie string. If you don't know what this is, don't use it.",
      },
      {
        name: "mode",
        type: String,
        description:
          "Download mode. Can be 'fresh', 'resume', or 'overwrite'. Defaults to 'resume'.",
      },
      {
        name: "headed",
        type: Boolean,
        description: "Run in headed mode (show the emulated browser).",
      },
      {
        name: "help",
        description: "Print this usage guide.",
      },
    ],
  },
];

const usage = commandLineUsage(sections);

const optionDefinitions = [
  { name: "manual", alias: "m", type: String, multiple: true },
  { name: "cookie-string", alias: "c", type: String },
  { name: "mode", type: String }, // Define the new mode argument
  { name: "headed", alias: "h", type: Boolean },
  { name: "help", type: Boolean },
];

export default function processCLIArgs(): CLIArgs {
  let args: CLIArgs;
  try {
    args = commandLineArgs(optionDefinitions) as CLIArgs;
  } catch (e: any) {
    console.log(e.message);
    console.log(usage);
    process.exit(1);
  }

  if (args.help || !args.manual) {
    console.log(usage);
    process.exit(0);
  }

  return args;
}
