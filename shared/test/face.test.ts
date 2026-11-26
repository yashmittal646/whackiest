import test from "node:test";
import assert from "node:assert/strict";
import { describe as words, faceFrame, faceState, type FaceFrame, type Point } from "@mirror/shared";

const lm = (turn = 0.5, dy = 0): Point[] => {
  const p: Point[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  p[234] = { x: 0.4, y: 0.5 }; p[454] = { x: 0.6, y: 0.5 }; p[33] = { x: 0.45, y: 0.45 + dy }; p[263] = { x: 0.55, y: 0.45 + dy };
  p[152] = { x: 0.5, y: 0.65 + dy }; p[1] = { x: 0.4 + 0.2 * turn, y: 0.53 + dy };
  return p;
};
const film = (n: number, f: (i: number) => { shapes?: Record<string, number>; turn?: number; dy?: number }) =>
  Array.from({ length: n }, (_, i) => { const o = f(i); return faceFrame(i * 100, o.shapes ?? {}, lm(o.turn, o.dy), 4 / 3); });

test("an alert, still face facing the screen", () => {
  const s = faceState(film(100, () => ({})), false)!;
  assert.deepEqual([s.drowsy, s.focus, s.restless, s.yawns, s.expression], [false, 1, false, 0, null]);
});
test("eyes closed a fifth of the time, or two yawns, reads as drowsy", () => {
  assert.equal(faceState(film(100, (i) => ({ shapes: { eyeBlinkLeft: i % 5 === 0 ? 0.9 : 0, eyeBlinkRight: i % 5 === 0 ? 0.9 : 0 } })), false)!.drowsy, true);
  const yawn = (i: number) => (i >= 10 && i < 30) || (i >= 60 && i < 80);
  const s = faceState(film(100, (i) => ({ shapes: { jawOpen: yawn(i) ? 0.8 : 0 } })), false)!;
  assert.deepEqual([s.yawns, s.drowsy], [2, true]);
});
test("looking away lowers focus; moving about is restless", () => {
  assert.equal(faceState(film(100, (i) => ({ turn: i < 50 ? 0.5 : 0.1 })), false)!.focus, 0.5);
  assert.equal(faceState(film(100, (i) => ({ dy: i % 2 ? 0.05 : -0.05 })), false)!.restless, true);
});
test("expressions only when switched on, and named as expressions", () => {
  const smiling = film(100, () => ({ shapes: { mouthSmileLeft: 0.8, mouthSmileRight: 0.8 } }));
  assert.equal(faceState(smiling, false)!.expression, null);
  assert.equal(faceState(smiling, true)!.expression, "smiling");
  assert.match(words(faceState(smiling, true)!), /expression: smiling/);
});
test("too little face is unknown", () => {
  assert.equal(faceState([...film(10, () => ({})), ...Array.from({ length: 90 }, (): FaceFrame | null => null)], true), null);
});
