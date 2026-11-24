// Copies the checked sync settings into the app before building.
import { writeFile } from "node:fs/promises";
import { config, privacyGate } from "../dev/config.mjs";
await privacyGate();
const { url, key } = await config();
await writeFile(new URL("src/config.gen.json", import.meta.url), JSON.stringify({ url, key }) + "\n");
