// Card database. English text from the card faces; Thai names/effects follow the updated Thai card art
// (asset/card_images/thai_previews/*/translations_*.txt, 2026-10-23) and otherwise translations/*.md.
// Copy counts: see COPIES (user-confirmed).

export type EstablishmentColor = 'red' | 'blue' | 'green' | 'purple';
// Icons printed on the establishment cards (verified from the card art). 'tower' is the purple Major icon.
// 'combo' cards carry no icon of their own, so they never count toward any symbol (Rulebook p.6 Winery example).
export type CardSymbol = 'cup' | 'wheat' | 'fruit' | 'shop' | 'flower' | 'gear' | 'tower' | 'combo';
export type Tier = 'low' | 'high';

export type EstablishmentEffect =
  | { kind: 'bank'; amount: number }
  | { kind: 'take_from_active'; amount: number }
  | { kind: 'bank_per_symbol'; amount: number; symbol: CardSymbol }
  | { kind: 'take_from_each'; amount: number }
  | { kind: 'take_half_if_over'; threshold: number }
  | { kind: 'exchange' };

export interface EstablishmentCard {
  id: string;
  type: 'establishment';
  nameEn: string;
  nameTh: string;
  color: EstablishmentColor;
  categoryTh: string;
  symbol: CardSymbol;
  tier: Tier;
  activation: number[];
  cost: number;
  effectEn: string;
  effectTh: string;
  timing: 'anyone' | 'your_turn' | 'opponent_turn';
  target: 'bank' | 'active_player' | 'each_opponent' | 'chosen_opponent';
  assetPath: string | null;
  quantityInDeck: number | null;
  effect: EstablishmentEffect;
}

export type LandmarkEffect =
  | { kind: 'no_build_bank'; amount: number } // airport
  | { kind: 'doubles_extra_turn' } // amusement park
  | { kind: 'two_dice_no_income_bank'; amount: number } // charterhouse
  | { kind: 'one_die_no_income_bank'; amount: number } // city hall
  | { kind: 'take_half_if_over'; threshold: number } // exhibit hall
  | { kind: 'symbol_income_bonus'; symbol: CardSymbol; amount: number }
  | { kind: 'take_from_each'; amount: number } // french restaurant
  | { kind: 'win' } // launch pad
  | { kind: 'landmark_discount_self'; amount: number } // loan office
  | { kind: 'doubles_give_right' } // moving company
  | { kind: 'take_per_landmark'; amount: number } // museum
  | { kind: 'launch_pad_discount'; amount: number } // observatory
  | { kind: 'redistribute' } // park
  | { kind: 'take_per_symbol'; amount: number; symbol: CardSymbol } // publisher, tv station
  | { kind: 'extra_turn' } // radio tower
  | { kind: 'roll_total_bank'; total: number; amount: number } // tech startup
  | { kind: 'doubles_take_from_each'; amount: number } // temple
  | { kind: 'take_if_landmarks'; landmarks: number; amount: number } // private club
  | { kind: 'roll_total_bank_per_symbol'; total: number; amount: number; symbol: CardSymbol }; // renovation

export interface LandmarkCard {
  id: string;
  type: 'landmark';
  nameEn: string;
  nameTh: string;
  costs: number[]; // cost when it is your 1st / 2nd / 3rd landmark
  duration: 'ongoing' | 'immediate';
  scope: 'all_players' | 'builder_only';
  effectEn: string;
  effectTh: string;
  buildConditionTh?: string;
  assetPath: string | null;
  quantityInDeck: number | null;
  effect: LandmarkEffect;
}

export type Card = EstablishmentCard | LandmarkCard;

const RED_TH = 'แดง — ร้านอาหาร';
const BLUE_TH = 'ฟ้า — อุตสาหกรรมหลัก';
const GREEN_TH = 'เขียว — อุตสาหกรรมรอง';
const PURPLE_TH = 'ม่วง — กิจการขนาดใหญ่';

type EDef = Omit<EstablishmentCard, 'type' | 'categoryTh' | 'timing' | 'target' | 'assetPath' | 'quantityInDeck'>;

/** Copies per establishment, from asset/Machi_Koro_2_Card_Inventory.xlsx (user-confirmed; 86 total per the rulebook). */
const COPIES: Record<string, number> = {
  sushi_bar: 5,
  wheat_field: 5,
  vineyard: 5,
  bakery: 5,
  cafe: 5,
  convenience_store: 5,
  flower_garden: 5,
  forest: 5,
  business_center: 3,
  flower_shop: 3,
  corn_field: 5,
  stadium: 4,
  furniture_factory: 3,
  hamburger_stand: 4,
  shopping_district: 3,
  winery: 3,
  family_restaurant: 5,
  apple_orchard: 5,
  food_warehouse: 3,
  mine: 5,
};

function est(d: EDef): EstablishmentCard {
  const timing = d.color === 'blue' ? 'anyone' : d.color === 'red' ? 'opponent_turn' : 'your_turn';
  const target =
    d.effect.kind === 'take_from_active' ? 'active_player'
    : d.effect.kind === 'take_from_each' || d.effect.kind === 'take_half_if_over' ? 'each_opponent'
    : d.effect.kind === 'exchange' ? 'chosen_opponent'
    : 'bank';
  const categoryTh = { red: RED_TH, blue: BLUE_TH, green: GREEN_TH, purple: PURPLE_TH }[d.color];
  return { ...d, type: 'establishment', categoryTh, timing, target, assetPath: null, quantityInDeck: COPIES[d.id] ?? null };
}

export const ESTABLISHMENTS: EstablishmentCard[] = [
  est({ id: 'sushi_bar', nameEn: 'Sushi Bar', nameTh: 'ร้านซูชิ', color: 'red', symbol: 'cup', tier: 'low', activation: [1], cost: 2,
    effectEn: 'Take 3 coins from the active player. (opponent’s turn)', effectTh: 'รับ 3 เหรียญจากผู้เล่นที่กำลังเล่นอยู่ (เฉพาะเทิร์นของฝ่ายตรงข้าม)',
    effect: { kind: 'take_from_active', amount: 3 } }),
  est({ id: 'wheat_field', nameEn: 'Wheat Field', nameTh: 'ทุ่งข้าวสาลี', color: 'blue', symbol: 'wheat', tier: 'low', activation: [1, 2], cost: 1,
    effectEn: 'Get 1 coin from the bank. (anyone’s turn)', effectTh: 'รับ 1 เหรียญจากธนาคาร (ในเทิร์นของผู้เล่นคนใดก็ได้)',
    effect: { kind: 'bank', amount: 1 } }),
  est({ id: 'vineyard', nameEn: 'Vineyard', nameTh: 'ไร่องุ่น', color: 'blue', symbol: 'fruit', tier: 'low', activation: [2], cost: 1,
    effectEn: 'Get 2 coins from the bank. (anyone’s turn)', effectTh: 'รับ 2 เหรียญจากธนาคาร (ในเทิร์นของผู้เล่นคนใดก็ได้)',
    effect: { kind: 'bank', amount: 2 } }),
  est({ id: 'bakery', nameEn: 'Bakery', nameTh: 'ร้านเบเกอรี', color: 'green', symbol: 'shop', tier: 'low', activation: [2, 3], cost: 1,
    effectEn: 'Get 2 coins from the bank. (your turn only)', effectTh: 'รับ 2 เหรียญจากธนาคาร (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'bank', amount: 2 } }),
  est({ id: 'cafe', nameEn: 'Café', nameTh: 'คาเฟ่', color: 'red', symbol: 'cup', tier: 'low', activation: [3], cost: 1,
    effectEn: 'Take 2 coins from the active player. (opponent’s turn)', effectTh: 'รับ 2 เหรียญจากผู้เล่นเจ้าของเทิร์น (เฉพาะเทิร์นของคู่แข่ง)',
    effect: { kind: 'take_from_active', amount: 2 } }),
  est({ id: 'convenience_store', nameEn: 'Convenience Store', nameTh: 'ร้านสะดวกซื้อ', color: 'green', symbol: 'shop', tier: 'low', activation: [4], cost: 1,
    effectEn: 'Get 3 coins from the bank. (your turn only)', effectTh: 'รับ 3 เหรียญจากธนาคาร (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'bank', amount: 3 } }),
  est({ id: 'flower_garden', nameEn: 'Flower Garden', nameTh: 'สวนดอกไม้', color: 'blue', symbol: 'flower', tier: 'low', activation: [4], cost: 2,
    effectEn: 'Get 2 coins from the bank. (anyone’s turn)', effectTh: 'รับ 2 เหรียญจากธนาคาร (ในเทิร์นของผู้เล่นคนใดก็ได้)',
    effect: { kind: 'bank', amount: 2 } }),
  est({ id: 'forest', nameEn: 'Forest', nameTh: 'ป่าไม้', color: 'blue', symbol: 'gear', tier: 'low', activation: [5], cost: 3,
    effectEn: 'Get 2 coins from the bank. (anyone’s turn)', effectTh: 'รับ 2 เหรียญจากธนาคาร (ในเทิร์นของผู้เล่นคนใดก็ได้)',
    effect: { kind: 'bank', amount: 2 } }),
  est({ id: 'business_center', nameEn: 'Business Center', nameTh: 'ศูนย์ธุรกิจ', color: 'purple', symbol: 'tower', tier: 'low', activation: [6], cost: 3,
    effectEn: 'Exchange 1 of your establishments for 1 an opponent owns. (your turn only)', effectTh: 'แลกเปลี่ยนสิ่งปลูกสร้างของคุณ 1 แห่ง กับสิ่งปลูกสร้างของผู้เล่นคนอื่นได้ 1 แห่ง (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'exchange' } }),
  est({ id: 'flower_shop', nameEn: 'Flower Shop', nameTh: 'ร้านดอกไม้', color: 'green', symbol: 'combo', tier: 'low', activation: [6], cost: 1,
    effectEn: 'Get 3 coins from the bank for each flower-symbol establishment you own. (your turn only)', effectTh: 'รับ 3 เหรียญจากธนาคาร ต่อสิ่งปลูกสร้างสัญลักษณ์ดอกไม้ทุกแห่งที่คุณมี (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'bank_per_symbol', amount: 3, symbol: 'flower' } }),
  est({ id: 'corn_field', nameEn: 'Corn Field', nameTh: 'ไร่ข้าวโพด', color: 'blue', symbol: 'wheat', tier: 'high', activation: [7], cost: 2,
    effectEn: 'Get 3 coins from the bank. (anyone’s turn)', effectTh: 'รับ 3 เหรียญจากธนาคาร (ในเทิร์นของผู้เล่นคนใดก็ได้)',
    effect: { kind: 'bank', amount: 3 } }),
  est({ id: 'stadium', nameEn: 'Stadium', nameTh: 'สนามกีฬา', color: 'purple', symbol: 'tower', tier: 'high', activation: [7], cost: 3,
    effectEn: 'Take 3 coins from each opponent. (your turn only)', effectTh: 'รับ 3 เหรียญจากผู้เล่นฝ่ายตรงข้ามแต่ละคน (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'take_from_each', amount: 3 } }),
  est({ id: 'furniture_factory', nameEn: 'Furniture Factory', nameTh: 'โรงงานเฟอร์นิเจอร์', color: 'green', symbol: 'combo', tier: 'high', activation: [8], cost: 4,
    effectEn: 'Get 4 coins from the bank for each gear-symbol establishment you own. (your turn only)', effectTh: 'รับ 4 เหรียญจากธนาคารสำหรับสิ่งปลูกสร้างสัญลักษณ์เฟืองแต่ละแห่งที่คุณมี (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'bank_per_symbol', amount: 4, symbol: 'gear' } }),
  est({ id: 'hamburger_stand', nameEn: 'Hamburger Stand', nameTh: 'ร้านแฮมเบอร์เกอร์', color: 'red', symbol: 'cup', tier: 'high', activation: [8], cost: 1,
    effectEn: 'Take 2 coins from the active player. (opponent’s turn)', effectTh: 'รับ 2 เหรียญจากผู้เล่นที่กำลังเล่นอยู่ (เฉพาะเทิร์นของฝ่ายตรงข้าม)',
    effect: { kind: 'take_from_active', amount: 2 } }),
  est({ id: 'shopping_district', nameEn: 'Shopping District', nameTh: 'ย่านการค้า', color: 'purple', symbol: 'tower', tier: 'high', activation: [8, 9], cost: 3,
    effectEn: 'From each opponent who has more than 10 coins, take half, rounded down. (your turn only)', effectTh: 'ได้รับเหรียญครึ่งหนึ่ง จากผู้เล่นฝ่ายตรงข้ามแต่ละคนที่มีเหรียญมากกว่า 10 เหรียญ โดยปัดเศษลง (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'take_half_if_over', threshold: 10 } }),
  est({ id: 'winery', nameEn: 'Winery', nameTh: 'โรงบ่มไวน์', color: 'green', symbol: 'combo', tier: 'high', activation: [9], cost: 3,
    effectEn: 'Get 3 coins from the bank for each fruit-symbol establishment you own. (your turn only)', effectTh: 'รับ 3 เหรียญจากธนาคารสำหรับสิ่งปลูกสร้างสัญลักษณ์ผลไม้แต่ละแห่งที่คุณมี (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'bank_per_symbol', amount: 3, symbol: 'fruit' } }),
  est({ id: 'family_restaurant', nameEn: 'Family Restaurant', nameTh: 'ร้านอาหารครอบครัว', color: 'red', symbol: 'cup', tier: 'high', activation: [9, 10], cost: 2,
    effectEn: 'Take 2 coins from the active player. (opponent’s turn)', effectTh: 'รับ 2 เหรียญจากผู้เล่นเจ้าของเทิร์น (เฉพาะเทิร์นของคู่แข่ง)',
    effect: { kind: 'take_from_active', amount: 2 } }),
  est({ id: 'apple_orchard', nameEn: 'Apple Orchard', nameTh: 'สวนแอปเปิล', color: 'blue', symbol: 'fruit', tier: 'high', activation: [10], cost: 1,
    effectEn: 'Get 3 coins from the bank. (anyone’s turn)', effectTh: 'รับ 3 เหรียญจากธนาคาร (ในเทิร์นของผู้เล่นคนใดก็ได้)',
    effect: { kind: 'bank', amount: 3 } }),
  est({ id: 'food_warehouse', nameEn: 'Food Warehouse', nameTh: 'คลังสินค้าอาหาร', color: 'green', symbol: 'combo', tier: 'high', activation: [10, 11], cost: 2,
    effectEn: 'Get 2 coins from the bank for each cup-symbol establishment you own. (your turn only)', effectTh: 'รับ 2 เหรียญจากธนาคาร ต่อสิ่งปลูกสร้างสัญลักษณ์ถ้วยกาแฟทุกแห่งที่คุณมี (เฉพาะเทิร์นของคุณ)',
    effect: { kind: 'bank_per_symbol', amount: 2, symbol: 'cup' } }),
  est({ id: 'mine', nameEn: 'Mine', nameTh: 'เหมือง', color: 'blue', symbol: 'gear', tier: 'high', activation: [11, 12], cost: 4,
    effectEn: 'Get 6 coins from the bank. (anyone’s turn)', effectTh: 'รับ 6 เหรียญจากธนาคาร (ในเทิร์นของผู้เล่นคนใดก็ได้)',
    effect: { kind: 'bank', amount: 6 } }),
];

const STD = [12, 16, 22];
const CHEAP = [10, 14, 22];

type LDef = Omit<LandmarkCard, 'type' | 'assetPath' | 'quantityInDeck'>;
// All 23 pictured landmarks are in the deck, one copy each (confirmed by the user, 2026-10-23).
const lm = (d: LDef): LandmarkCard => ({ ...d, type: 'landmark', assetPath: null, quantityInDeck: 1 });

export const LANDMARKS: LandmarkCard[] = [
  lm({ id: 'airport', nameEn: 'Airport', nameTh: 'สนามบิน', costs: STD, duration: 'ongoing', scope: 'all_players',
    effectEn: 'If you don’t build anything on your turn, get 5 coins from the bank. (all players)', effectTh: 'หากคุณไม่ได้สร้างสิ่งก่อสร้างใด ๆ ในเทิร์นของคุณ ให้รับ 5 เหรียญจากธนาคาร (ผู้เล่นทุกคน)',
    effect: { kind: 'no_build_bank', amount: 5 } }),
  lm({ id: 'amusement_park', nameEn: 'Amusement Park', nameTh: 'สวนสนุก', costs: STD, duration: 'ongoing', scope: 'all_players',
    effectEn: 'If you roll doubles, take another turn after this one. (all players)', effectTh: 'หากคุณทอยลูกเต๋าได้เลขซ้ำ (ลูกเต๋า 2 ลูกแต้มเหมือนกัน) ให้เล่นอีก 1 เทิร์นหลังจบเทิร์นนี้ (ผู้เล่นทุกคน)',
    effect: { kind: 'doubles_extra_turn' } }),
  lm({ id: 'charterhouse', nameEn: 'Charterhouse', nameTh: 'ชาร์เตอร์เฮาส์', costs: STD, duration: 'ongoing', scope: 'all_players',
    effectEn: 'If you roll 2 dice and receive no coins, get 3 coins from the bank. (all players)', effectTh: 'หากคุณทอยลูกเต๋า 2 ลูกแล้วไม่ได้รับเหรียญ คุณจะได้รับ 3 เหรียญจากธนาคาร (ผู้เล่นทุกคน)',
    effect: { kind: 'two_dice_no_income_bank', amount: 3 } }),
  lm({ id: 'exhibit_hall', nameEn: 'Exhibit Hall', nameTh: 'หอจัดแสดง', costs: STD, duration: 'immediate', scope: 'builder_only',
    effectEn: 'From each opponent who has more than 10 coins, take half, rounded down. (builder only)', effectTh: 'จากผู้เล่นฝ่ายตรงข้ามแต่ละคนที่มีเหรียญมากกว่า 10 เหรียญ รับเหรียญครึ่งหนึ่ง โดยปัดเศษลง (เฉพาะผู้สร้าง)',
    effect: { kind: 'take_half_if_over', threshold: 10 } }),
  lm({ id: 'farmers_market', nameEn: 'Farmers Market', nameTh: 'ตลาดเกษตรกร', costs: CHEAP, duration: 'ongoing', scope: 'all_players',
    effectEn: 'Your wheat-symbol establishments earn +1 coin income when activated. (all players)', effectTh: 'สิ่งปลูกสร้างสัญลักษณ์รวงข้าวของคุณได้รับรายได้เพิ่ม 1 เหรียญเมื่อทำงาน (ผู้เล่นทุกคน)',
    effect: { kind: 'symbol_income_bonus', symbol: 'wheat', amount: 1 } }),
  lm({ id: 'forge', nameEn: 'Forge', nameTh: 'โรงหลอม', costs: STD, duration: 'ongoing', scope: 'all_players',
    effectEn: 'Your gear-symbol establishments earn +1 coin income when activated. (all players)', effectTh: 'สิ่งปลูกสร้างสัญลักษณ์เฟืองของคุณให้รายได้เพิ่มขึ้น +1 เหรียญเมื่อถูกใช้งาน (ผู้เล่นทุกคน)',
    effect: { kind: 'symbol_income_bonus', symbol: 'gear', amount: 1 } }),
  lm({ id: 'french_restaurant', nameEn: 'French Restaurant', nameTh: 'ร้านอาหารฝรั่งเศส', costs: CHEAP, duration: 'immediate', scope: 'builder_only',
    effectEn: 'Take 2 coins from each opponent. (builder only)', effectTh: 'รับ 2 เหรียญจากผู้เล่นฝ่ายตรงข้ามแต่ละคน (เฉพาะผู้สร้าง)',
    effect: { kind: 'take_from_each', amount: 2 } }),
  lm({ id: 'launch_pad', nameEn: 'Launch Pad', nameTh: 'ฐานปล่อยจรวด', costs: [45, 38, 25], duration: 'immediate', scope: 'builder_only',
    effectEn: 'You win the game! (builder only)', effectTh: 'คุณชนะเกม! (สำหรับผู้สร้างเท่านั้น)',
    effect: { kind: 'win' } }),
  lm({ id: 'loan_office', nameEn: 'Loan Office', nameTh: 'สำนักงานสินเชื่อ', costs: [10, 10, 10], duration: 'ongoing', scope: 'builder_only',
    effectEn: 'You can only build this landmark when you are the only player with no landmarks. Reduce the build cost of all landmarks by 2 coins. (builder only)',
    effectTh: 'คุณสามารถสร้างแลนด์มาร์กนี้ได้ก็ต่อเมื่อคุณเป็นผู้เล่นเพียงคนเดียวที่ยังไม่มีแลนด์มาร์ก ลดค่าก่อสร้างแลนด์มาร์กทั้งหมดลง 2 เหรียญ (สำหรับผู้สร้างเท่านั้น)',
    buildConditionTh: 'สร้างได้เมื่อคุณเป็นผู้เล่นคนเดียวที่ยังไม่มีแลนด์มาร์ก',
    effect: { kind: 'landmark_discount_self', amount: 2 } }),
  lm({ id: 'moving_company', nameEn: 'Moving Company', nameTh: 'บริษัทขนย้าย', costs: CHEAP, duration: 'ongoing', scope: 'all_players',
    effectEn: 'If you roll doubles, give 1 of your establishments to the player on your right. (all players)', effectTh: 'หากคุณทอยลูกเต๋าได้แต้มเหมือนกันทั้ง 2 ลูก ให้ยกสิ่งปลูกสร้างของคุณ 1 แห่งให้แก่ผู้เล่นทางขวาของคุณ (ผู้เล่นทุกคน)',
    effect: { kind: 'doubles_give_right' } }),
  lm({ id: 'museum', nameEn: 'Museum', nameTh: 'พิพิธภัณฑ์', costs: STD, duration: 'immediate', scope: 'builder_only',
    effectEn: 'Take 3 coins from each opponent for each landmark they own. (builder only)', effectTh: 'รับ 3 เหรียญจากผู้เล่นฝ่ายตรงข้ามแต่ละคน ต่อแลนด์มาร์กแต่ละแห่งที่ผู้เล่นคนนั้นมี (เฉพาะผู้สร้าง)',
    effect: { kind: 'take_per_landmark', amount: 3 } }),
  lm({ id: 'observatory', nameEn: 'Observatory', nameTh: 'หอดูดาว', costs: CHEAP, duration: 'ongoing', scope: 'all_players',
    effectEn: 'Reduce the build cost of the Launch Pad by 5 coins. (all players)', effectTh: 'ลดค่าก่อสร้างของฐานปล่อยจรวดลง 5 เหรียญ (ผู้เล่นทุกคน)',
    effect: { kind: 'launch_pad_discount', amount: 5 } }),
  lm({ id: 'park', nameEn: 'Park', nameTh: 'สวนสาธารณะ', costs: STD, duration: 'immediate', scope: 'builder_only',
    effectEn: 'Redistribute all players’ coins as evenly as possible, making up any difference with coins from the bank. (builder only)', effectTh: 'เฉลี่ยเหรียญของผู้เล่นทุกคนใหม่ให้ใกล้เคียงกันที่สุด โดยเติมส่วนต่างจากธนาคาร (เฉพาะผู้สร้าง)',
    effect: { kind: 'redistribute' } }),
  lm({ id: 'publisher', nameEn: 'Publisher', nameTh: 'สำนักพิมพ์', costs: CHEAP, duration: 'immediate', scope: 'builder_only',
    effectEn: 'Take 1 coin from each opponent for each shop-symbol establishment they own. (builder only)', effectTh: 'รับ 1 เหรียญจากผู้เล่นฝ่ายตรงข้ามแต่ละคน ต่อสิ่งปลูกสร้างสัญลักษณ์ร้านค้าทุก 1 แห่งที่ผู้เล่นคนนั้นมี (เฉพาะผู้สร้าง)',
    effect: { kind: 'take_per_symbol', amount: 1, symbol: 'shop' } }),
  lm({ id: 'radio_tower', nameEn: 'Radio Tower', nameTh: 'หอส่งสัญญาณ', costs: STD, duration: 'immediate', scope: 'builder_only',
    effectEn: 'Take another turn after this one. (builder only)', effectTh: 'เล่นอีก 1 เทิร์นต่อจากเทิร์นนี้ (เฉพาะผู้สร้าง)',
    effect: { kind: 'extra_turn' } }),
  lm({ id: 'shopping_mall', nameEn: 'Shopping Mall', nameTh: 'ศูนย์การค้า', costs: CHEAP, duration: 'ongoing', scope: 'all_players',
    effectEn: 'Your shop-symbol establishments earn +1 coin income when activated. (all players)', effectTh: 'สิ่งปลูกสร้างสัญลักษณ์ร้านค้าของคุณได้รับรายได้เพิ่มอีก 1 เหรียญเมื่อถูกใช้งาน (ผู้เล่นทุกคน)',
    effect: { kind: 'symbol_income_bonus', symbol: 'shop', amount: 1 } }),
  lm({ id: 'soda_bottling_plant', nameEn: 'Soda Bottling Plant', nameTh: 'โรงงานบรรจุน้ำอัดลม', costs: STD, duration: 'ongoing', scope: 'all_players',
    effectEn: 'Your cup-symbol establishments earn +1 coin income when activated. (all players)', effectTh: 'สิ่งปลูกสร้างสัญลักษณ์ถ้วยของคุณได้รับรายได้เพิ่มอีก 1 เหรียญเมื่อถูกใช้งาน (ผู้เล่นทุกคน)',
    effect: { kind: 'symbol_income_bonus', symbol: 'cup', amount: 1 } }),
  lm({ id: 'tech_startup', nameEn: 'Tech Startup', nameTh: 'เทคสตาร์ทอัพ', costs: CHEAP, duration: 'ongoing', scope: 'all_players',
    effectEn: 'If you roll 12, get 8 coins from the bank. (all players)', effectTh: 'หากคุณทอยได้ 12 รับ 8 เหรียญจากธนาคาร (ผู้เล่นทุกคน)',
    effect: { kind: 'roll_total_bank', total: 12, amount: 8 } }),
  lm({ id: 'temple', nameEn: 'Temple', nameTh: 'ศาลเจ้า', costs: STD, duration: 'ongoing', scope: 'all_players',
    effectEn: 'If you roll doubles, take 2 coins from each opponent. (all players)', effectTh: 'หากคุณทอยได้แต้มคู่ (ลูกเต๋า 2 ลูกแต้มเหมือนกัน) รับ 2 เหรียญจากผู้เล่นฝ่ายตรงข้ามแต่ละคน (ผู้เล่นทุกคน)',
    effect: { kind: 'doubles_take_from_each', amount: 2 } }),
  lm({ id: 'tv_station', nameEn: 'TV Station', nameTh: 'สถานีโทรทัศน์', costs: STD, duration: 'immediate', scope: 'builder_only',
    effectEn: 'Take 1 coin from each opponent for each cup-symbol establishment they own. (builder only)', effectTh: 'รับ 1 เหรียญจากผู้เล่นฝ่ายตรงข้ามแต่ละคน ต่อสิ่งปลูกสร้างสัญลักษณ์ถ้วยแต่ละแห่งที่ผู้เล่นคนนั้นมี (เฉพาะผู้สร้าง)',
    effect: { kind: 'take_per_symbol', amount: 1, symbol: 'cup' } }),
  lm({ id: 'private_club', nameEn: 'Private Club', nameTh: 'คลับส่วนตัว', costs: STD, duration: 'immediate', scope: 'builder_only',
    effectEn: 'Take 5 coins from each opponent who has 2 landmarks. (builder only)', effectTh: 'รับ 5 เหรียญจากผู้เล่นฝ่ายตรงข้ามแต่ละคนที่มีแลนด์มาร์ก 2 แห่ง (เฉพาะผู้สร้าง)',
    effect: { kind: 'take_if_landmarks', landmarks: 2, amount: 5 } }),
  lm({ id: 'city_hall', nameEn: 'City Hall', nameTh: 'ศาลากลาง', costs: CHEAP, duration: 'ongoing', scope: 'all_players',
    effectEn: 'If you roll 1 die and receive no coins, get 2 coins from the bank. (all players)', effectTh: 'หากคุณทอยลูกเต๋า 1 ลูกแล้วไม่ได้รับเหรียญ รับ 2 เหรียญจากธนาคาร (ผู้เล่นทุกคน)',
    effect: { kind: 'one_die_no_income_bank', amount: 2 } }),
  lm({ id: 'renovation_company', nameEn: 'Renovation Company', nameTh: 'บริษัทปรับปรุง', costs: CHEAP, duration: 'ongoing', scope: 'all_players',
    effectEn: 'If you roll a 6, get 1 coin from the bank for each cup-symbol establishment you own. (all players)', effectTh: 'หากคุณทอยได้ 6 รับ 1 เหรียญจากธนาคาร ต่อสิ่งปลูกสร้างสัญลักษณ์ถ้วยทุก 1 แห่งที่คุณมี (ผู้เล่นทุกคน)',
    effect: { kind: 'roll_total_bank_per_symbol', total: 6, amount: 1, symbol: 'cup' } }),
];

export const CARDS: Record<string, Card> = Object.fromEntries(
  [...ESTABLISHMENTS, ...LANDMARKS].map((c) => [c.id, c]),
);

export function getCard(id: string): Card {
  const c = CARDS[id];
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}
export function getEst(id: string): EstablishmentCard {
  const c = getCard(id);
  if (c.type !== 'establishment') throw new Error(`Not an establishment: ${id}`);
  return c;
}
export function getLandmark(id: string): LandmarkCard {
  const c = getCard(id);
  if (c.type !== 'landmark') throw new Error(`Not a landmark: ${id}`);
  return c;
}

export const SYMBOL_TH: Record<CardSymbol, string> = {
  cup: 'ถ้วย', wheat: 'รวงข้าว', fruit: 'ผลไม้', shop: 'ร้านค้า', flower: 'ดอกไม้', gear: 'เฟือง', tower: 'อาคารเสา', combo: 'คอมโบ',
};
