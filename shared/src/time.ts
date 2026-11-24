import { spec } from "./score.ts";
const two = (n: number) => String(n).padStart(2, "0");

/** 00:30 belongs to the night that began the previous evening, so a day starts at 04:00 local. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  if (d.getHours() < spec.dayStartHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function dayStart(ms: number): number {
  const d = new Date(ms);
  if (d.getHours() < spec.dayStartHour) d.setDate(d.getDate() - 1);
  d.setHours(spec.dayStartHour, 0, 0, 0);
  return d.getTime();
}
