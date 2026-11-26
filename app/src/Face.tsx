import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Text, View } from "react-native";
import Storage from "expo-sqlite/kv-store";
import { BLINK_SEC, blinkRate, blinkTrend, describe, faceFrame, faceState, type EyeFrame, type FaceFrame, type FaceState, type Point } from "@mirror/shared";
import { PostureCamera, type FaceLook } from "./native";
import { Band, Button, C, Copy, F, Title } from "./ui";

interface Result extends FaceState { blinks: number | null; at: number; trend?: "low" | "high" | null }

/** Twenty seconds of the front camera, read as numbers: blinks, drowsiness, focus, restlessness, and expression if allowed. */
export function FaceCheck({ width }: { width: number }) {
  const [open, setOpen] = useState(false), [left, setLeft] = useState(BLINK_SEC), [expr, setExpr] = useState(false);
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [seen, setSeen] = useState(true);
  const eyes = useRef<EyeFrame[]>([]), face = useRef<(FaceFrame | null)[]>([]), started = useRef(0);

  useEffect(() => {
    void Storage.getItemAsync("expr").then((v) => setExpr(v === "1"));
    void Storage.getItemAsync("face").then((v) => { if (v) setResult(JSON.parse(v) as Result); });
  }, []);

  const start = async () => {
    setError("");
    if ((await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA!)) !== "granted") return setError("Allow the camera for Mirror in Android settings.");
    eyes.current = []; face.current = []; started.current = 0; setLeft(BLINK_SEC); setOpen(true);
  };
  const finish = () => {
    setOpen(false);
    const state = faceState(face.current, expr);
    if (!state) return setError("Mirror couldn't see your face for long enough. Hold the phone in front of you, with more light.");
    const blinks = blinkRate(eyes.current);
    // Compared with this phone's own earlier checks, like the laptop. Only these numbers are kept, on this phone.
    void Storage.getItemAsync("blinks").then((v) => {
      const history = [...(JSON.parse(v ?? "[]") as number[]), ...(blinks === null ? [] : [blinks])].slice(-20);
      const r: Result = { ...state, blinks, at: Date.now(), trend: blinks === null ? null : blinkTrend(history) };
      setResult(r);
      void Storage.setItemAsync("blinks", JSON.stringify(history));
      void Storage.setItemAsync("face", JSON.stringify(r));
    });
  };
  const look = (l: FaceLook) => {
    started.current ||= l.t;
    const one = l.faces === 1 && Object.keys(l.points).length === 6, s = (k: string) => l.shapes[k] ?? 0;
    const lm: Point[] = [];
    for (const [i, p] of Object.entries(l.points)) lm[Number(i)] = p;
    eyes.current.push({ t: l.t, shut: one ? (s("eyeBlinkLeft") + s("eyeBlinkRight")) / 2 : null });
    face.current.push(one ? faceFrame(l.t, l.shapes, lm, l.aspect) : null);
    setSeen(one);
    const gone = (l.t - started.current) / 1000;
    setLeft(Math.max(0, Math.ceil(BLINK_SEC - gone)));
    if (gone >= BLINK_SEC) finish();
  };
  const h = width * (4 / 3) * 0.75;

  return (
    <Band bg={C.pink}>
      <Title>{open ? `Look at the phone, ${left} s` : result ? (result.drowsy ? "You look drowsy" : "Eyes and face") : "Eyes and face"}</Title>
      {open ? (
        <>
          <View style={{ width, height: h, marginHorizontal: -20, backgroundColor: C.ink }}>
            <PostureCamera mode="face" style={{ width, height: h }} onFace={(e) => look(e.nativeEvent)} onProblem={(e) => { setError(e.nativeEvent.message); setOpen(false); }} />
          </View>
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.tall, fontSize: 30, lineHeight: 32, textTransform: "uppercase", color: seen ? C.ink : C.danger }}>{seen ? "Reading your face…" : "Can't see one face clearly"}</Text>
          <Button title="Stop" onPress={() => setOpen(false)} />
        </>
      ) : (
        <>
          {result ? <>
            <Copy style={{ fontFamily: F.strong }}>{`${result.blinks === null ? "Blinks: couldn't count" : `${result.blinks} blinks a minute`} · ${describe(result)}`}</Copy>
            {result.drowsy ? <Copy>Your eyes kept closing{result.yawns ? " and you yawned" : ""}. A short break, water or fresh air may help; if it's late, sleep.</Copy> : null}
            {result.trend === "high" ? <Copy style={{ fontFamily: F.strong }}>You're blinking much more than usual: often a sign of tired or irritated eyes. Rest them and look far away for a few minutes. If they are also red, sore or sticky, or this keeps happening, see a doctor.</Copy> : null}
            {result.trend === "low" ? <Copy style={{ fontFamily: F.strong }}>You're blinking much less than usual, which dries the eyes. Look away from the screen and blink slowly a few times.</Copy> : null}
            {result.tooClose ? <Copy>You were very close to the screen. Hold it further away to rest your eyes.</Copy> : null}
            <Copy style={{ fontSize: 14 }}>{`Checked ${new Date(result.at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`}</Copy>
          </> : <Copy>Twenty seconds with the front camera: blinks, drowsiness (eyes closing, yawning), whether you face the screen, and restlessness.</Copy>}
          <Button bg={C.ink} fg={C.white} title="Check my eyes and face" onPress={() => void start()} />
          <Button title={expr ? "Noting my expression: on" : "Noting my expression: off"} onPress={() => { setExpr(!expr); void Storage.setItemAsync("expr", expr ? "0" : "1"); }} />
          <Copy style={{ fontSize: 14 }}>Expression means smiling, frowning or neutral as the camera sees it, not how you feel: a frown can just be concentration.</Copy>
        </>
      )}
      {error ? <Copy style={{ fontFamily: F.strong, color: C.danger }}>{error}</Copy> : null}
      <Copy style={{ fontSize: 14 }}>No picture is saved or sent. Results stay on this phone.</Copy>
    </Band>
  );
}
