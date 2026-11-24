import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

export const C = { ink: "#17101f", pink: "#ffb0d0", blush: "#ffe1ec", tomato: "#ff4a26", cobalt: "#2536e8", butter: "#ffd447", mint: "#bfeccb", white: "#ffffff", laptop: "#2536e8", phone: "#e8391a", danger: "#b81f05" };
export const F = { wide: "AnybodyWide", tall: "AnybodyTall", bold: "AnybodyBold", body: "SchibstedGrotesk_500Medium", strong: "SchibstedGrotesk_800ExtraBold" };
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const HOURS = Array.from({ length: 24 }, (_, i) => (i + 4) % 24);
export const min = (v: number | null) => (v === null ? "no record" : `${Math.round(v)} min`);

let reduced = false;
void AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduced = r; });
AccessibilityInfo.addEventListener("reduceMotionChanged", (r) => { reduced = r; });

/** Squashes into place like a reflection settling. Change `on` to replay. */
export function Wobble({ children, delay = 0, on = "" }: { children: ReactNode; delay?: number; on?: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { v.setValue(1); return; }
    v.setValue(0);
    const a = Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, useNativeDriver: true, stiffness: 190, damping: 13, mass: 0.9 })]);
    a.start();
    return () => a.stop();
  }, [v, delay, on]);
  return <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 0.3], outputRange: [0, 1], extrapolate: "clamp" }), transformOrigin: "bottom", transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }, { scaleY: v.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) }] }}>{children}</Animated.View>;
}

export function Copy({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: F.body, fontSize: 17, lineHeight: 24, color: C.ink }, style]}>{children}</Text>;
}
/** One line, as large as the width allows. */
export function Line({ children, wide, color = C.ink, size = 150 }: { children: string; wide?: boolean; color?: string; size?: number }) {
  return <Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1} style={{ fontFamily: wide ? F.wide : F.tall, fontSize: size, lineHeight: size * 0.92, includeFontPadding: false, textTransform: "uppercase", color }}>{children}</Text>;
}
export function Title({ children, color = C.ink, size = 46 }: { children: ReactNode; color?: string; size?: number }) {
  return <Text accessibilityRole="header" style={{ fontFamily: F.tall, fontSize: size, lineHeight: size * 0.95, textTransform: "uppercase", color }}>{children}</Text>;
}
export const Band = ({ children, bg, top = 34, bottom = 38 }: { children: ReactNode; bg: string; top?: number; bottom?: number }) => <View style={{ backgroundColor: bg, paddingHorizontal: 20, paddingTop: top, paddingBottom: bottom, gap: 16 }}>{children}</View>;

export function Button({ title, onPress, bg, fg, disabled }: { title: string; onPress: () => void; bg?: string; fg?: string; disabled?: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  const to = (x: number) => Animated.spring(v, { toValue: x, useNativeDriver: true, stiffness: 400, damping: 10, mass: 0.6 }).start();
  return (
    <Animated.View style={{ opacity: disabled ? 0.45 : 1, transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] }) }, { scaleY: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} onPressIn={() => to(1)} onPressOut={() => to(0)} style={{ minHeight: 60, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, backgroundColor: bg ?? "transparent", borderWidth: bg ? 0 : 3, borderColor: fg ?? C.ink }}>
        <Text style={{ fontFamily: F.strong, fontSize: 18, color: fg ?? C.ink, textAlign: "center" }}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

const SPIRAL = Array.from({ length: 130 }, (_, i) => { const a = i * 0.23, r = (i / 129) * 47; return `${i ? "L" : "M"}${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`; }).join("");

/** lid 0 open to 1 shut. wire 0 calm to 1 hypnotised. look: where a finger is, -1 to 1. */
export function Eye({ size, lid = 0, wire = 0, lidColor, look, live = true, label }: { size: number; lid?: number; wire?: number; lidColor: string; look?: Animated.ValueXY; live?: boolean; label?: string }) {
  const own = useRef(new Animated.ValueXY()).current, at = look ?? own;
  const shut = useRef(new Animated.Value(lid)).current, wired = useRef(new Animated.Value(0)).current, spin = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(shut, { toValue: lid, useNativeDriver: true, stiffness: 160, damping: 14 }).start(); }, [lid, shut]);
  useEffect(() => { Animated.timing(wired, { toValue: wire, duration: 900, useNativeDriver: true }).start(); }, [wire, wired]);
  useEffect(() => {
    if (!live || reduced || wire <= 0) return;
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [live, wire, spin]);
  useEffect(() => {
    if (!live || reduced || lid > 0.9) return;
    const glance = setInterval(() => { if (!look) Animated.spring(own, { toValue: { x: Math.random() * 2 - 1, y: Math.random() * 1.4 - 0.7 }, useNativeDriver: true, stiffness: 240, damping: 17 }).start(); }, 1500);
    const blink = setInterval(() => Animated.sequence([Animated.timing(shut, { toValue: 1, duration: 80, useNativeDriver: true }), Animated.timing(shut, { toValue: lid, duration: 150, useNativeDriver: true })]).start(), 3900);
    return () => { clearInterval(glance); clearInterval(blink); };
  }, [live, lid, look, own, shut]);
  const iris = size * 0.6, reach = size * 0.17;
  const move = (v: Animated.Value) => v.interpolate({ inputRange: [-1, 1], outputRange: [-reach, reach], extrapolate: "clamp" });
  return (
    <View accessible={!!label} accessibilityLabel={label} style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: wired }]}><Svg width={size} height={size} viewBox="0 0 100 100"><Path d="M2 40q12 2 18 9M4 62q10-2 15-7M98 44q-12 0-18 7M95 66q-9-3-14-8M30 4q2 9 8 14M68 97q-1-9-6-14" fill="none" stroke={C.phone} strokeWidth={1.6} strokeLinecap="round" /></Svg></Animated.View>
      <Animated.View style={{ width: iris, height: iris, alignItems: "center", justifyContent: "center", transform: [{ translateX: move(at.x) }, { translateY: move(at.y) }] }}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: iris, backgroundColor: C.cobalt }]} />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: wired, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-360deg"] }) }] }]}><Svg width={iris} height={iris} viewBox="0 0 100 100"><Circle cx={50} cy={50} r={50} fill={C.butter} /><Path d={SPIRAL} fill="none" stroke={C.ink} strokeWidth={5.6} /></Svg></Animated.View>
        <Animated.View style={{ width: iris * 0.48, height: iris * 0.48, borderRadius: iris, backgroundColor: C.ink, transform: [{ scale: wired.interpolate({ inputRange: [0, 1], outputRange: [1, 0.38] }) }] }} />
        <View style={{ position: "absolute", top: iris * 0.24, right: iris * 0.24, width: iris * 0.19, height: iris * 0.19, borderRadius: iris, backgroundColor: C.white }} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", top: -size, left: 0, width: size, height: size, backgroundColor: lidColor, transform: [{ translateY: shut.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.63] }) }] }} />
      <Animated.View style={{ position: "absolute", top: size, left: 0, width: size, height: size, backgroundColor: lidColor, transform: [{ translateY: shut.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.39] }) }] }} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: shut.interpolate({ inputRange: [0.85, 1], outputRange: [0, 1], extrapolate: "clamp" }) }]}><Svg width={size} height={size} viewBox="0 0 100 100"><Path d="M4 62Q50 82 96 62" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" /></Svg></Animated.View>
    </View>
  );
}

const LOOP = [C.pink, C.cobalt, C.tomato, C.butter], STEP = 0.36;
/** A laptop showing a phone showing a laptop, for ever. */
export function Tunnel({ size }: { size: number }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const a = Animated.loop(Animated.timing(p, { toValue: 4, duration: 9600, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [p]);
  const layers = useMemo(() => {
    const at = Array.from({ length: 33 }, (_, i) => i / 8);
    return Array.from({ length: 9 }, (_, i) => ({
      i,
      scale: p.interpolate({ inputRange: at, outputRange: at.map((x) => Math.min(STEP ** (i - x), 12)) }),
      rotate: p.interpolate({ inputRange: [0, 4], outputRange: [`${i * 11}deg`, `${(i - 4) * 11}deg`] }),
      opacity: i < 4 ? p.interpolate({ inputRange: [0, i + 1.9, i + 2, 4.01 + i], outputRange: [1, 1, 0, 0], extrapolate: "clamp" }) : 1,
    }));
  }, [p]);
  return (
    <View accessible accessibilityLabel="A laptop showing a phone showing a laptop, without end" style={{ flex: 1, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: C.butter }}>
      {layers.map(({ i, scale, rotate, opacity }) => {
        const phone = i % 2 === 1, w = size * (phone ? 0.95 : 1.5), h = size * (phone ? 1.55 : 1.02), edge = phone ? C.ink : C.white;
        return (
          <Animated.View key={i} style={{ position: "absolute", width: w, height: h, opacity, transform: [{ rotate }, { scale }] }}>
            <View style={{ flex: 1, borderRadius: size * 0.1, borderWidth: size * 0.045, borderColor: edge, backgroundColor: LOOP[i % 4] }} />
            {phone ? null : <View style={{ position: "absolute", left: -size * 0.14, right: -size * 0.14, bottom: -size * 0.1, height: size * 0.07, borderRadius: size * 0.04, backgroundColor: edge }} />}
          </Animated.View>
        );
      })}
    </View>
  );
}

export function Count({ value, color = C.ink }: { value: number; color?: string }) {
  const n = useRef(new Animated.Value(0)).current, [shown, setShown] = useState(0);
  useEffect(() => {
    const id = n.addListener((x) => setShown(Math.round(x.value)));
    Animated.timing(n, { toValue: value, duration: reduced ? 0 : 1200, easing: OUT, useNativeDriver: false }).start();
    return () => n.removeListener(id);
  }, [value, n]);
  return <Line wide color={color} size={190}>{String(shown)}</Line>;
}

function Bar({ i, laptop, phone, on }: { i: number; laptop: number; phone: number; on: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(reduced ? 1 : 0);
    const a = Animated.sequence([Animated.delay(i * 22), Animated.spring(v, { toValue: 1, useNativeDriver: true, stiffness: 170, damping: 11 })]);
    if (!reduced) a.start();
    return () => a.stop();
  }, [v, i, on]);
  return (
    <Animated.View style={{ width: "78%", gap: laptop && phone ? 2 : 0, transformOrigin: "bottom", transform: [{ scaleY: v }] }}>
      <View style={{ height: phone, backgroundColor: C.phone, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />
      <View style={{ height: laptop, backgroundColor: C.laptop }} />
    </Animated.View>
  );
}
/** Only on white or blush, where both colours were checked for contrast. */
export function Handoff({ laptop, phone, on }: { laptop: number[] | null; phone: number[] | null; on: string }) {
  const [hour, setHour] = useState(23);
  if (!laptop && !phone) return <Copy>No records yet. They'll appear here once a device reports.</Copy>;
  const H = 200, max = Math.max(10, ...HOURS.map((h) => (laptop?.[h] ?? 0) + (phone?.[h] ?? 0)));
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 20 }}>
        <View style={s.key}><View style={{ width: 16, height: 16, backgroundColor: C.laptop }} /><Copy style={{ fontFamily: F.strong }}>Laptop</Copy></View>
        <View style={s.key}><View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.phone }} /><Copy style={{ fontFamily: F.strong }}>Phone</Copy></View>
      </View>
      <View style={{ flexDirection: "row", height: H, alignItems: "flex-end", borderBottomWidth: 3, borderColor: C.ink, marginTop: 12 }}>
        {HOURS.map((h, i) => (
          <Pressable key={h} onPress={() => setHour(h)} accessibilityRole="button" accessibilityLabel={`${h}:00, laptop ${min(laptop?.[h] ?? null)}, phone ${min(phone?.[h] ?? null)}`} style={{ flex: 1, height: H, justifyContent: "flex-end", alignItems: "center" }}>
            <Bar i={i} on={on} laptop={((laptop?.[h] ?? 0) / max) * (H - 16)} phone={((phone?.[h] ?? 0) / max) * (H - 16)} />
            {h === hour ? <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5, backgroundColor: C.ink }} /> : null}
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 5 }}>{["04:00", "10:00", "16:00", "22:00", "04:00"].map((t, i) => <Copy key={i} style={{ fontSize: 13 }}>{t}</Copy>)}</View>
      <Copy style={{ marginTop: 10, fontFamily: F.strong }}>{String(hour).padStart(2, "0")}:00: laptop {min(laptop?.[hour] ?? null)}, phone {min(phone?.[hour] ?? null)}</Copy>
    </View>
  );
}

export type Tab = "tonight" | "report" | "you";
const TABS: [Tab, string][] = [["tonight", "Tonight"], ["report", "Report"], ["you", "You"]];
function TabItem({ name, on, press }: { name: string; on: boolean; press: () => void }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.spring(v, { toValue: on ? 1 : 0, useNativeDriver: false, stiffness: 220, damping: 18 }).start(); }, [on, v]);
  return (
    <Animated.View style={{ flexGrow: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }), flexBasis: 0, backgroundColor: v.interpolate({ inputRange: [0, 1], outputRange: [C.ink, C.pink], extrapolate: "clamp" }) }}>
      <Pressable onPress={press} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ height: 66, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1} style={{ fontFamily: on ? F.wide : F.tall, fontSize: on ? 19 : 24, textTransform: "uppercase", color: on ? C.ink : C.pink }}>{name}</Text>
      </Pressable>
    </Animated.View>
  );
}
export function Tabs({ tab, onTab, bottom }: { tab: Tab; onTab: (t: Tab) => void; bottom: number }) {
  return <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: C.ink, paddingBottom: bottom }}>{TABS.map(([t, name]) => <TabItem key={t} name={name} on={t === tab} press={() => onTab(t)} />)}</View>;
}
const s = StyleSheet.create({ key: { flexDirection: "row", alignItems: "center", gap: 8 } });
