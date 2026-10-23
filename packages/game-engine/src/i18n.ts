// Shared TH/EN message catalog. The server stores and sends message *keys* with params
// (log entries, errors, notices); each client renders them in its own language.
import { CARDS } from './cards';

export type Lang = 'th' | 'en';
export const LANGS: Lang[] = ['th', 'en'];
export type MsgParams = Record<string, string | number>;

interface Helpers { card: (id: string | number | undefined) => string; t: (key: string | number | undefined, p?: MsgParams) => string }
type Template = (p: MsgParams, h: Helpers) => string;

const pl = (n: unknown, one: string, many: string) => (Number(n) === 1 ? one : many);

const CATALOG: Record<string, { th: Template; en: Template }> = {
  // ---------------------------------------------------------------- game log
  game_start: {
    th: (p) => `เริ่มเกม! ${p.p} เป็นผู้เล่นคนแรก — ช่วงสร้างกิจการเริ่มต้น ${p.rounds} รอบ`,
    en: (p) => `Game started! ${p.p} goes first — ${p.rounds} rounds of starting builds`,
  },
  setup_done: {
    th: (p) => `จบช่วงเริ่มต้น — เริ่มเทิร์นปกติ ตาของ ${p.p}`,
    en: (p) => `Setup finished — normal turns begin with ${p.p}`,
  },
  pass: { th: (p) => `${p.p} ไม่สร้างอะไรในเทิร์นนี้`, en: (p) => `${p.p} builds nothing this turn` },
  roll: {
    th: (p) => `${p.p} ทอยลูกเต๋า ${p.n} ลูก ได้ ${p.dice}${Number(p.n) > 1 ? ` = ${p.total}` : ''}${p.doubles ? ' (แต้มเหมือนกัน!)' : ''}`,
    en: (p) => `${p.p} rolls ${p.n} ${pl(p.n, 'die', 'dice')}: ${p.dice}${Number(p.n) > 1 ? ` = ${p.total}` : ''}${p.doubles ? ' (doubles!)' : ''}`,
  },
  pay: {
    th: (p, h) => `${h.card(p.card)}: ${p.p} จ่าย ${p.n} เหรียญให้ ${p.q}`,
    en: (p, h) => `${h.card(p.card)}: ${p.p} pays ${p.n} ${pl(p.n, 'coin', 'coins')} to ${p.q}`,
  },
  gain: {
    th: (p, h) => `${h.card(p.card)}${Number(p.x) > 1 ? ` ×${p.x}` : ''}: ${p.p} รับ ${p.n} เหรียญจากธนาคาร`,
    en: (p, h) => `${h.card(p.card)}${Number(p.x) > 1 ? ` ×${p.x}` : ''}: ${p.p} gets ${p.n} ${pl(p.n, 'coin', 'coins')} from the bank`,
  },
  no_income_bonus: {
    th: (p, h) => `${h.card(p.card)}: ${p.p} ไม่ได้รับเหรียญ จึงรับ ${p.n} เหรียญจากธนาคาร`,
    en: (p, h) => `${h.card(p.card)}: ${p.p} received no coins, so gets ${p.n} from the bank`,
  },
  no_build_bonus: {
    th: (p, h) => `${h.card(p.card)}: ${p.p} ไม่ได้สร้างอะไร จึงรับ ${p.n} เหรียญจากธนาคาร`,
    en: (p, h) => `${h.card(p.card)}: ${p.p} built nothing, so gets ${p.n} coins from the bank`,
  },
  extra_turn_next: {
    th: (p, h) => `${h.card(p.card)}: ${p.p} จะได้เล่นเพิ่มอีก 1 เทิร์น`,
    en: (p, h) => `${h.card(p.card)}: ${p.p} will take another turn`,
  },
  extra_turn: { th: (p) => `${p.p} เล่นเทิร์นเพิ่ม`, en: (p) => `${p.p} takes an extra turn` },
  zero_coin: {
    th: (p) => `${p.p} ไม่มีเหรียญเลย จึงรับ 1 เหรียญจากธนาคาร`,
    en: (p) => `${p.p} has no coins, so gets 1 coin from the bank`,
  },
  build: {
    th: (p, h) => `${p.p} สร้าง ${h.card(p.card)} (${p.n} เหรียญ)`,
    en: (p, h) => `${p.p} builds ${h.card(p.card)} (${p.n} ${pl(p.n, 'coin', 'coins')})`,
  },
  build_landmark: {
    th: (p, h) => `${p.p} สร้างแลนด์มาร์ก ${h.card(p.card)} (${p.n} เหรียญ)`,
    en: (p, h) => `${p.p} builds the landmark ${h.card(p.card)} (${p.n} coins)`,
  },
  park: {
    th: (p, h) => `${h.card('park')}: แจกเหรียญใหม่ ทุกคนได้ ${p.n} เหรียญ`,
    en: (p, h) => `${h.card('park')}: coins redistributed — everyone now has ${p.n}`,
  },
  exchange: {
    th: (p, h) => `${p.p} แลก ${h.card(p.give)} กับ ${h.card(p.take)} ของ ${p.q}`,
    en: (p, h) => `${p.p} swaps ${h.card(p.give)} for ${p.q}'s ${h.card(p.take)}`,
  },
  exchange_skip: {
    th: (p, h) => `${p.p} ไม่ใช้ความสามารถ${h.card('business_center')}`,
    en: (p, h) => `${p.p} declines the ${h.card('business_center')} exchange`,
  },
  give: {
    th: (p, h) => `${p.p} มอบ ${h.card(p.card)} ให้ ${p.q} (${h.card('moving_company')})`,
    en: (p, h) => `${p.p} gives ${h.card(p.card)} to ${p.q} (${h.card('moving_company')})`,
  },
  give_auto: {
    th: (p, h) => `${p.p} มอบ ${h.card(p.card)} ให้ ${p.q} (${h.card('moving_company')} — ระบบเลือกให้)`,
    en: (p, h) => `${p.p} gives ${h.card(p.card)} to ${p.q} (${h.card('moving_company')} — chosen automatically)`,
  },
  win: {
    th: (p, h) => `🏆 ${p.p} ชนะเกม! (${h.t(p.reason)})`,
    en: (p, h) => `🏆 ${p.p} wins the game! (${h.t(p.reason)})`,
  },
  reason_three: { th: () => 'สร้างแลนด์มาร์กครบ 3 แห่ง', en: () => 'built 3 landmarks' },
  reason_launch: { th: () => 'สร้างฐานปล่อยจรวดสำเร็จ', en: () => 'built the Launch Pad' },
  reason_last: { th: () => 'ผู้เล่นคนอื่นออกจากเกมทั้งหมด', en: () => 'all other players left' },
  skip_turn: {
    th: (p) => `⏭️ ข้ามเทิร์นของ ${p.p} (หลุดการเชื่อมต่อ)`,
    en: (p) => `⏭️ Skipped ${p.p}'s turn (disconnected)`,
  },
  player_forfeit: {
    th: (p) => `🏳️ ${p.p} ยอมแพ้ — การ์ดทั้งหมดออกจากเกม เหรียญคืนธนาคาร`,
    en: (p) => `🏳️ ${p.p} forfeits — their cards leave the game and coins return to the bank`,
  },
  player_removed: {
    th: (p) => `🚪 ${p.p} ถูกนำออกจากเกม — การ์ดทั้งหมดออกจากเกม เหรียญคืนธนาคาร`,
    en: (p) => `🚪 ${p.p} was removed — their cards leave the game and coins return to the bank`,
  },

  // ---------------------------------------------------------------- notices
  n_new_host: {
    th: (p, h) => `👑 ${p.p} เป็นหัวห้องคนใหม่${p.why ? ` (${h.t(p.why)})` : ''}`,
    en: (p, h) => `👑 ${p.p} is the new host${p.why ? ` (${h.t(p.why)})` : ''}`,
  },
  why_auto: { th: () => 'หัวห้องเดิมหลุดการเชื่อมต่อ', en: () => 'previous host disconnected' },
  why_left: { th: () => 'หัวห้องเดิมออกจากห้อง', en: () => 'previous host left' },
  n_kicked: { th: (p) => `${p.p} ถูกเชิญออกจากห้อง`, en: (p) => `${p.p} was removed from the room` },
  n_forfeit: { th: (p) => `🏳️ ${p.p} ยอมแพ้และออกจากเกม`, en: (p) => `🏳️ ${p.p} forfeited and left the game` },
  n_removed: {
    th: (p, h) => `🚪 ${p.p} ถูกนำออกจากเกม (${h.t(p.reason, p)})`,
    en: (p, h) => `🚪 ${p.p} was removed from the game (${h.t(p.reason, p)})`,
  },
  r_skipped: { th: (p) => `ถูกข้าม ${p.n} เทิร์นติดกัน`, en: (p) => `skipped ${p.n} turns in a row` },
  r_host_removed: { th: () => 'หัวห้องนำออก', en: () => 'removed by the host' },

  // ---------------------------------------------------------------- errors
  err_players_count: { th: (p) => `ต้องมีผู้เล่น ${p.min}–${p.max} คน`, en: (p) => `Needs ${p.min}–${p.max} players` },
  err_not_build_phase: { th: () => 'ยังไม่ถึงช่วงสร้าง', en: () => 'Not the build phase' },
  err_not_your_turn: { th: () => 'ยังไม่ถึงเทิร์นของคุณ', en: () => "It's not your turn" },
  err_one_build: { th: () => 'สร้างได้เทิร์นละ 1 ใบ', en: () => 'Only 1 build per turn' },
  err_not_in_market: { th: () => 'การ์ดนี้ไม่มีในตลาด', en: () => 'This card is not in the market' },
  err_setup_est_only: { th: () => 'ช่วงเริ่มต้นสร้างได้เฉพาะกิจการ', en: () => 'Only establishments during setup' },
  err_have_landmark: { th: () => 'คุณมีแลนด์มาร์กนี้แล้ว', en: () => 'You already own this landmark' },
  err_loan_office: {
    th: () => 'สร้างได้เมื่อคุณเป็นผู้เล่นคนเดียวที่ยังไม่มีแลนด์มาร์ก',
    en: () => 'Only when you are the only player with no landmarks',
  },
  err_no_coins: { th: () => 'เหรียญไม่พอ', en: () => 'Not enough coins' },
  err_game_over: { th: () => 'เกมจบแล้ว', en: () => 'The game is over' },
  err_cannot_roll: { th: () => 'ทอยลูกเต๋าไม่ได้ในช่วงนี้', en: () => "You can't roll now" },
  err_bad_dice: { th: () => 'จำนวนลูกเต๋าไม่ถูกต้อง', en: () => 'Invalid dice' },
  err_cannot_pass: { th: () => 'ยังข้ามไม่ได้ในช่วงนี้', en: () => "You can't pass now" },
  err_no_exchange: { th: () => 'ไม่มีการแลกกิจการที่รอดำเนินการ', en: () => 'No exchange pending' },
  err_bad_target: { th: () => 'เลือกผู้เล่นไม่ถูกต้อง', en: () => 'Invalid player' },
  err_no_card_give: { th: () => 'คุณไม่มีกิจการที่จะแลก', en: () => "You don't own that establishment" },
  err_target_no_card: { th: () => 'ผู้เล่นนั้นไม่มีกิจการนี้', en: () => "That player doesn't own that establishment" },
  err_no_give: { th: () => 'ไม่มีการมอบกิจการที่รอดำเนินการ', en: () => 'No gift pending' },
  err_not_owned: { th: () => 'คุณไม่มีกิจการนี้', en: () => "You don't own that establishment" },
  err_bad_command: { th: () => 'คำสั่งไม่ถูกต้อง', en: () => 'Invalid command' },
  err_need_name: { th: () => 'กรุณาใส่ชื่อเล่น', en: () => 'Please enter a nickname' },
  err_room_not_found: { th: () => 'ไม่พบห้องนี้', en: () => 'Room not found' },
  err_game_started_join: { th: () => 'เกมเริ่มไปแล้ว เข้าร่วมเล่นไม่ได้ (เข้าชมได้)', en: () => 'The game has already started (you can watch)' },
  err_spectators_full: { th: (p) => `ผู้ชมเต็มแล้ว (สูงสุด ${p.max} คน)`, en: (p) => `Too many spectators (max ${p.max})` },
  err_seat_lobby_only: { th: () => 'สลับไปเล่น/ไปดูได้เฉพาะก่อนเริ่มเกม', en: () => 'You can only switch seats before the game starts' },
  err_host_only_bot: { th: () => 'เฉพาะหัวห้องที่เพิ่มบอทได้', en: () => 'Only the host can add bots' },
  err_spectator_only_watch: { th: () => 'ผู้ชมทำได้แค่ดูเกม', en: () => 'Spectators can only watch' },
  err_room_full: { th: (p) => `ห้องเต็มแล้ว (สูงสุด ${p.max} คน)`, en: (p) => `Room is full (max ${p.max})` },
  err_name_taken: { th: () => 'มีผู้เล่นใช้ชื่อนี้แล้ว', en: () => 'That nickname is taken' },
  err_rate: { th: () => 'ส่งคำสั่งเร็วเกินไป', en: () => 'Too many actions, slow down' },
  err_bad_message: { th: () => 'ข้อความไม่ถูกต้อง', en: () => 'Invalid message' },
  err_auth_failed: { th: () => 'ไม่สามารถยืนยันตัวตนในห้องนี้ได้', en: () => 'Could not verify you in this room' },
  err_not_authed: { th: () => 'ยังไม่ได้ยืนยันตัวตน', en: () => 'Not authenticated yet' },
  err_host_only_transfer: { th: () => 'เฉพาะหัวห้องเท่านั้นที่มอบตำแหน่งได้', en: () => 'Only the host can hand over the host role' },
  err_host_only_kick: { th: () => 'เฉพาะหัวห้องเท่านั้นที่เชิญผู้เล่นออกได้', en: () => 'Only the host can remove players' },
  err_kick_lobby_only: { th: () => 'เชิญผู้เล่นออกได้เฉพาะก่อนเริ่มเกม', en: () => 'Players can only be kicked before the game starts' },
  err_host_only_skip: { th: () => 'เฉพาะหัวห้องเท่านั้นที่ข้ามเทิร์นได้', en: () => 'Only the host can skip turns' },
  err_skip_offline_only: {
    th: () => 'ข้ามได้เฉพาะเมื่อผู้เล่นที่ถึงตาหลุดการเชื่อมต่อ',
    en: () => 'You can only skip a disconnected player',
  },
  err_forfeit_game_only: { th: () => 'ยอมแพ้ได้เฉพาะระหว่างเกม', en: () => 'You can only forfeit during a game' },
  err_host_only_remove: { th: () => 'เฉพาะหัวห้องเท่านั้นที่นำผู้เล่นออกได้', en: () => 'Only the host can remove players' },
  err_remove_game_only: { th: () => 'นำผู้เล่นออกได้เฉพาะระหว่างเกม', en: () => 'Players can only be removed during a game' },
  err_remove_offline_only: {
    th: () => 'นำออกได้เฉพาะผู้เล่นที่หลุดการเชื่อมต่อ',
    en: () => 'Only disconnected players can be removed',
  },
  err_host_only_start: { th: () => 'เฉพาะหัวห้องเท่านั้นที่เริ่มเกมได้', en: () => 'Only the host can start the game' },
  err_already_started: { th: () => 'เกมเริ่มไปแล้ว', en: () => 'The game has already started (you can watch)' },
  err_min_players: { th: (p) => `ต้องมีผู้เล่นอย่างน้อย ${p.min} คน`, en: (p) => `Needs at least ${p.min} players` },
  err_not_started: { th: () => 'เกมยังไม่เริ่ม', en: () => "The game hasn't started" },
  err_stale: { th: () => 'สถานะเกมมีการเปลี่ยนแปลง กรุณาลองอีกครั้ง', en: () => 'The game state changed, please try again' },
  err_create_failed: { th: () => 'สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้ง', en: () => 'Could not create a room, try again' },
  err_bad_code: { th: () => 'รหัสห้องไม่ถูกต้อง', en: () => 'Invalid room code' },
};

export function cardName(id: string, lang: Lang): string {
  const c = CARDS[id];
  return c ? (lang === 'th' ? c.nameTh : c.nameEn) : id;
}

/** Renders a message key in the given language. Unknown keys fall back to the key itself. */
export function t(lang: Lang, key: string | number | undefined, params: MsgParams = {}): string {
  const entry = CATALOG[String(key)];
  if (!entry) return String(key ?? '');
  const h: Helpers = {
    card: (id) => cardName(String(id), lang),
    t: (k, p) => t(lang, k, p ?? {}),
  };
  return entry[lang](params, h);
}

export const hasMessage = (key: string) => key in CATALOG;
