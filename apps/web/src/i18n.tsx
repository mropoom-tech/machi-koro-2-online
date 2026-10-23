import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cardName, getCard, t as engineT, type CardSymbol, type Lang, type MsgParams } from '@mk2/game-engine';

type P = Record<string, string | number>;
type Entry = { th: string | ((p: P) => string); en: string | ((p: P) => string) };

// UI strings. Game log / server errors / notices live in packages/game-engine/src/i18n.ts.
const UI = {
  // common
  you: { th: 'คุณ', en: 'you' },
  cancel: { th: 'ยกเลิก', en: 'Cancel' },
  back_home: { th: 'กลับหน้าแรก', en: 'Back to home' },
  host: { th: '👑 หัวห้อง', en: '👑 Host' },
  online: { th: 'ออนไลน์', en: 'Online' },
  offline: { th: 'ออฟไลน์', en: 'Offline' },
  demo_badge_title: {
    th: 'จำนวนสำเนาการ์ดยังไม่ได้รับการยืนยันจาก Rulebook — ใช้เพื่อทดสอบระบบเท่านั้น',
    en: 'Card copy counts are not verified against the rulebook — for testing only',
  },
  language: { th: 'ภาษา', en: 'Language' },
  // landing
  tagline: { th: 'สร้างเมืองในฝัน เล่นออนไลน์กับเพื่อน 2–5 คน', en: 'Build your dream city — play online with 2–5 friends' },
  create_room: { th: 'สร้างห้อง', en: 'Create room' },
  join_room: { th: 'เข้าร่วมห้อง', en: 'Join room' },
  nickname: { th: 'ชื่อเล่น', en: 'Nickname' },
  nickname_ph: { th: 'เช่น ต้นกล้า', en: 'e.g. Sam' },
  room_code: { th: 'รหัสห้อง', en: 'Room code' },
  working: { th: 'กำลังดำเนินการ…', en: 'Working…' },
  create_new_room: { th: 'สร้างห้องใหม่', en: 'Create new room' },
  join: { th: 'เข้าร่วม', en: 'Join' },
  watch: { th: '👁️ เข้าชม', en: '👁️ Watch' },
  watch_hint: { th: 'เข้าชมได้ทุกเมื่อ แม้เกมเริ่มไปแล้ว', en: 'You can watch any time, even after the game starts' },
  spectators_count: { th: (p) => `ผู้ชม (${p.n})`, en: (p) => `Spectators (${p.n})` },
  spectator: { th: 'ผู้ชม', en: 'Spectator' },
  spectating: { th: '👁️ กำลังชม', en: '👁️ Watching' },
  add_bot: { th: '🤖 เพิ่มบอท', en: '🤖 Add bot' },
  bot: { th: 'บอท', en: 'Bot' },
  move_to_spectator: { th: '👁️ ย้ายไปเป็นผู้ชม', en: '👁️ Move to spectators' },
  move_to_player: { th: '🎲 กลับไปเป็นผู้เล่น', en: '🎲 Join as a player' },
  no_signup: { th: 'ไม่ต้องสมัครสมาชิก ใช้แค่ชื่อเล่น', en: 'No sign-up — just a nickname' },
  bad_code_format: { th: 'รหัสห้องต้องเป็นตัวอักษร/ตัวเลข 5 ตัว', en: 'Room code must be 5 letters/digits' },
  net_error: { th: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', en: "Can't reach the server" },
  generic_error: { th: 'เกิดข้อผิดพลาด', en: 'Something went wrong' },
  // lobby
  lobby_title: { th: 'ห้องรอเล่น', en: 'Lobby' },
  copied: { th: 'คัดลอกแล้ว ✓', en: 'Copied ✓' },
  copy_invite: { th: '🔗 คัดลอกลิงก์เชิญ', en: '🔗 Copy invite link' },
  players_count: { th: (p) => `ผู้เล่น (${p.n}/${p.max})`, en: (p) => `Players (${p.n}/${p.max})` },
  empty_seat: { th: 'ว่าง', en: 'Empty' },
  confirm_host: { th: 'ยืนยันมอบ', en: 'Confirm' },
  confirm_kick: { th: 'ยืนยันเชิญออก', en: 'Confirm kick' },
  make_host: { th: 'มอบหัวห้อง', en: 'Make host' },
  kick: { th: 'เชิญออก', en: 'Kick' },
  kick_aria: { th: (p) => `เชิญ ${p.name} ออกจากห้อง`, en: (p) => `Kick ${p.name}` },
  start_game: { th: 'เริ่มเกม', en: 'Start game' },
  need_players: { th: (p) => `รอผู้เล่นอย่างน้อย ${p.n} คน`, en: (p) => `Waiting for at least ${p.n} players` },
  wait_host: { th: 'รอหัวห้องเริ่มเกม…', en: 'Waiting for the host to start…' },
  leave_room: { th: '🚪 ออกจากห้อง', en: '🚪 Leave room' },
  host_leave_hint: { th: 'ถ้าหัวห้องออก ตำแหน่งจะโอนให้ผู้เล่นคนถัดไปอัตโนมัติ', en: 'If the host leaves, the host role passes to the next player' },
  // connection / room screen
  reconnecting: { th: 'กำลังเชื่อมต่อใหม่…', en: 'Reconnecting…' },
  entering_room: { th: 'กำลังเข้าห้อง…', en: 'Joining room…' },
  wait_reconnect: { th: 'กำลังเชื่อมต่อใหม่ กรุณารอสักครู่', en: 'Reconnecting, please wait' },
  fatal_kicked: { th: 'หัวห้องเชิญคุณออกจากห้องแล้ว', en: 'The host removed you from the room' },
  fatal_removed: { th: 'คุณถูกนำออกจากเกมเนื่องจากหลุดการเชื่อมต่อ', en: 'You were removed from the game for being disconnected' },
  fatal_expired: { th: 'ห้องหมดอายุแล้ว', en: 'This room has expired' },
  leave_game_q: { th: 'ออกจากเกม?', en: 'Leave the game?' },
  leave_game_body: {
    th: 'ออกชั่วคราว: ที่นั่งยังอยู่ กลับมาเล่นต่อได้ด้วยลิงก์ห้องเดิมบนอุปกรณ์นี้ (ถ้าไม่กลับมา เทิร์นของคุณจะถูกข้าม และถูกนำออกเมื่อข้ามครบ 3 เทิร์น)',
    en: 'Leaving temporarily keeps your seat — come back with the same room link on this device. (If you don’t return, your turns are skipped and you are removed after 3 skips.)',
  },
  keep_playing: { th: 'เล่นต่อ', en: 'Keep playing' },
  leave_temp: { th: 'ออกชั่วคราว', en: 'Leave for now' },
  forfeit_link: { th: '🏳️ ยอมแพ้และออกจากเกมถาวร', en: '🏳️ Forfeit and leave for good' },
  forfeit_q: { th: 'ยอมแพ้?', en: 'Forfeit?' },
  forfeit_body: {
    th: 'การ์ดทั้งหมดของคุณจะออกจากเกม เหรียญคืนธนาคาร และกลับเข้าเกมนี้ไม่ได้อีก',
    en: 'All your cards leave the game, your coins go back to the bank, and you can’t rejoin this game.',
  },
  forfeit_last: { th: ' — เหลือผู้เล่นอีกคนเดียว เขาจะชนะทันที', en: ' — only one player would remain, and they win immediately.' },
  go_back: { th: 'ย้อนกลับ', en: 'Go back' },
  confirm_forfeit: { th: 'ยืนยันยอมแพ้', en: 'Forfeit' },
  // board
  row_low: { th: 'กิจการ 1–6', en: 'Establishments 1–6' },
  row_high: { th: 'กิจการ 7–12', en: 'Establishments 7–12' },
  row_landmark: { th: 'แลนด์มาร์ก', en: 'Landmarks' },
  deck_left: { th: (p) => `กองเหลือ ${p.n} ใบ`, en: (p) => `${p.n} left in deck` },
  market_empty: { th: 'ตลาดว่าง', en: 'Market empty' },
  phase_setup: { th: (p) => `ช่วงสร้างเริ่มต้น รอบ ${p.r}/${p.max}`, en: (p) => `Starting builds, round ${p.r}/${p.max}` },
  phase_roll: { th: 'ทอยลูกเต๋า', en: 'Roll dice' },
  phase_choice: { th: 'เลือกความสามารถ', en: 'Choose ability' },
  phase_build: { th: 'สร้างการ์ด', en: 'Build' },
  phase_ended: { th: 'จบเกม', en: 'Game over' },
  phase_rolling: { th: 'กำลังทอยลูกเต๋า…', en: 'Rolling…' },
  turn_n: { th: (p) => `เทิร์น ${p.n}`, en: (p) => `Turn ${p.n}` },
  your_turn: { th: '🎯 ตาของคุณ!', en: '🎯 Your turn!' },
  turn_of: { th: (p) => `ตาของ ${p.name}`, en: (p) => `${p.name}'s turn` },
  not_rolled: { th: 'ยังไม่ได้ทอย', en: 'Not rolled yet' },
  die_aria: { th: (p) => `ลูกเต๋า ${p.n}`, en: (p) => `Die showing ${p.n}` },
  leave: { th: '← ออก', en: '← Leave' },
  leave_aria: { th: 'ออกจากห้อง', en: 'Leave room' },
  room: { th: 'ห้อง', en: 'Room' },
  landmarks_title: { th: 'แลนด์มาร์ก', en: 'Landmarks' },
  skipped_title: { th: 'เทิร์นที่ถูกข้าม', en: 'Skipped turns' },
  landmark_slot: { th: (p) => `แลนด์มาร์ก ${p.n}`, en: (p) => `Landmark ${p.n}` },
  no_establishments: { th: 'ยังไม่มีกิจการ', en: 'No establishments yet' },
  my_city: { th: 'เมืองของฉัน', en: 'My city' },
  other_cities: { th: 'เมืองของผู้เล่นอื่น', en: 'Other cities' },
  city_of: { th: (p) => `เมืองของ ${p.name}`, en: (p) => `${p.name}'s city` },
  event_log: { th: 'บันทึกเหตุการณ์', en: 'Event log' },
  waiting_for: { th: (p) => `รอ ${p.name} ${p.phase}…`, en: (p) => `Waiting for ${p.name}: ${p.phase}…` },
  choose_dice: { th: 'เลือกจำนวนลูกเต๋า', en: 'How many dice?' },
  roll_1: { th: '🎲 ทอย 1 ลูก', en: '🎲 Roll 1 die' },
  roll_2: { th: '🎲🎲 ทอย 2 ลูก', en: '🎲🎲 Roll 2 dice' },
  setup_hint: { th: 'เลือกกิจการเริ่มต้นจากตลาด (ไม่บังคับ)', en: 'Pick a starting establishment from the market (optional)' },
  build_hint: { th: 'แตะการ์ดในตลาดเพื่อสร้าง (เทิร์นละ 1 ใบ)', en: 'Tap a market card to build it (1 per turn)' },
  pass_end: { th: 'ไม่สร้าง · จบเทิร์น', en: 'Build nothing · End turn' },
  waiting_choice: { th: 'กำลังรอการเลือกของคุณ…', en: 'Waiting for your choice…' },
  price_for_you: { th: 'ราคาสำหรับคุณ', en: 'Your price' },
  build_x: { th: (p) => `สร้าง ${p.name}`, en: (p) => `Build ${p.name}` },
  remove_x: { th: (p) => `🚪 นำ ${p.name} ออกจากเกม (หลุดการเชื่อมต่อ)`, en: (p) => `🚪 Remove ${p.name} from the game (disconnected)` },
  remove_q: { th: (p) => `นำ ${p.name} ออกจากเกม?`, en: (p) => `Remove ${p.name} from the game?` },
  remove_body: {
    th: 'กิจการและแลนด์มาร์กทั้งหมดของผู้เล่นนี้จะออกจากเกม เหรียญคืนธนาคาร และกลับเข้าเกมนี้ไม่ได้อีก',
    en: 'All of this player’s establishments and landmarks leave the game, their coins go back to the bank, and they can’t rejoin.',
  },
  remove_last: { th: ' — เหลือผู้เล่นคนเดียว เกมจะจบและผู้เล่นที่เหลือชนะ', en: ' — only one player would remain, so the game ends and they win.' },
  remove: { th: 'นำออก', en: 'Remove' },
  you_win: { th: 'คุณชนะ!', en: 'You win!' },
  view_details: { th: 'ดูรายละเอียด', en: 'View details' },
  all_cities: { th: 'ภาพรวมทุกเมือง', en: 'All cities' },
  show_result: { th: 'ดูผลการแข่งขัน', en: 'Show result' },
  x_wins: { th: (p) => `${p.name} ชนะ!`, en: (p) => `${p.name} wins!` },
  // offline banner
  offline_banner: { th: (p) => `${p.name} หลุดการเชื่อมต่อ`, en: (p) => `${p.name} is disconnected` },
  auto_skip_in: { th: (p) => ` — จะข้ามเทิร์นอัตโนมัติใน ${p.n} วินาที`, en: (p) => ` — their turn will be skipped in ${p.n}s` },
  missed_info: {
    th: (p) => `ถูกข้ามแล้ว ${p.n}/${p.max} เทิร์นติดกัน — ครบแล้วจะถูกนำออกจากเกมอัตโนมัติ`,
    en: (p) => `Skipped ${p.n}/${p.max} turns in a row — removed automatically at ${p.max}`,
  },
  remove_from_game: { th: '🚪 นำออกจากเกม', en: '🚪 Remove from game' },
  skip_now: { th: '⏭️ ข้ามเทิร์นตอนนี้', en: '⏭️ Skip turn now' },
  // choices
  mc_body: {
    th: (p) => `คุณทอยได้แต้มเหมือนกัน ต้องมอบกิจการ 1 ใบให้ ${p.name} (ผู้เล่นทางขวา)`,
    en: (p) => `You rolled doubles — give 1 establishment to ${p.name} (the player on your right)`,
  },
  give_this: { th: 'มอบการ์ดนี้', en: 'Give this card' },
  bc_body: {
    th: 'คุณอาจแลกกิจการของคุณ 1 ใบกับกิจการของผู้เล่นอื่น 1 ใบ',
    en: 'You may exchange 1 of your establishments for 1 an opponent owns',
  },
  bc_step1: { th: '1. เลือกกิจการของคุณที่จะให้', en: '1. Choose one of yours to give' },
  bc_step2: { th: '2. เลือกกิจการที่จะรับ', en: '2. Choose one to take' },
  no_exchange: { th: 'ไม่แลก', en: "Don't exchange" },
  exchange: { th: 'แลกเปลี่ยน', en: 'Exchange' },
  // card detail
  cat_landmark: { th: 'แลนด์มาร์ก', en: 'Landmark' },
  cat_red: { th: 'ร้านอาหาร', en: 'Restaurant' },
  cat_blue: { th: 'อุตสาหกรรมหลัก', en: 'Primary industry' },
  cat_green: { th: 'อุตสาหกรรมรอง', en: 'Secondary industry' },
  cat_purple: { th: 'กิจการขนาดใหญ่', en: 'Major establishment' },
  ongoing: { th: 'ความสามารถต่อเนื่อง', en: 'Ongoing effect' },
  immediate: { th: 'ความสามารถทันที', en: 'Immediate effect' },
  activation: { th: 'เลขเต๋า', en: 'Activates on' },
  symbol: { th: 'สัญลักษณ์', en: 'Symbol' },
  cost: { th: (p) => `ค่าก่อสร้าง: ${p.n} เหรียญ`, en: (p) => `Cost: ${p.n} coins` },
  landmark_costs: { th: (p) => `ค่าก่อสร้าง (แห่งที่ 1/2/3): ${p.c}`, en: (p) => `Cost (1st/2nd/3rd landmark): ${p.c}` },
  all_players: { th: 'มีผลกับผู้เล่นทุกคน', en: 'All players' },
  builder_only: { th: 'เฉพาะผู้สร้าง', en: 'Builder only' },
  condition: { th: 'เงื่อนไข', en: 'Condition' },
  loan_condition: {
    th: 'สร้างได้เมื่อคุณเป็นผู้เล่นคนเดียวที่ยังไม่มีแลนด์มาร์ก',
    en: 'You can only build this when you are the only player with no landmarks',
  },
  copies: { th: (p) => `${p.n} ใบ`, en: (p) => `${p.n} copies` },
  sound_settings: { th: 'ตั้งค่าเสียง', en: 'Sound settings' },
  volume: { th: 'ระดับเสียง', en: 'Volume' },
  volume_up: { th: 'เพิ่มเสียง', en: 'Volume up' },
  volume_down: { th: 'ลดเสียง', en: 'Volume down' },
  mute_all: { th: 'ปิดเสียงทั้งหมด', en: 'Mute all sounds' },
  unmute: { th: 'เปิดเสียงอีกครั้ง', en: 'Unmute' },
  muted: { th: 'ปิดเสียงอยู่', en: 'Muted' },
  test_dice: { th: 'ลองเสียงเต๋า', en: 'Test dice' },
  test_turn: { th: 'ลองเสียงถึงตา', en: 'Test turn' },
  test_coin: { th: 'ลองเสียงเหรียญ', en: 'Test coin' },
  test_build: { th: 'ลองเสียงสร้าง', en: 'Test build' },
  test_landmark: { th: 'ลองเสียงแลนด์มาร์ก', en: 'Test landmark' },
  test_victory: { th: 'ลองเสียงชนะเกม', en: 'Test victory' },
  sfx: { th: 'เสียงเอฟเฟกต์', en: 'Sound effects' },
} satisfies Record<string, Entry>;

export type UiKey = keyof typeof UI;

const SYMBOL: Record<CardSymbol, { th: string; en: string }> = {
  cup: { th: 'ถ้วย', en: 'Cup' }, wheat: { th: 'รวงข้าว', en: 'Wheat' }, fruit: { th: 'ผลไม้', en: 'Fruit' },
  shop: { th: 'ร้านค้า', en: 'Shop' }, flower: { th: 'ดอกไม้', en: 'Flower' }, gear: { th: 'เฟือง', en: 'Gear' },
  tower: { th: 'อาคารเสา', en: 'Major' }, combo: { th: 'คอมโบ (ไม่มีสัญลักษณ์)', en: 'Combo (no symbol)' },
};

const STORAGE_KEY = 'mk2:lang';
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'th' || saved === 'en') return saved;
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith('th') ? 'th' : 'en';
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** UI string */
  u: (key: UiKey, params?: P) => string;
  /** server message key (log, error, notice) */
  m: (key: string, params?: MsgParams) => string;
  card: (id: string) => string;
  effect: (id: string) => string;
  symbol: (s: CardSymbol) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<I18n>(() => {
    document.documentElement.lang = lang;
    return {
      lang,
      setLang,
      u: (key, params = {}) => {
        const e: Entry = UI[key];
        const v = e[lang];
        return typeof v === 'function' ? v(params) : v;
      },
      m: (key, params = {}) => engineT(lang, key, params),
      card: (id) => cardName(id, lang),
      effect: (id) => { const c = getCard(id); return lang === 'th' ? c.effectTh : c.effectEn; },
      symbol: (s) => SYMBOL[s][lang],
    };
  }, [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}

export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, u } = useI18n();
  return (
    <div role="group" aria-label={u('language')}
      className={`inline-flex overflow-hidden rounded-full text-xs font-bold ring-1 ring-current/30 ${className}`}>
      {(['th', 'en'] as Lang[]).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`px-2.5 py-1 transition ${lang === l ? 'bg-white text-teal-900' : 'opacity-70 hover:opacity-100'}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
