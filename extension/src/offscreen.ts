import { judge, type Reading } from "@mirror/shared";
import { burst, explain, openCamera } from "./camera.ts";
import { $ } from "./dom.ts";
import { send } from "./store.ts";

// This page exists for one burst. The background passes the baseline in the address and closes it after.
let reading: Reading | null = null, error = "";
try {
  const close = await openCamera($<HTMLVideoElement>("v"));
  try { reading = judge(await burst($<HTMLVideoElement>("v")), JSON.parse(decodeURIComponent(location.hash.slice(1)))); } finally { close(); }
} catch (e) { error = explain(e); }
await send({ cmd: "reading", reading, error });
