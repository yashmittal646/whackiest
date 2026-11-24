import "./native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, AppState, ScrollView, Text, TextInput, useWindowDimensions, View, type ScrollViewInstance } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import Storage from "expo-sqlite/kv-store";
import { SchibstedGrotesk_500Medium } from "@expo-google-fonts/schibsted-grotesk/500Medium";
import { SchibstedGrotesk_800ExtraBold } from "@expo-google-fonts/schibsted-grotesk/800ExtraBold";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { buildReport, dayKey, deleteAccount, download, fresh, getVault, hourly, MIN_NIGHTS, samplePackets, setUpVault, signIn, signOut, signUp, toB64, unlock, type DevicePacket, type Session, type Track, type Vault } from "@mirror/shared";
import { clearAccount, CONFIG, loadAccount, measure, saveAccount, sync, wipe, type Account } from "./data";
import { Native } from "./native";
import { Band, Button, C, Copy, Count, Eye, F, Handoff, Line, Tabs, Title, Tunnel, Wobble, type Tab } from "./ui";

export default function Main() { return <SafeAreaProvider><Mirror /></SafeAreaProvider>; }

function Mirror() {
  const [fonts] = useFonts({ AnybodyWide: require("../assets/fonts/AnybodyWide.ttf"), AnybodyTall: require("../assets/fonts/AnybodyTall.ttf"), AnybodyBold: require("../assets/fonts/AnybodyBold.ttf"), SchibstedGrotesk_500Medium, SchibstedGrotesk_800ExtraBold });
  const inset = useSafeAreaInsets(), { width } = useWindowDimensions(), scroller = useRef<ScrollViewInstance>(null);
  const [tab, setTab] = useState<Tab>("tonight"), [inside, setInside] = useState(false);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [account, setAccount] = useState<Account | null>(null), [session, setSession] = useState<Session | null>(null), [vault, setVault] = useState<Vault | null>(null);
  const [made, setMade] = useState<{ phrase: string; key: string } | null>(null);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [words, setWords] = useState("");
  const [access, setAccess] = useState(false), [days, setDays] = useState<DevicePacket[]>([]), [track, setTrack] = useState<Track | null>(null);
  const [cloud, setCloud] = useState<DevicePacket[]>([]), [sample, setSample] = useState(false), [last, setLast] = useState("");
  const running = useRef(false), look = useRef(new Animated.ValueXY()).current;

  // One job at a time: refresh tokens are single-use.
  const attempt = useCallback(async (fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    running.current = false;
    setBusy(false);
  }, []);

  const remeasure = useCallback(async () => {
    setAccess(Native.hasUsageAccess());
    const m = await measure();
    setDays(m.days);
    setTrack(m.track);
    return m.days;
  }, []);

  const syncNow = useCallback(async (a: Account) => {
    const d = await remeasure();
    const next = await sync(a, d);
    setAccount(next);
    const got = await download(CONFIG, next);
    setCloud(got.packets);
    setLast(new Date().toLocaleTimeString());
    if (got.unreadable) setError(`${got.unreadable} record(s) could not be read and were skipped.`);
  }, [remeasure]);

  useEffect(() => {
    void attempt(async () => {
      const a = await loadAccount();
      setAccount(a);
      setInside(!!a || (await Storage.getItemAsync("entered")) === "1");
      setReady(true);
      if (a) await syncNow(a); else await remeasure();
    });
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") void attempt(async () => { await remeasure(); }); });
    return () => sub.remove();
  }, [attempt, remeasure, syncNow]);

  const enter = (get: typeof signIn) => attempt(async () => {
    const n = await get(CONFIG, email.trim(), password);
    const v = await getVault(CONFIG, n);
    if (!v) setMade(await setUpVault(CONFIG, n));
    setSession(n);
    setVault(v);
    setPassword("");
  });
  const link = async (key: string) => {
    const deviceId = toB64(crypto.getRandomValues(new Uint8Array(12)));
    const a: Account = { session: session!, key, deviceId };
    await saveAccount(a);
    setAccount(a);
    setSession(null); setVault(null); setMade(null); setWords("");
    await syncNow(a);
  };
  const leave = async (all: boolean) => {
    if (all) { await wipe(); setDays([]); setTrack(null); } else await clearAccount();
    setAccount(null); setCloud([]); setLast("");
    if (all) { setInside(false); setTab("tonight"); }
  };
  const confirm = (title: string, text: string, fn: () => Promise<void>) =>
    Alert.alert(title, text, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void attempt(fn) }]);

  const now = Date.now(), today = days.find((d) => d.date === dayKey(now));
  // This phone's own totals show at once, even before they sync.
  const real = [...cloud.filter((p) => !p.demo), ...days.filter((d) => !cloud.some((p) => !p.demo && p.device === "phone" && p.date === d.date))];
  const live = cloud.filter((p) => p.demo), taken = new Set(live.map((p) => p.device + p.date));
  const packets = sample ? [...samplePackets(now).filter((p) => !taken.has(p.device + p.date)), ...live] : real;
  const report = buildReport(packets, sample);
  const nights = report.nights.filter((n) => n.sleepMin !== null && n.laptopLateMin !== null && n.phoneLateMin !== null).length;
  const input = { minHeight: 60, borderWidth: 3, paddingHorizontal: 16, fontSize: 18, fontFamily: F.body, color: C.ink, borderColor: C.ink, backgroundColor: C.white };
  const go = (t: Tab) => { setTab(t); setError(""); scroller.current?.scrollTo({ y: 0, animated: false }); };
  const come = (t: Tab) => { setInside(true); go(t); void Storage.setItemAsync("entered", "1"); };
  const glance = (x: number, y: number) => Animated.spring(look, { toValue: { x: (x / width) * 2 - 1, y: Math.max(-1, Math.min(1, (y - 300) / 300)) }, useNativeDriver: true, stiffness: 260, damping: 18 }).start();

  if (!ready || !fonts) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: C.tomato }}><ActivityIndicator color={C.ink} /></View>;

  if (!inside) return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <StatusBar style="dark" />
      <Tunnel size={width * 0.8} />
      <View style={{ padding: 20, paddingBottom: inset.bottom + 20, gap: 12 }}>
        <View accessible accessibilityRole="header" accessibilityLabel="Your attention doesn't stop at one screen" style={{ marginBottom: 6 }}>
          <Wobble><Line color={C.pink} size={96}>Your attention</Line></Wobble><Wobble delay={110}><Line wide color={C.pink} size={96}>doesn't stop</Line></Wobble><Wobble delay={220}><Line color={C.pink} size={96}>at one screen</Line></Wobble>
        </View>
        <Button bg={C.tomato} title="Connect my devices" onPress={() => come("you")} /><Button fg={C.pink} title="Just this phone" onPress={() => come("tonight")} />
      </View>
    </View>
  );

  const todays = real.filter((p) => p.date === dayKey(now)), doom = today?.doomMin ?? 0;
  const mood = !access ? C.pink : doom >= 45 ? C.tomato : doom >= 15 ? C.butter : C.mint;
  const bg = tab === "tonight" ? mood : tab === "report" ? C.butter : C.pink;
  const late = new Date(now).getHours();
  return (
    <View style={{ flex: 1, backgroundColor: bg }} onTouchMove={(e) => glance(e.nativeEvent.pageX, e.nativeEvent.pageY)} onTouchStart={(e) => glance(e.nativeEvent.pageX, e.nativeEvent.pageY)}>
      <StatusBar style="dark" />
      <View style={{ height: inset.top, backgroundColor: bg }} />
      <ScrollView ref={scroller} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontFamily: F.wide, fontSize: 18, color: C.ink, textTransform: "uppercase" }}>Mirror</Text>{busy ? <ActivityIndicator color={C.ink} /> : null}</View>
        {error ? <Text accessibilityRole="alert" style={{ fontFamily: F.strong, color: C.white, backgroundColor: C.ink, fontSize: 16, padding: 16, marginTop: 10 }}>{error}</Text> : null}

        {tab === "tonight" ? (access ? (
          <>
            <Band bg={mood} top={18} bottom={30}>
              <Wobble on={tab}><View style={{ alignItems: "center" }}><Eye label="Your day as an eye" size={Math.min(width * 0.72, 320)} lidColor={doom >= 15 ? "#f0a93c" : "#86d39d"} look={look} lid={doom < 15 ? (late >= 23 || late < 5 ? 0.55 : 0.25) : 0} wire={Math.max(0, Math.min(1, (doom - 15) / 60))} /></View></Wobble>
              <View accessible accessibilityLabel={`${doom} minutes doom-scrolling today`}><Count value={doom} /><Line size={62}>minutes doom-scrolling</Line></View>
              <View style={{ flexDirection: "row", borderTopWidth: 3, borderColor: C.ink, paddingTop: 12 }}>
                {([[today?.screenMin, "screen min"], [today?.lateNightMin, "late min"], [today?.switches, "app switches"]] as const).map(([v, n]) => <View key={n} style={{ flex: 1 }}><Text style={{ fontFamily: F.tall, fontSize: 44, lineHeight: 46, color: C.ink }}>{v ?? 0}</Text><Copy style={{ fontSize: 15 }}>{n}</Copy></View>)}
              </View>
              {track?.days[dayKey(now)]?.nudges ? <Copy>Mirror would have nudged you {track.days[dayKey(now)]!.nudges} time(s) today. Live phone nudges aren't built yet.</Copy> : null}
            </Band>
            <Band bg={C.white}><Title>Hour by hour</Title><Handoff on={tab + todays.length} laptop={hourly(todays, "laptop", null)} phone={hourly(todays, "phone", null)} /></Band>
          </>
        ) : (
          <Band bg={mood} top={18}>
            <Wobble on={tab}><View style={{ alignItems: "center" }}><Eye label="A closed eye" size={Math.min(width * 0.72, 320)} lidColor="#f0699f" lid={1} /></View></Wobble>
            <View accessible accessibilityRole="header" accessibilityLabel="Open its eyes"><Line wide size={110}>Open</Line><Line size={110}>its eyes</Line></View>
            <Copy>Mirror reads which app is open, turns that into daily totals, and never stores app names.</Copy>
            <Button bg={C.ink} fg={C.white} title="Allow usage access" onPress={() => Native.openUsageSettings()} />
          </Band>
        )) : null}

        {tab === "report" ? (
          <>
            {sample ? <Text style={{ fontFamily: F.strong, color: C.white, backgroundColor: C.ink, fontSize: 15, paddingHorizontal: 20, paddingVertical: 10, marginTop: 10 }}>Sample data: these records are invented for demonstration</Text> : null}
            <Band bg={C.butter} top={22}>
              <Wobble on={tab + sample}><Title size={report.insights.length ? 48 : 64}>{report.insights[0]?.text.replaceAll("-", "\u2011") ?? (packets.length ? "No clear pattern yet." : "Nothing here yet.")}</Title></Wobble>
              <Copy>{report.insights.length ? "An association, not proof of cause." : packets.length ? `${nights} of at least ${MIN_NIGHTS} nights have laptop, phone and sleep records.` : "Connect a device, or look at the sample."}</Copy>
              {report.insights.slice(1, 3).map((i) => <View key={i.id} style={{ borderTopWidth: 3, borderColor: C.ink, paddingTop: 12 }}><Copy style={{ fontFamily: F.strong }}>{i.text}</Copy><Copy style={{ fontSize: 14 }}>An association, not proof of cause.</Copy></View>)}
              <Button title={sample ? "Show my data" : "Show sample data"} onPress={() => setSample(!sample)} />
            </Band>
            {report.nights.length ? (
              <Band bg={C.pink}><Title>Your nights</Title><Copy>Shut means eight hours of sleep. Wide open means five or less.</Copy>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 18 }}>
                  {[...report.nights].reverse().map((n) => { const awake = n.sleepMin === null ? 0 : Math.max(0, Math.min(1, (480 - n.sleepMin) / 180)); return (
                    <View key={n.date} accessible style={{ alignItems: "center", gap: 5, opacity: n.sleepMin === null ? 0.35 : 1 }}><Eye live={false} size={84} lidColor="#f0699f" lid={1 - awake} wire={Math.max(0, (awake - 0.45) * 1.8)} /><Copy style={{ fontFamily: F.strong, fontSize: 15 }}>{n.date.slice(8)}/{n.date.slice(5, 7)}</Copy><Copy style={{ fontSize: 14 }}>{n.sleepMin === null ? "no record" : `${Math.floor(n.sleepMin / 60)}h ${n.sleepMin % 60}m`}</Copy></View>); })}
                </ScrollView></Band>
            ) : null}
            <Band bg={C.white}><Title>The hand-off</Title><Copy>Average doom-scrolling minutes per hour, {report.dates.length} day(s). Tap a bar.</Copy><Handoff on={tab + sample} laptop={hourly(packets, "laptop", null)} phone={hourly(packets, "phone", null)} /></Band>
          </>
        ) : null}

        {tab === "you" ? (
          <>
            <Band bg={C.pink} top={22}>
              <Wobble on={tab}><View style={{ flexDirection: "row", gap: 12 }}><Eye size={92} lidColor="#f0699f" look={look} lid={account ? 0 : 1} /><Eye size={92} lidColor="#f0699f" look={look} lid={account ? 0 : 0.5} /></View></Wobble>
              <Title size={64}>{account ? "Both eyes open" : made ? "Keep these" : session ? "Say the words" : "Connect your screens"}</Title>
              {account ? (
                <><Copy style={{ fontFamily: F.strong }}>{account.session.email}</Copy><Copy>{last ? `Last synced ${last}` : "Not synced yet"}</Copy>
                  <Button bg={C.ink} fg={C.white} title="Sync now" disabled={busy} onPress={() => void attempt(() => syncNow(account))} />
                  <Button title="Sign out" disabled={busy} onPress={() => void attempt(async () => { const x = account.session; await leave(false); await signOut(CONFIG, x).catch(() => {}); })} /></>
              ) : made ? (
                <><Copy>Your recovery words. You need them on your other devices, and nobody can reset them.</Copy><Text selectable style={{ fontFamily: F.tall, fontSize: 48, color: C.ink }}>{made.phrase}</Text>
                  <Button bg={C.ink} fg={C.white} title="I've written them down" disabled={busy} onPress={() => void attempt(() => link(made.key))} /></>
              ) : session && vault ? (
                <><Copy>Enter your recovery words from the laptop.</Copy><TextInput style={input} value={words} onChangeText={setWords} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Recovery words" placeholder="two words" placeholderTextColor="#6d6273" />
                  <Button bg={C.ink} fg={C.white} title="Connect this phone" disabled={busy} onPress={() => void attempt(async () => link(await unlock(session, vault, words)))} />
                  <Button title="Use another account" disabled={busy} onPress={() => { setSession(null); setVault(null); setWords(""); }} /></>
              ) : (
                <><Copy>Optional. Daily totals are encrypted on this phone before they are uploaded.</Copy>
                  <TextInput style={input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" accessibilityLabel="Email" placeholder="Email" placeholderTextColor="#6d6273" />
                  <TextInput style={input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" accessibilityLabel="Password" placeholder="Password" placeholderTextColor="#6d6273" />
                  <Button bg={C.ink} fg={C.white} title="Sign in" disabled={busy || !email || password.length < 8} onPress={() => void enter(signIn)} />
                  <Button title="Create account" disabled={busy || !email || password.length < 8} onPress={() => void enter(signUp)} /></>
              )}
            </Band>
            <Band bg={C.cobalt}><Title color={C.white}>No peeking</Title>
              <Copy style={{ color: C.white }}>Only daily totals are stored here. The server sees your email, IP address, sync times and how many records you have.</Copy>
              <Copy style={{ color: C.white, fontSize: 15 }}>Two recovery words are for the prototype, not strong protection.</Copy>
              <Button bg={C.white} fg={C.danger} title="Wipe this phone" disabled={busy} onPress={() => confirm("Wipe this phone?", "Deletes Mirror's data here and signs out. Cloud records stay. If usage access stays on, the last few days can be counted again.", () => leave(true))} />
              {account ? <Button bg={C.white} fg={C.danger} title="Delete cloud data and account" disabled={busy} onPress={() => confirm("Delete your account?", "Deletes every record on the server. This cannot be undone.", async () => { await deleteAccount(CONFIG, await fresh(CONFIG, account.session)); await leave(false); })} /> : null}
            </Band>
          </>
        ) : null}
      </ScrollView>
      <Tabs tab={tab} onTab={go} bottom={inset.bottom} />
    </View>
  );
}
