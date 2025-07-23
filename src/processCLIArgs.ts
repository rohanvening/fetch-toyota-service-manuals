import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";

export interface CLIArgs {
  manual: string[];
  headed?: boolean;
  help?: boolean;
  mode?: "fresh" | "resume" | "overwrite";
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
          "Required. Manual ID(s) to download. Use multiple times for multiple manuals.",
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
  { name: "mode", type: String },
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
