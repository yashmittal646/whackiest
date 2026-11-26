import { useRef, useState } from "react";
import { PermissionsAndroid, Text, View } from "react-native";
import Svg, { Circle, Line as SvgLine } from "react-native-svg";
import { pose, reasons, smooth, usable, type Point, type Pose } from "@mirror/shared";
import { saveSitting, type Sitting } from "./data";
import { PostureCamera, type Look } from "./native";
import { Band, Button, C, Copy, F, Title } from "./ui";

type Job = { kind: "base" | "check"; looks: (Pose | null)[]; need: number };
const BASE_LOOKS = 15, CHECK_LOOKS = 25; // about 6 and 10 seconds

/** Live front camera with what Mirror sees drawn on top. Nothing is recorded until you press a button. */
export function SittingCheck({ sitting, onSaved, width }: { sitting: Sitting; onSaved: (s: Sitting) => void; width: number }) {
  const [open, setOpen] = useState(false), [look, setLook] = useState<Look | null>(null), [error, setError] = useState(""), [left, setLeft] = useState(0);
  const job = useRef<Job | null>(null), recent = useRef<Pose[]>([]);
  const base = usable(sitting.base) ? sitting.base : null, last = sitting.log.at(-1);
  const now = look && pose(look.points, look.aspect) ? smooth(recent.current) : null, why = now && base ? reasons(now, base) : [];

  const start = async () => {
    setError("");
    if ((await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA!)) !== "granted") return setError("Allow the camera for Mirror in Android settings.");
    setOpen(true);
  };
  const run = (kind: Job["kind"]) => { setError(""); job.current = { kind, looks: [], need: kind === "base" ? BASE_LOOKS : CHECK_LOOKS }; setLeft(kind === "base" ? 6 : 10); };
  const seen = (l: Look) => {
    const p = pose(l.points, l.aspect);
    recent.current = p ? [...recent.current, p].slice(-5) : [];
    setLook(l);
    const j = job.current;
    if (!j) return;
    j.looks.push(pose(l.points, l.aspect));
    setLeft(Math.ceil(((j.need - j.looks.length) * 0.4)));
    if (j.looks.length < j.need) return;
    job.current = null;
    void saveSitting(j.kind, j.looks).then(onSaved, (e: Error) => setError(e.message));
  };

  const h = look ? width / look.aspect : width * (4 / 3);
  // The preview is mirrored; the points are not.
  const at = (p: Point | undefined) => (p && (p.visibility ?? 0) > 0.5 ? { x: (1 - p.x) * width, y: p.y * h } : null);
  const busy = job.current !== null, colour = why.length ? C.tomato : C.mint;
  const status = !look ? "Opening the camera…" : !now ? (look.people > 1 ? "Only you, please." : "Can't see both ears. Face the phone.") : !base ? "Ready. Sit well, then set your good posture." : why.length ? `Slouching: ${why.join(", ")}` : "Sitting well";

  return (
    <Band bg={C.butter}>
      <Title>{busy ? `Hold still, ${left} s` : last ? `${last.slouch}% slouching` : "How are you sitting?"}</Title>
      {last && !open && last.slouch >= 50 ? <Copy style={{ fontFamily: F.strong }}>You slouched for most of that check. Sit back, shoulders down, head over your shoulders, and hold the phone higher.</Copy> : null}
      {last && !open ? <Copy>{`Leaning in ${last.lean}% of the time, ${new Date(last.at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`}</Copy> : null}
      {sitting.base && !base ? <Copy>Mirror now measures posture differently. Please set your good posture again.</Copy> : null}
      {open ? (
        <>
          <View style={{ width, height: h, marginHorizontal: -20, backgroundColor: C.ink }}>
            <PostureCamera style={{ width, height: h }} onLook={(e) => seen(e.nativeEvent)} onProblem={(e) => { setError(e.nativeEvent.message); setOpen(false); }} />
            {look ? <Svg width={width} height={h} style={{ position: "absolute" }} pointerEvents="none">
              {([[7, 8], [11, 12], [7, 11], [8, 12]] as const).map(([a, b]) => { const p = at(look.points[a]), q = at(look.points[b]); return p && q ? <SvgLine key={`${a}${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={colour} strokeWidth={5} /> : null; })}
              {[0, 7, 8, 11, 12].map((i) => { const p = at(look.points[i]); return p ? <Circle key={i} cx={p.x} cy={p.y} r={9} fill={colour} /> : null; })}
            </Svg> : null}
          </View>
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.tall, fontSize: 34, lineHeight: 36, textTransform: "uppercase", color: why.length ? C.danger : C.ink }}>{status}</Text>
          {!base ? <Copy>Back against the chair, shoulders relaxed, head straight above your shoulders. Keep the phone where it is for later checks.</Copy> : null}
          <Button bg={C.ink} fg={C.white} title={base ? "Check for 10 seconds" : "This is my good posture"} disabled={busy || !now} onPress={() => run(base ? "check" : "base")} />
          {base ? <Button title="Set my good posture again" disabled={busy || !now} onPress={() => run("base")} /> : null}
          <Button title="Close the camera" onPress={() => { job.current = null; setOpen(false); setLook(null); }} />
        </>
      ) : (
        <>
          {sitting.log.length > 1 ? <View accessible accessibilityLabel={`Slouching in recent checks: ${sitting.log.slice(-7).map((l) => `${l.slouch} percent`).join(", ")}`} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 126 }}>{sitting.log.slice(-7).map((l) => <View key={l.at} style={{ flex: 1, maxWidth: 44, justifyContent: "flex-end" }}><Copy style={{ fontSize: 13, textAlign: "center" }}>{`${l.slouch}%`}</Copy><View style={{ height: Math.max(3, l.slouch * 0.8), backgroundColor: C.ink }} /><Copy style={{ fontSize: 12, lineHeight: 18, textAlign: "center" }}>{`${new Date(l.at).getDate()}/${new Date(l.at).getMonth() + 1}`}</Copy></View>)}</View> : null}
          {!last ? <Copy>Prop the phone up so it sees your head and shoulders.</Copy> : null}
          <Button bg={C.ink} fg={C.white} title="Open the camera" onPress={() => void start()} />
        </>
      )}
      {error ? <Copy style={{ fontFamily: F.strong, color: C.danger }}>{error}</Copy> : null}
      <Copy style={{ fontSize: 14 }}>The camera runs only while it is open here. No picture is saved or sent, and results stay on this phone. This isn't medical advice.</Copy>
    </Band>
  );
}
