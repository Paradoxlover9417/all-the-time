import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Switch, Text, TextInput, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as SystemUI from 'expo-system-ui';
import * as DocumentPicker from 'expo-document-picker';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

type Lang = 'en' | 'ko';
type Note = { id: string; at: string; text: string }; // at: 'YYYY-MM-DD HH:MM'
type Entry = { date: string; text: string; time?: string }; // time: 'HH:MM', updates only
type Prayer = { id: string; title: string; person: string; startDate: string; updates: Entry[]; answer?: Entry };
type DateFmt = 'ymd' | 'ymdDot' | 'ko' | 'mdy' | 'dmy';
type Settings = {
  times: string[];
  minutes: number;
  lang: Lang;
  dateFmt: DateFmt;
  theme: 'system' | 'light' | 'dark';
  sounds: { uri: string; name: string }[];
  music?: string; // uri of the track picked on the prayer screen
  musicAt: 'start' | 'end';
  remind: boolean; // daily reminders at the prayer times
  endAlert: boolean; // notification when the timer reaches its goal (covers background)
};
type Screen = { name: 'list' } | { name: 'edit'; id?: string; note?: Note } | { name: 'pray' } | { name: 'settings' } | { name: 'calendar' };

const STR = {
  en: {
    settings: 'Settings', prayNow: 'Pray now', praying: 'Praying', answered: 'Answered', new: 'New',
    noPrayers: 'No prayers yet.', since: (d: string) => `since ${d}`, answeredOn: (d: string) => `answered ${d}`,
    updates: (n: number) => `${n} updates`, back: 'Back', save: 'Save', enterTitle: 'Enter a prayer title',
    title: 'Prayer title', person: 'For whom', startDate: 'Start date', along: 'Along the way', remove: 'Remove',
    date: 'Date', time: 'Time', done: 'Done', updText: 'What happened / what God showed', addUpd: 'Add update', answer: 'Answer',
    ansDate: 'Answered date', ansText: 'Result (fill in to mark answered)', del: 'Delete prayer',
    delQ: 'Delete this prayer?', cancel: 'Cancel', delete: 'Delete', amen: 'Amen', over: 'Prayer time is over.',
    slot: (i: number, n: number) => `Prayer ${i} of ${n}`, start: 'Start', resume: 'Resume', pause: 'Pause', reset: 'Reset',
    prayThese: 'Pray for these now', addFirst: 'Add prayers first.', last: 'Last',
    times: 'Prayer times', reminders: 'Reminders', theme: 'Appearance', system: 'System', light: 'Light', dark: 'Dark', quick: 'Quick', quickHint: 'Quick prayer: write what is on your heart now', toList: '+ Add to prayer list', quickSend: 'Pray', noQuick: 'No quick prayers yet.', endAlert: 'Alert when time is up', prayer: (i: number) => `Prayer ${i}`, minutes: 'Length', min: (n: number) => `${n} min`, general: 'General',
    backup: 'Backup', exportData: 'Save backup file', importData: 'Restore from backup', backupHint: 'Music files are not included. Save a backup before reinstalling or switching phones.', restoreQ: 'Replace current data with this backup?', restore: 'Restore', badFile: 'This is not a valid backup file.',
    musicList: 'Music list', addMusic: '+ Add music', music: 'Music', musicAt: 'Play', noSound: 'None',
    atStart: 'From the start', atEnd: (n: number) => `After ${n} min`, finish: 'Finish',
    language: 'Language', dateFmt: 'Date format', calendar: 'Calendar', week: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    month: (y: number, m: number) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`,
    prayed: (n: number, total: number) => `Prayed ${n}/${total}`, started: 'Started', nothing: 'Nothing on this day.', remind: (i: number, n: number) => `Prayer ${i}/${n}`, timeToPray: 'Time to pray', addTime: '+ Add time',
  },
  ko: {
    settings: '설정', prayNow: '지금 기도하기', praying: '기도 중', answered: '응답 받음', new: '새 기도',
    noPrayers: '아직 기도제목이 없어요.', since: (d: string) => `${d}부터`, answeredOn: (d: string) => `${d} 응답`,
    updates: (n: number) => `기록 ${n}개`, back: '뒤로', save: '저장', enterTitle: '기도제목을 입력하세요',
    title: '기도제목', person: '대상자', startDate: '시작일', along: '기도 과정의 응답', remove: '삭제',
    date: '날짜', time: '시간', done: '완료', updText: '있었던 일 / 받은 응답', addUpd: '기록 추가', answer: '응답 결과',
    ansDate: '응답일', ansText: '결과 (입력하면 응답됨으로 표시)', del: '기도제목 삭제',
    delQ: '이 기도제목을 삭제할까요?', cancel: '취소', delete: '삭제', amen: '아멘', over: '기도 시간이 끝났어요.',
    slot: (i: number, n: number) => `오늘의 기도 ${i}/${n}`, start: '시작', resume: '계속', pause: '일시정지', reset: '처음부터',
    prayThese: '이번 시간에 기도할 제목', addFirst: '먼저 기도제목을 추가하세요.', last: '최근',
    times: '기도 시간', reminders: '알림', theme: '화면 모드', system: '시스템', light: '라이트', dark: '다크', quick: '짧은 기도', quickHint: '짧은 기도 : 지금 마음을 기도로 적어보세요', toList: '+ 기도 목록에 추가', quickSend: '기도 남기기', noQuick: '아직 짧은 기도가 없어요.', endAlert: '기도 시간 끝 알림', prayer: (i: number) => `기도 ${i}`, minutes: '한 번 기도 시간', min: (n: number) => `${n}분`, general: '일반',
    backup: '백업', exportData: '백업 파일 저장', importData: '백업 불러오기', backupHint: '음악 파일은 포함되지 않아요. 앱을 다시 설치하거나 폰을 바꾸기 전에 백업해두세요.', restoreQ: '지금 데이터를 백업 내용으로 바꿀까요?', restore: '불러오기', badFile: '백업 파일이 아니에요.',
    musicList: '음악 목록', addMusic: '+ 음악 추가', music: '음악', musicAt: '재생 시점', noSound: '없음',
    atStart: '처음부터', atEnd: (n: number) => `${n}분 후`, finish: '마치기',
    language: '언어', dateFmt: '날짜 표시', calendar: '달력', week: ['일', '월', '화', '수', '목', '금', '토'],
    month: (y: number, m: number) => `${y}년 ${m}월`,
    prayed: (n: number, total: number) => `기도 ${n}/${total}회`, started: '시작', nothing: '이 날은 기록이 없어요.', remind: (i: number, n: number) => `기도 ${i}/${n}`, timeToPray: '기도할 시간이에요', addTime: '+ 시간 추가',
  },
};
let t = STR.en;

// Dates are stored as 'YYYY-MM-DD'; only display and wheel order follow the chosen format.
const DATE_FMTS: DateFmt[] = ['ymd', 'ymdDot', 'ko', 'mdy', 'dmy'];
let dateFmt: DateFmt = 'ymd';
const showDate = (v: string, f: DateFmt = dateFmt) => {
  const [y, m, d] = v.split('-');
  if (!d) return v;
  if (f === 'ymdDot') return `${y}.${m}.${d}`;
  if (f === 'ko') return `${y}년 ${Number(m)}월 ${Number(d)}일`;
  if (f === 'mdy') return `${m}/${d}/${y}`;
  if (f === 'dmy') return `${d}/${m}/${y}`;
  return v;
};

const KEY = 'att:v1';
const Stack = createNativeStackNavigator();
// Dev-only demo data, loaded from Settings.
const sampleLog = () =>
  range(0, 13).flatMap((i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return Array(i % 4 === 3 ? 1 : 3 - (i % 2)).fill(day);
  });
const SAMPLE: Prayer[] = [
  {
    id: 'sample1', title: '어머니 건강 회복', person: '어머니', startDate: '2026-09-01',
    updates: [
      { date: '2026-09-15', text: '검사 결과가 생각보다 좋다고 하셨다.' },
      { date: '2026-10-10', text: '통증이 줄고 잠을 잘 주무신다.' },
    ],
  },
  {
    id: 'sample2', title: '새 직장에서 좋은 동료들을 만나도록', person: '민수', startDate: '2026-10-01',
    updates: [{ date: '2026-10-20', text: '팀장님이 잘 챙겨주신다고 한다.' }],
  },
  { id: 'sample3', title: '매일 말씀 읽는 습관', person: '나', startDate: '2026-10-15', updates: [] },
  { id: 'sample4', title: '교회 청년부 수련회', person: '청년부', startDate: '2026-08-01', updates: [] },
  {
    id: 'sample5', title: '이사할 집이 구해지도록', person: '우리 가족', startDate: '2026-06-10',
    updates: [{ date: '2026-07-05', text: '조건에 맞는 집이 두 곳 나왔다.' }],
    answer: { date: '2026-08-20', text: '학교와 가까운 집으로 계약했다. 감사!' },
  },
  {
    id: 'sample6', title: '친구 지현이의 취업', person: '지현', startDate: '2026-05-01',
    updates: [{ date: '2026-06-12', text: '최종 면접까지 갔다.' }],
    answer: { date: '2026-07-01', text: '원하던 회사에 합격했다.' },
  },
];
const DEFAULTS: Settings = { times: ['07:00', '12:00', '21:00'], minutes: 5, lang: 'ko', dateFmt: 'ymd', sounds: [], musicAt: 'end', remind: true, endAlert: false, theme: 'light' };
const native = Platform.OS !== 'web';

// Confirmation dialog; Alert buttons are a no-op on web.
const ask = (q: string, yes: string, onYes: () => void) => {
  if (!native) return void (window.confirm(q) && onYes());
  Alert.alert(q, '', [
    { text: t.cancel, style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
};
const confirmDel = (onYes: () => void) => ask(t.delQ, t.delete, onYes);
const notify = (msg: string) => (native ? Alert.alert(msg) : window.alert(msg));

type Backup = { app: 'all-the-time'; version: 1; exportedAt: string; prayers: Prayer[]; notes: Note[]; log: string[]; settings: Settings };

// Saves everything to a JSON file the user keeps (Files app, Drive, chat…). Music uris are device-local, so they're left out.
async function exportBackup(data: Omit<Backup, 'app' | 'version' | 'exportedAt'>) {
  const backup: Backup = { app: 'all-the-time', version: 1, exportedAt: new Date().toISOString(), ...data, settings: { ...data.settings, sounds: [], music: undefined } };
  const json = JSON.stringify(backup);
  const name = `all-the-time-${today()}.json`;
  if (native) {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    await file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
    return;
  }
  const f = new window.File([json], name, { type: 'application/json' });
  // iOS home-screen apps can't download, but can hand the file to the share sheet ("Save to Files").
  if (navigator.canShare?.({ files: [f] })) return navigator.share({ files: [f] }).catch(() => {});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(f);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function pickBackup(): Promise<Backup | undefined> {
  const r = await DocumentPicker.getDocumentAsync({ type: native ? ['application/json', 'text/plain', '*/*'] : '*/*', copyToCacheDirectory: true });
  if (r.canceled) return;
  const x = r.assets[0];
  try {
    const text = !native && x.file ? await x.file.text() : await new File(x.uri).text();
    const b = JSON.parse(text);
    if (b?.app === 'all-the-time' && Array.isArray(b.prayers)) return b;
  } catch {}
  notify(t.badFile);
}

// Web: picked files only live as blob URLs, so keep them in IndexedDB under 'idb:<id>' uris.
const idb = (mode: IDBTransactionMode) =>
  new Promise<IDBObjectStore>((res, rej) => {
    const r = indexedDB.open('att', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('music');
    r.onsuccess = () => res(r.result.transaction('music', mode).objectStore('music'));
    r.onerror = () => rej(r.error);
  });
const idbCall = <T,>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>) =>
  idb(mode).then((st) => new Promise<T>((res, rej) => {
    const q = fn(st);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  }));
const resolveUri = async (uri: string) =>
  uri.startsWith('idb:') ? URL.createObjectURL(await idbCall<Blob>('readonly', (st) => st.get(uri.slice(4)))) : uri;
const pad = (n: number) => String(n).padStart(2, '0');
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Split active prayers across the daily slots (3 for 153) so each session has a focus.
const forSlot = (prayers: Prayer[], slot: number, n: number) => {
  const active = prayers.filter((p) => !p.answer);
  return active.length <= n ? active : active.filter((_, i) => i % n === slot);
};
const currentSlot = (times: string[]) => {
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();
  let best = 0;
  times.forEach((x, i) => {
    if (Math.abs(toMin(x) - now) < Math.abs(toMin(times[best]) - now)) best = i;
  });
  return best;
};

if (native) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

async function scheduleReminders(prayers: Prayer[], s: Settings) {
  if (!native) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!s.remind) return;
  await Notifications.requestPermissionsAsync();
  for (const [i, time] of s.times.entries()) {
    const [hour, minute] = time.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) continue;
    const titles = forSlot(prayers, i, s.times.length).map((p) => p.title).join(', ');
    await Notifications.scheduleNotificationAsync({
      content: { title: t.remind(i + 1, s.times.length), body: titles || t.timeToPray },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  }
}

export default function App() {
  const [prayers, setPrayers] = useState<Prayer[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [notes, setNotes] = useState<Note[]>([]); // newest first
  const [log, setLog] = useState<string[]>([]); // 'YYYY-MM-DD' per finished prayer session
  const [loaded, setLoaded] = useState(false);
  t = STR[settings.lang] ?? STR.en;
  const sys = useColorScheme();
  const mode = settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : sys === 'dark' ? 'dark' : 'light';
  c = mode === 'dark' ? DARK : LIGHT;
  s = STYLES[mode];
  // Native window behind the app; otherwise it shows white during screen transitions.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [mode]);
  dateFmt = settings.dateFmt;

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        setPrayers(data.prayers ?? []);
        const old = data.settings ?? {};
        // Older versions stored a single soundUri.
        const sounds = old.sounds ?? (old.soundUri ? [{ uri: old.soundUri, name: old.soundName ?? 'Music' }] : []);
        setSettings({ ...DEFAULTS, ...old, sounds, music: old.music ?? old.soundUri });
        setLog(data.log ?? []);
        setNotes(data.notes ?? []);
      }
      setLoaded(true);
      if (native) {
        // Expo Go can reject some notification calls; don't let that block the rest.
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.HIGH,
          }).catch(() => {});
        }
        await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ prayers, settings, log, notes }));
  }, [prayers, settings, log, notes, loaded]);

  useEffect(() => {
    if (loaded) scheduleReminders(prayers, settings).catch(() => {});
  }, [prayers, settings, loaded]);

  const nav = useNavigationContainerRef<any>();
  const back = () => nav.goBack();
  const go = (sc: Screen) => nav.navigate(sc.name, sc);
  const savePrayer = (p: Prayer) => {
    setPrayers((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [p, ...ps]));
  };
  const deletePrayer = (id: string) => {
    setPrayers((ps) => ps.filter((x) => x.id !== id));
    back();
  };
  const icons = () => (
    <View style={[s.row, { gap: 18, paddingRight: native ? 0 : 16 }]}>
      <IconBtn name="calendar-outline" onPress={() => go({ name: 'calendar' })} />
      <IconBtn name="settings-outline" onPress={() => go({ name: 'settings' })} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <NavigationContainer ref={nav} onStateChange={closePicker} theme={{ ...(mode === 'dark' ? DarkTheme : DefaultTheme), colors: { ...(mode === 'dark' ? DarkTheme : DefaultTheme).colors, background: c.bg, card: c.bg } }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerTintColor: c.link,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.bg },
          headerTitleStyle: { color: c.heading },
          contentStyle: { backgroundColor: c.bg },
          headerBackButtonDisplayMode: 'minimal',
          // Android's default zoom and plain slide flash white; the iOS-style slide keeps the previous screen visible.
          animation: Platform.OS === 'android' ? 'ios_from_right' : 'default',
        }}
      >
        <Stack.Screen
          name="list"
          options={{
            title: 'All The Time',
            headerRight: icons,
          }}
        >
          {() => (
            <ListScreen
              prayers={prayers}
              notes={notes}
              done={log.filter((d) => d === today()).length}
              perDay={settings.times.length}
              go={go}
              onAddNote={(text) => setNotes((ns) => [{ id: String(Date.now()), at: `${today()} ${nowTime()}`, text }, ...ns])}
              onDeleteNote={(id) => setNotes((ns) => ns.filter((n) => n.id !== id))}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="edit" options={{ title: '' }}>
          {({ route }) => {
            const params = route.params as { id?: string; note?: Note } | undefined;
            return (
            <EditScreen
              initial={prayers.find((p) => p.id === params?.id)}
              fromNote={params?.note}
              people={[...new Set(prayers.map((p) => p.person.trim()).filter(Boolean))].sort()}
              onSave={(p) => {
                savePrayer(p);
                // A converted quick prayer moves into the list once the prayer is saved.
                if (params?.note) setNotes((ns) => ns.filter((n) => n.id !== params.note!.id));
              }}
              onDelete={deletePrayer}
              onBack={back}
            />
            );
          }}
        </Stack.Screen>
        <Stack.Screen name="pray" options={{ title: t.prayNow }}>
          {() => <PrayScreen prayers={prayers} settings={settings} onPrefs={(x) => setSettings((v) => ({ ...v, ...x }))} onDone={() => setLog((l) => [...l, today()])} />}
        </Stack.Screen>
        <Stack.Screen name="calendar" options={{ title: t.calendar }}>
          {() => <CalendarScreen prayers={prayers} notes={notes} log={log} perDay={settings.times.length} onBack={back} />}
        </Stack.Screen>
        <Stack.Screen name="settings" options={{ title: t.settings }}>
          {() => (
            <SettingsScreen
              initial={settings}
              onSave={setSettings}
              onBack={back}
              onExport={() => exportBackup({ prayers, notes, log, settings })}
              onImport={async () => {
                const b = await pickBackup();
                if (!b) return;
                return new Promise<Settings | undefined>((done) =>
                  ask(t.restoreQ, t.restore, () => {
                    setPrayers(b.prayers);
                    setNotes(b.notes ?? []);
                    setLog(b.log ?? []);
                    // Keep this device's music list; backups don't carry the files.
                    done({ ...DEFAULTS, ...b.settings, sounds: settings.sounds, music: settings.music });
                  }),
                );
              }}
              onSample={() => {
                setPrayers((ps) => [...SAMPLE, ...ps.filter((p) => !p.id.startsWith('sample'))]);
                setLog(sampleLog());
                back();
              }}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
    <PickerHost />
    <ThemeFade mode={mode} />
    <Splash ready={loaded} />
    </View>
  );
}

function ListScreen({ prayers, notes, done, perDay, go, onAddNote, onDeleteNote }: {
  prayers: Prayer[];
  notes: Note[];
  done: number; // prayer sessions finished today
  perDay: number;
  go: (s: Screen) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  const [tab, setTab] = useState<'praying' | 'answered' | 'notes'>('praying');
  const [draft, setDraft] = useState('');
  const shown = prayers.filter((p) => !!p.answer === (tab === 'answered'));
  const send = () => {
    if (!draft.trim()) return;
    onAddNote(draft.trim());
    setDraft('');
    setTab('notes');
  };
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      {/* ● per finished session today, ○ per remaining */}
      <Btn label={`${t.prayNow}   ${'●'.repeat(Math.min(done, perDay))}${'○'.repeat(Math.max(0, perDay - done))}`} onPress={() => go({ name: 'pray' })} />

      {/* Quick prayer: write what's on your heart right now; the time is recorded automatically. */}
      <View style={[s.input, { padding: 0, overflow: 'hidden' }]}>
        <TextInput
          style={{ padding: 12, fontSize: 15, minHeight: 60, color: c.text }}
          placeholder={t.quickHint}
          placeholderTextColor={c.faint}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        {!!draft.trim() && (
          <Pressable style={s.item} onPress={send}>
            <Text style={s.muted}>{nowTime()}</Text>
            <Text style={s.link}>{t.quickSend}</Text>
          </Pressable>
        )}
      </View>

      <View style={s.tabs}>
        {[
          { label: t.praying, on: tab === 'praying', press: () => setTab('praying') },
          { label: t.answered, on: tab === 'answered', press: () => setTab('answered') },
          { label: t.quick, on: tab === 'notes', press: () => setTab('notes') },
          { label: t.new, on: false, press: () => go({ name: 'edit' }) },
        ].map((x, i) => (
          <Pressable key={i} style={[s.tab, x.on && s.tabOn]} onPress={x.press}>
            <Text style={[s.tabText, x.on && { color: c.onAccent }]}>{x.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'notes' ? (
        <>
          {notes.length === 0 && <Text style={s.muted}>{t.noQuick}</Text>}
          {notes.map((n) => (
            <Pressable
              key={n.id}
              style={s.card}
              onLongPress={() => confirmDel(() => onDeleteNote(n.id))}
            >
              <Text style={s.muted}>{showDate(n.at.slice(0, 10))} {n.at.slice(11)}</Text>
              <Text style={{ color: c.text }}>{n.text}</Text>
              <Pressable onPress={() => go({ name: 'edit', note: n })} hitSlop={6}>
                <Text style={[s.link, { fontSize: 13, marginTop: 4 }]}>{t.toList}</Text>
              </Pressable>
            </Pressable>
          ))}
        </>
      ) : (
        <>
          {shown.length === 0 && <Text style={s.muted}>{t.noPrayers}</Text>}
          {shown.map((p) => (
            <Pressable key={p.id} style={s.card} onPress={() => go({ name: 'edit', id: p.id })}>
              <Text style={s.title}>{p.title}</Text>
              <Text style={s.muted}>
                {p.person ? `${p.person} · ` : ''}
                {t.since(showDate(p.startDate))} · {p.answer ? t.answeredOn(showDate(p.answer.date)) : t.updates(p.updates.length)}
              </Text>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function EditScreen({ initial, fromNote, people, onSave, onDelete, onBack }: {
  initial?: Prayer;
  fromNote?: Note; // quick prayer being turned into a full prayer
  people: string[];
  onSave: (p: Prayer) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}) {
  const [p, setP] = useState<Prayer>(
    initial ?? {
      id: String(Date.now()),
      // A quick prayer's text becomes the title; the person must still be filled in before it's saved.
      title: fromNote?.text ?? '',
      person: '',
      startDate: fromNote ? fromNote.at.slice(0, 10) : today(),
      updates: [],
    },
  );
  const [upd, setUpd] = useState<Entry>({ date: today(), time: nowTime(), text: '' });
  const [ans, setAns] = useState<Entry>(initial?.answer ?? { date: today(), text: '' });
  const [personFocus, setPersonFocus] = useState(false);
  const [personBottom, setPersonBottom] = useState(0);
  const matches = people.filter((n) => n !== p.person.trim() && n.includes(p.person.trim()));

  // Auto-save: every change is stored as soon as the prayer has a title.
  useEffect(() => {
    if (p.title.trim() && (!fromNote || p.person.trim())) onSave({ ...p, answer: ans.text.trim() ? ans : undefined });
  }, [p, ans]);
  const addUpdate = () => {
    if (!upd.text.trim()) return;
    setP({ ...p, updates: [...p.updates, upd] });
    setUpd({ date: today(), time: nowTime(), text: '' });
  };

  return (
    <PageWrap>
      <Field label={t.title} value={p.title} onChange={(title) => setP({ ...p, title })} multiline />
      <PersonField
        label={t.person}
        value={p.person}
        onChange={(person) => setP({ ...p, person })}
        onFocusChange={setPersonFocus}
        onBottom={setPersonBottom}
      />
      <DateField label={t.startDate} value={p.startDate} onChange={(startDate) => setP({ ...p, startDate })} />

      <Text style={s.h2}>{t.along}</Text>
      {p.updates.map((u, i) => (
        <View key={i} style={s.card}>
          <Text style={s.muted}>{showDate(u.date)}{u.time ? ` ${u.time}` : ''}</Text>
          <Text style={{ color: c.text }}>{u.text}</Text>
          <Pressable onPress={() => setP({ ...p, updates: p.updates.filter((_, j) => j !== i) })}>
            <Text style={s.del}>{t.remove}</Text>
          </Pressable>
        </View>
      ))}
      <View style={[s.row, { alignItems: 'flex-start', flexWrap: 'nowrap' }]}>
        <View style={{ flex: 3 }}>
          <DateField label={t.date} value={upd.date} onChange={(date) => setUpd({ ...upd, date })} />
        </View>
        <View style={{ flex: 2 }}>
          <DateField label={t.time} mode="time" value={upd.time ?? nowTime()} onChange={(time) => setUpd({ ...upd, time })} />
        </View>
      </View>
      <Field label={t.updText} value={upd.text} onChange={(text) => setUpd({ ...upd, text })} multiline />
      <Btn label={t.addUpd} small onPress={addUpdate} />

      <Text style={s.h2}>{t.answer}</Text>
      <DateField label={t.ansDate} value={ans.date} onChange={(date) => setAns({ ...ans, date })} />
      <Field label={t.ansText} value={ans.text} onChange={(text) => setAns({ ...ans, text })} multiline />

      {initial && (
        <Btn
          label={t.del}
          small
          onPress={() => confirmDel(() => onDelete(p.id))}
        />
      )}
      {personFocus && matches.length > 0 && (
        <View style={[s.dropdown, { top: personBottom + 4 }]}>
          {matches.map((n, i) => (
            <Pressable key={n} style={[s.item, i === 0 && { borderTopWidth: 0 }]} onPress={() => setP({ ...p, person: n })}>
              <Text style={s.itemValue}>{n}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </PageWrap>
  );
}

function PrayScreen({ prayers, settings, onPrefs, onDone }: {
  prayers: Prayer[];
  settings: Settings;
  onPrefs: (p: Partial<Settings>) => void;
  onDone: () => void;
}) {
  const slot = currentSlot(settings.times);
  const n = settings.times.length;
  const active = prayers.filter((p) => !p.answer);
  const [picked, setPicked] = useState(() => new Set(forSlot(prayers, slot, n).map((p) => p.id)));
  const goal = settings.minutes * 60;
  const [sec, setSec] = useState(0);
  const [running, setRunning] = useState(false);
  const notifId = useRef<string | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const fade = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0); // wall-clock based so time spent in the background still counts
  const reached = useRef(false);
  const music = settings.sounds.find((x) => x.uri === settings.music);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    setSrc(undefined);
    if (music) resolveUri(music.uri).then(setSrc).catch(() => {});
  }, [music?.uri]);

  // Starts (or resumes) the chosen music, raising the volume gradually.
  const playMusic = () => {
    if (!src) return;
    if (!player.current) {
      player.current = createAudioPlayer({ uri: src });
      player.current.loop = true;
      player.current.volume = 0;
    }
    player.current.play();
    if (fade.current) clearInterval(fade.current);
    fade.current = setInterval(() => {
      const pl = player.current;
      if (!pl || pl.volume >= 1) return fade.current && clearInterval(fade.current);
      pl.volume = Math.min(1, pl.volume + 0.025); // 0 → 1 over 20s
    }, 500);
  };
  const stopMusic = () => {
    if (fade.current) clearInterval(fade.current);
    player.current?.remove();
    player.current = null;
  };
  const cancelNotif = () => {
    if (notifId.current) Notifications.cancelScheduledNotificationAsync(notifId.current);
    notifId.current = null;
  };

  useEffect(() => {
    if (!running) return;
    // Keep the screen on so the music can play in the foreground.
    activateKeepAwakeAsync('pray');
    const timer = setInterval(() => setSec(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      deactivateKeepAwake('pray');
    };
  }, [running]);

  useEffect(() => {
    if (sec < goal || !running || reached.current) return;
    reached.current = true;
    notifId.current = null;
    onDone();
    if (settings.musicAt === 'end') playMusic();
  }, [sec, running]);

  useEffect(() => () => {
    stopMusic();
    cancelNotif();
  }, []);

  // Notification covers the goal when the app is in the background (JS timers pause there).
  const start = async () => {
    startedAt.current = Date.now() - sec * 1000;
    setRunning(true);
    if (settings.musicAt === 'start' || sec >= goal) playMusic();
    else if (!native && src && !player.current) {
      playMusic();
      (player.current as AudioPlayer | null)?.pause();
    }
    if (native && settings.endAlert && sec < goal) {
      await Notifications.requestPermissionsAsync().catch(() => {});
      notifId.current = await Notifications.scheduleNotificationAsync({
        content: { title: t.amen, body: t.over, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: goal - sec },
      });
    }
  };
  const pause = () => {
    setRunning(false);
    player.current?.pause();
    cancelNotif();
  };
  const finish = () => {
    setRunning(false);
    cancelNotif();
    // Fade the music out over 2s, then release it.
    if (fade.current) clearInterval(fade.current);
    const pl = player.current;
    player.current = null;
    if (pl) {
      const step = pl.volume / 20;
      const iv = setInterval(() => {
        pl.volume = Math.max(0, pl.volume - step);
        if (pl.volume <= 0 || step === 0) {
          clearInterval(iv);
          pl.remove();
        }
      }, 100);
    }
    reached.current = false;
    setSec(0);
  };
  const toggle = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };
  const clock = (x: number) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.h2}>
        {t.slot(slot + 1, n)} · {settings.times[slot]}
      </Text>
      <Text style={[s.timer, sec >= goal && { color: c.gold }]}>{clock(sec)}</Text>
      <Text style={[s.muted, { textAlign: 'center', marginTop: -8 }]}>/ {clock(goal)}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* Equal fixed halves so the buttons don't resize when labels change. */}
        <View style={s.half}>
          {running ? <Btn label={t.pause} onPress={pause} /> : <Btn label={sec ? t.resume : t.start} onPress={start} />}
        </View>
        <View style={s.half}>
          <Btn label={t.finish} onPress={finish} />
        </View>
      </View>

      <View style={s.group}>
        <Choice
          label={t.music}
          value={settings.music ?? ''}
          options={[['', t.noSound], ...settings.sounds.map((x) => [x.uri, x.name] as [string, string])]}
          onChange={(m) => {
            stopMusic();
            onPrefs({ music: m || undefined });
          }}
        />
        <Choice
          label={t.musicAt}
          value={settings.musicAt}
          options={[['end', t.atEnd(settings.minutes)], ['start', t.atStart]]}
          onChange={(musicAt) => onPrefs({ musicAt })}
        />
      </View>

      <Text style={s.h2}>{t.prayThese}</Text>
      {active.length === 0 && <Text style={s.muted}>{t.addFirst}</Text>}
      {active.map((p) => {
        const last = p.updates[p.updates.length - 1];
        const on = picked.has(p.id);
        return (
          <Pressable key={p.id} style={[s.card, !on && s.dim]} onPress={() => toggle(p.id)}>
            <Text style={s.title}>
              {on ? '● ' : '○ '}
              {p.title}
            </Text>
            {!!p.person && <Text style={s.muted}>{p.person}</Text>}
            {on && last && (
              <Text style={s.muted}>
                {t.last}: {showDate(last.date)} — {last.text}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function CalendarScreen({ prayers, notes, log, perDay, onBack }: {
  prayers: Prayer[];
  notes: Note[];
  log: string[];
  perDay: number;
  onBack: () => void;
}) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [sel, setSel] = useState(today());
  const key = (d: number) => `${ym.y}-${pad(ym.m)}-${pad(d)}`;
  const shift = (n: number) => {
    const d = new Date(ym.y, ym.m - 1 + n, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };
  const count: Record<string, number> = {};
  log.forEach((d) => (count[d] = (count[d] ?? 0) + 1));
  const events = (day: string) =>
    prayers.flatMap((p) => [
      ...(p.startDate === day ? [{ kind: t.started, p, text: '' }] : []),
      ...p.updates.filter((u) => u.date === day).map((u) => ({ kind: t.along, p, text: u.text })),
      ...(p.answer?.date === day ? [{ kind: t.answered, p, text: p.answer.text }] : []),
    ]);
  const lead = new Date(ym.y, ym.m - 1, 1).getDay();
  const cells = [...Array(lead).fill(0), ...range(1, new Date(ym.y, ym.m, 0).getDate())];
  const selEvents = events(sel);
  const notesOn = (day: string) => notes.filter((n) => n.at.startsWith(day));
  const selNotes = notesOn(sel);

  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.row}>
        <Pressable onPress={() => shift(-1)} hitSlop={10}><Text style={s.step}>‹</Text></Pressable>
        <Text style={s.h2}>{t.month(ym.y, ym.m)}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={10}><Text style={s.step}>›</Text></Pressable>
      </View>
      <View style={s.group}>
        <View style={s.calRow}>
          {t.week.map((w) => <Text key={w} style={[s.calCell, s.muted]}>{w}</Text>)}
        </View>
        <View style={s.calRow}>
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={s.calCell} />;
            const k = key(d);
            const n = count[k] ?? 0;
            const ev = events(k);
            return (
              <Pressable key={k} style={[s.calCell, k === sel && s.calSel]} onPress={() => setSel(k)}>
                <Text style={[{ color: c.text }, k === today() && { fontWeight: '700', color: c.link }]}>{d}</Text>
                <Text style={s.calDots}>{'●'.repeat(Math.min(n, perDay))}</Text>
                <Text style={s.calMark}>{ev.some((e) => e.kind === t.answered) ? '★' : ev.length || notesOn(k).length ? '•' : ' '}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={s.h2}>{showDate(sel)}</Text>
      <Text style={s.muted}>{t.prayed(count[sel] ?? 0, perDay)}</Text>
      {selEvents.length === 0 && selNotes.length === 0 && !count[sel] && <Text style={s.muted}>{t.nothing}</Text>}
      {selNotes.map((n) => (
        <View key={n.id} style={s.card}>
          <Text style={s.muted}>{t.quick} · {n.at.slice(11)}</Text>
          <Text style={{ color: c.text }}>{n.text}</Text>
        </View>
      ))}
      {selEvents.map((e, i) => (
        <View key={i} style={s.card}>
          <Text style={s.muted}>{e.kind}{e.p.person ? ` · ${e.p.person}` : ''}</Text>
          <Text style={s.title}>{e.p.title}</Text>
          {!!e.text && <Text style={{ color: c.text }}>{e.text}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

function SettingsScreen({ initial, onSave, onBack, onSample, onExport, onImport }: {
  initial: Settings;
  onSave: (s: Settings) => void;
  onBack: () => void;
  onSample: () => void;
  onExport: () => void;
  onImport: () => Promise<Settings | undefined>;
}) {
  const [v, setV] = useState(initial);
  // Auto-apply every change; times are sorted when leaving so rows don't jump while editing.
  const latest = useRef(v);
  latest.current = v;
  useEffect(() => onSave(v), [v]);
  useEffect(() => () => onSave({ ...latest.current, times: [...latest.current.times].sort() }), []);
  const pickSound = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: true });
    if (r.canceled) return;
    const added = await Promise.all(
      r.assets.map(async (x) => {
        if (native || !x.file) return { uri: x.uri, name: x.name };
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await idbCall('readwrite', (st) => st.put(x.file!, id));
        return { uri: `idb:${id}`, name: x.name };
      }),
    );
    setV((cur) => ({ ...cur, sounds: [...cur.sounds, ...added] }));
  };
  return (
    <PageWrap>

      <Text style={s.groupTitle}>{t.general}</Text>
      <View style={s.group}>
        <Choice
          label={t.language}
          value={v.lang}
          options={[['en', 'English'], ['ko', '한국어']]}
          onChange={(lang) => setV({ ...v, lang })}
        />
        <View style={s.item}>
          <Text style={s.itemLabel}>{t.theme}</Text>
          <View style={[s.tabs, { borderRadius: 8 }]}>
            {(['system', 'light', 'dark'] as const).map((k) => (
              <Pressable key={k} style={[s.seg, v.theme === k && s.tabOn]} onPress={() => setV({ ...v, theme: k })}>
                <Text style={[s.tabText, { fontSize: 13 }, v.theme === k && { color: c.onAccent }]}>{t[k]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Choice
          label={t.dateFmt}
          value={v.dateFmt}
          options={DATE_FMTS.map((f) => [f, showDate(today(), f)] as [DateFmt, string])}
          onChange={(dateFmt) => setV({ ...v, dateFmt })}
        />
      </View>

      <Text style={s.groupTitle}>{t.times}</Text>
      <View style={s.group}>
        {native && (
          <>
            <View style={s.item}>
              <Text style={s.itemLabel}>{t.reminders}</Text>
              <Switch value={v.remind} onValueChange={(remind) => setV({ ...v, remind })} trackColor={{ true: c.accent }} />
            </View>
            <View style={s.item}>
              <Text style={s.itemLabel}>{t.endAlert}</Text>
              <Switch value={v.endAlert} onValueChange={(endAlert) => setV({ ...v, endAlert })} trackColor={{ true: c.accent }} />
            </View>
          </>
        )}
        {v.times.map((time, i) => (
          <DateField
            key={i}
            compact
            mode="time"
            label={t.prayer(i + 1)}
            value={time}
            onChange={(x) => setV({ ...v, times: v.times.map((y, j) => (j === i ? x : y)) })}
            onRemove={v.times.length > 1 ? () => setV({ ...v, times: v.times.filter((_, j) => j !== i) }) : undefined}
          />
        ))}
        <Pressable style={s.item} onPress={() => setV({ ...v, times: [...v.times, '18:00'] })}>
          <Text style={s.link}>{t.addTime}</Text>
        </Pressable>
        <View style={s.item}>
          <Text style={s.itemLabel}>{t.minutes}</Text>
          <View style={[s.row, { gap: 14 }]}>
            <Pressable onPress={() => setV({ ...v, minutes: Math.max(1, v.minutes - 1) })}>
              <Text style={s.step}>−</Text>
            </Pressable>
            <Text style={s.itemValue}>{t.min(v.minutes)}</Text>
            <Pressable onPress={() => setV({ ...v, minutes: Math.min(60, v.minutes + 1) })}>
              <Text style={s.step}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Text style={s.groupTitle}>{t.musicList}</Text>
      <View style={s.group}>
        {v.sounds.map((x) => (
          <View key={x.uri} style={s.item}>
            <Text style={[s.itemLabel, { flexShrink: 1 }]} numberOfLines={1}>{x.name}</Text>
            <Pressable
              onPress={() => {
                if (x.uri.startsWith('idb:')) idbCall('readwrite', (st) => st.delete(x.uri.slice(4))).catch(() => {});
                setV({ ...v, sounds: v.sounds.filter((y) => y.uri !== x.uri), music: v.music === x.uri ? undefined : v.music });
              }}
              hitSlop={8}
            >
              <Text style={s.del}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={s.item} onPress={pickSound}>
          <Text style={s.link}>{t.addMusic}</Text>
        </Pressable>
      </View>

      <Text style={s.groupTitle}>{t.backup}</Text>
      <View style={s.group}>
        <Pressable style={s.item} onPress={onExport}>
          <Text style={s.link}>{t.exportData}</Text>
        </Pressable>
        <Pressable
          style={s.item}
          onPress={async () => {
            const next = await onImport();
            if (next) setV(next); // settings screen owns the settings while open
          }}
        >
          <Text style={s.link}>{t.importData}</Text>
        </Pressable>
      </View>
      <Text style={[s.muted, { marginLeft: 4, marginTop: -4 }]}>{t.backupHint}</Text>

      {__DEV__ && <Btn label="Load sample data" small onPress={onSample} />}
    </PageWrap>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={s.item} onPress={() => setOpen(!open)}>
        <Text style={s.itemLabel}>{label}</Text>
        <Text style={s.itemValue}>{options.find((o) => o[0] === value)?.[1]}</Text>
      </Pressable>
      {open &&
        options.map(([k, name]) => (
          <Pressable key={k} style={[s.item, { paddingLeft: 28 }]} onPress={() => { onChange(k); setOpen(false); }}>
            <Text style={k === value ? s.link : s.itemValue}>{name}</Text>
            {k === value && <Text style={s.link}>✓</Text>}
          </Pressable>
        ))}
    </>
  );
}

// Plain input; EditScreen draws the matching-names dropdown over the page so nothing below moves.
function PersonField({ label, value, onChange, onFocusChange, onBottom }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFocusChange: (f: boolean) => void;
  onBottom: (y: number) => void;
}) {
  return (
    <View style={{ gap: 4 }} onLayout={(e) => onBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        onFocus={() => {
          closePicker();
          onFocusChange(true);
        }}
        onBlur={() => onFocusChange(false)}
      />
    </View>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { minHeight: 70 }]}
        value={value}
        onChangeText={onChange}
        onFocus={closePicker}
        multiline={multiline}
      />
    </View>
  );
}

// Own wheels so the order is always Y-M-D / H:M, regardless of platform or device locale.
const ITEM = 40;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function Wheel({ items, value, onChange }: { items: number[]; value: number; onChange: (v: number) => void }) {
  const ref = useRef<ScrollViewInstance>(null);
  const settle = (y: number) => {
    const v = items[Math.min(items.length - 1, Math.max(0, Math.round(y / ITEM)))];
    if (v !== value) onChange(v);
  };
  return (
    <ScrollView
      ref={ref}
      style={{ height: ITEM * 5, flex: 1 }}
      contentContainerStyle={{ paddingVertical: ITEM * 2 }}
      snapToInterval={ITEM}
      decelerationRate="fast"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      onLayout={() => ref.current?.scrollTo({ y: Math.max(0, items.indexOf(value)) * ITEM, animated: false })}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
    >
      {items.map((n) => (
        <View key={n} style={{ height: ITEM, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, color: n === value ? c.heading : c.faint }}>{n < 100 ? pad(n) : n}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// Smooth theme switch: covers the screen with the previous background and fades it out.
// The cover is set during render (not in an effect) so the new colors never flash first.
function ThemeFade({ mode }: { mode: 'light' | 'dark' }) {
  const [st, setSt] = useState<{ mode: string; color: string | null }>({ mode, color: null });
  const op = useRef(new Animated.Value(0)).current;
  if (st.mode !== mode) {
    op.setValue(1);
    setSt({ mode, color: (st.mode === 'dark' ? DARK : LIGHT).bg });
  }
  useEffect(() => {
    if (!st.color) return;
    Animated.timing(op, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => setSt((x) => ({ ...x, color: null })));
  }, [st.color]);
  if (!st.color) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: st.color, opacity: op }]} />;
}

// Launch screen: fades the name in, stays until data is loaded (at least 1.5s), then fades out.
function Splash({ ready }: { ready: boolean }) {
  const [gone, setGone] = useState(false);
  const [minDone, setMinDone] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const text = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(text, { toValue: 1, duration: 700, useNativeDriver: true }).start();
    const timer = setTimeout(() => setMinDone(true), 1500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (ready && minDone) Animated.timing(fade, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => setGone(true));
  }, [ready, minDone]);
  if (gone) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.splash, { opacity: fade }]}>
      <Animated.View style={{ opacity: text, alignItems: 'center' }}>
        <Text style={{ fontSize: 32, fontWeight: '700', color: c.heading }}>All The Time</Text>
      </Animated.View>
    </Animated.View>
  );
}

// One shared wheel sheet at the bottom of the screen. It has no backdrop, so tapping another
// field switches to it directly; tapping empty page space (see PageWrap) closes it.
type PickerReq = { key: string; label: string; mode: 'date' | 'time'; value: string; onChange: (v: string) => void };
let setPicker: (r: PickerReq | null) => void = () => {};
const closePicker = () => setPicker(null);

function PickerHost() {
  const [req, setReq] = useState<PickerReq | null>(null);
  setPicker = setReq;
  useEffect(() => {
    if (!req) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (setReq(null), true));
    return () => sub.remove();
  }, [!!req]);
  if (!req) return null;
  const change = (v: string) => {
    req.onChange(v);
    setReq({ ...req, value: v });
  };
  const now = new Date();
  let cols: { items: number[]; value: number; set: (n: number) => void }[];
  if (req.mode === 'time') {
    const [h = 0, m = 0] = req.value.split(':').map(Number);
    cols = [
      { items: range(0, 23), value: h, set: (n) => change(`${pad(n)}:${pad(m)}`) },
      { items: range(0, 59), value: m, set: (n) => change(`${pad(h)}:${pad(n)}`) },
    ];
  } else {
    const [y = now.getFullYear(), mo = 1, da = 1] = req.value.split('-').map(Number);
    const ymd = (a: number, b: number, c: number) => `${a}-${pad(b)}-${pad(Math.min(c, new Date(a, b, 0).getDate()))}`;
    const Y = { items: range(2000, now.getFullYear() + 5), value: y, set: (n: number) => change(ymd(n, mo, da)) };
    const M = { items: range(1, 12), value: mo, set: (n: number) => change(ymd(y, n, da)) };
    const D = { items: range(1, new Date(y, mo, 0).getDate()), value: da, set: (n: number) => change(ymd(y, mo, n)) };
    cols = dateFmt === 'mdy' ? [M, D, Y] : dateFmt === 'dmy' ? [D, M, Y] : [Y, M, D];
  }
  return (
    <View style={s.sheet}>
      <View style={s.row}>
        <Text style={s.itemLabel}>{req.label}</Text>
        <Pressable onPress={closePicker} hitSlop={10}>
          <Text style={s.link}>{t.done}</Text>
        </Pressable>
      </View>
      <View key={req.key} style={s.wheels}>
        <View style={s.wheelBand} pointerEvents="none" />
        {cols.map((col, i) => (
          <Wheel key={i} items={col.items} value={col.value} onChange={col.set} />
        ))}
      </View>
    </View>
  );
}

// Page body for screens with pickers: empty-space taps close the sheet; extra bottom room so
// fields near the end can scroll above it.
function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <Pressable style={[s.page, { flexGrow: 1, paddingBottom: 320 }]} onPress={closePicker}>
        {children}
      </Pressable>
    </ScrollView>
  );
}

function DateField({ label, value, onChange, mode = 'date', compact, onRemove }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mode?: 'date' | 'time';
  compact?: boolean; // one-line settings row
  onRemove?: () => void;
}) {
  const key = useRef(String(Math.random())).current;
  const open = () => setPicker({ key, label, mode, value, onChange });
  const shown = mode === 'date' ? showDate(value) : value;
  return (
    <View style={{ gap: compact ? 0 : 4 }}>
      {compact ? (
        <Pressable style={s.item} onPress={open}>
          <Text style={s.itemLabel}>{label}</Text>
          <View style={[s.row, { gap: 14 }]}>
            <Text style={s.itemValue}>{shown}</Text>
            {onRemove && (
              <Pressable onPress={onRemove} hitSlop={8}>
                <Text style={s.del}>✕</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      ) : (
        <>
          <Text style={s.label}>{label}</Text>
          <Pressable style={s.input} onPress={open}>
            <Text style={{ fontSize: 15, color: c.text }}>{shown}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function IconBtn({ name, onPress }: { name: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Ionicons name={name} size={26} color={c.link} />
    </Pressable>
  );
}

function Btn({ label, onPress, small, active }: { label: string; onPress: () => void; small?: boolean; active?: boolean }) {
  return (
    <Pressable style={[s.btn, small && s.btnSmall, active === false && s.btnOff]} onPress={onPress}>
      <Text style={[s.btnText, active === false && { color: c.link }]}>{label}</Text>
    </Pressable>
  );
}

type Palette = typeof LIGHT;
const LIGHT = {
  bg: '#f7f5f0', card: '#fff', text: '#222', heading: '#2f3e33', muted: '#777', label: '#555', faint: '#bbb',
  border: '#e2ded5', accent: '#4a5d4f', onAccent: '#fff', soft: '#efece5', gold: '#c9a227', del: '#b33', link: '#4a5d4f',
};
// Calm dark blue: muted navy button fills (not an inverted bright accent), soft blue-gray for text links.
const DARK: Palette = {
  bg: '#11141a', card: '#1a1f27', text: '#e4e6ea', heading: '#e4e6ea', muted: '#8a919c', label: '#a1a8b3', faint: '#4a515c',
  border: '#272d37', accent: '#2e3f57', onAccent: '#e4e6ea', soft: '#222833', gold: '#c9a75a', del: '#d27a7a', link: '#9fb4d0',
};
let c = LIGHT;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  page: { padding: 20, paddingTop: 8, gap: 12, paddingBottom: 60 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  h1: { fontSize: 28, fontWeight: '700', color: c.heading },
  h2: { fontSize: 18, fontWeight: '600', color: c.heading, marginTop: 12 },
  title: { fontSize: 16, fontWeight: '600', color: c.text },
  muted: { color: c.muted, fontSize: 13 },
  label: { color: c.label, fontSize: 13 },
  del: { color: c.del, fontSize: 12, marginTop: 4 },
  card: { backgroundColor: c.card, borderRadius: 12, padding: 14, gap: 4 },
  dim: { opacity: 0.5 },
  input: { backgroundColor: c.card, color: c.text, borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: c.border },
  btn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', flexGrow: 1 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, flexGrow: 0 },
  btnOff: { backgroundColor: c.border },
  btnText: { color: c.onAccent, fontWeight: '600' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.bg, padding: 16, paddingBottom: 36, gap: 12,
    borderTopLeftRadius: 16, borderTopRightRadius: 16, elevation: 12,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: -3 },
  },
  wheels: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 10 },
  wheelBand: { position: 'absolute', left: 8, right: 8, top: ITEM * 2, height: ITEM, borderRadius: 8, backgroundColor: c.soft },
  groupTitle: { color: c.muted, fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: -4, marginLeft: 4 },
  group: { backgroundColor: c.card, borderRadius: 12, overflow: 'hidden' },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border,
  },
  itemLabel: { fontSize: 15, color: c.text },
  itemValue: { fontSize: 15, color: c.muted },
  link: { fontSize: 15, color: c.link, fontWeight: '600' },
  step: { fontSize: 22, color: c.link, paddingHorizontal: 4 },
  calRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 },
  calCell: { width: '14.28%', alignItems: 'center', paddingVertical: 6, textAlign: 'center' },
  calSel: { backgroundColor: c.soft, borderRadius: 8 },
  calDots: { color: c.link, fontSize: 7, height: 10 },
  calMark: { color: c.gold, fontSize: 10, height: 12 },
  half: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  dropdown: {
    position: 'absolute', left: 20, right: 20, backgroundColor: c.card, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: c.border, elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  splash: { backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  seg: { paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  tabs: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', backgroundColor: c.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabOn: { backgroundColor: c.accent },
  tabText: { color: c.link, fontWeight: '600' },
  timer: { fontSize: 72, fontWeight: '200', textAlign: 'center', color: c.heading },
});
const STYLES = { light: makeStyles(LIGHT), dark: makeStyles(DARK) };
let s = STYLES.light;
