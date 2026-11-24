import { eye, setEye } from "../../ui/eye.ts";
/** A night as an eye: shut at eight hours of sleep, wide open and wired at five or less. */
export function nightEye(sleepMin: number | null): SVGSVGElement {
  const e = eye({ lid: "#f0699f" }), awake = sleepMin === null ? 0 : Math.min(1, Math.max(0, (480 - sleepMin) / 180));
  if (sleepMin === null) e.classList.add("unknown");
  setEye(e, 1 - awake, Math.max(0, (awake - 0.45) * 1.8));
  return e;
}
export const hours = (m: number | null): string => (m === null ? "no record" : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`);
