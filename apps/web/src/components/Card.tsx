import { getCard, SYMBOL_TH, type Card as CardData, type CardSymbol } from '@mk2/game-engine';

export const SYMBOL_ICON: Record<CardSymbol, string> = {
  cup: '☕', wheat: '🌾', fruit: '🍇', shop: '🏪', flower: '🌸', gear: '⚙️', tower: '🏛️',
};

const CARD_ICON: Record<string, string> = {
  sushi_bar: '🍣', wheat_field: '🌾', vineyard: '🍇', bakery: '🥐', cafe: '☕', convenience_store: '🏪',
  flower_garden: '🌷', forest: '🌲', business_center: '🏢', flower_shop: '💐', corn_field: '🌽', stadium: '🏟️',
  furniture_factory: '🪑', hamburger_stand: '🍔', shopping_district: '🛍️', winery: '🍷', family_restaurant: '🍝',
  apple_orchard: '🍎', food_warehouse: '📦', mine: '⛏️',
  airport: '✈️', amusement_park: '🎡', charterhouse: '🏨', exhibit_hall: '🖼️', farmers_market: '🧺', forge: '🔨',
  french_restaurant: '🥖', launch_pad: '🚀', loan_office: '🏦', moving_company: '🚚', museum: '🏛️', observatory: '🔭',
  park: '🌳', publisher: '📚', radio_tower: '📻', shopping_mall: '🏬', soda_bottling_plant: '🥤', tech_startup: '💻',
  temple: '⛩️', tv_station: '📺', private_club: '🎩', city_hall: '🏛', renovation_company: '🛠️',
};

export const cardIcon = (id: string) => CARD_ICON[id] ?? '🏠';

export function colorClasses(c: CardData): { bg: string; ring: string; text: string; label: string } {
  if (c.type === 'landmark') return { bg: 'bg-orange-card', ring: 'ring-orange-300', text: 'text-orange-700', label: 'แลนด์มาร์ก' };
  switch (c.color) {
    case 'red': return { bg: 'bg-red-card', ring: 'ring-red-300', text: 'text-red-700', label: 'ร้านอาหาร' };
    case 'blue': return { bg: 'bg-blue-card', ring: 'ring-blue-300', text: 'text-blue-700', label: 'อุตสาหกรรมหลัก' };
    case 'green': return { bg: 'bg-green-card', ring: 'ring-green-300', text: 'text-green-700', label: 'อุตสาหกรรมรอง' };
    case 'purple': return { bg: 'bg-purple-card', ring: 'ring-purple-300', text: 'text-purple-700', label: 'กิจการขนาดใหญ่' };
  }
}

export function activationLabel(c: CardData): string {
  return c.type === 'establishment' ? c.activation.join('–') : '';
}

interface Props {
  cardId: string;
  count?: number;
  cost?: number;
  dim?: boolean;
  highlight?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

/** Card rendered from data (name/effect come from JSON, never from image text). */
export function CardTile({ cardId, count, cost, dim, highlight, size = 'md', onClick }: Props) {
  const c = getCard(cardId);
  const col = colorClasses(c);
  const w = size === 'sm' ? 'w-[76px]' : 'w-[96px] sm:w-[104px]';
  const displayCost = cost ?? (c.type === 'establishment' ? c.cost : c.costs[0]);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative ${w} shrink-0 rounded-xl bg-white text-left shadow-md transition
        hover:-translate-y-0.5 hover:shadow-lg active:scale-95 ${dim ? 'opacity-45 saturate-50' : ''} ${highlight ? 'ring-[3px] ring-amber-400' : 'ring-1 ring-black/5'}`}
      aria-label={`${c.nameTh} ${count && count > 1 ? `${count} ใบ` : ''}`}
    >
      <div className={`${col.bg} flex h-6 items-center justify-between rounded-t-xl px-1.5 text-[11px] font-semibold text-white`}>
        <span>{activationLabel(c) || '★'}</span>
        {c.type === 'establishment' && <span title={SYMBOL_TH[c.symbol]}>{SYMBOL_ICON[c.symbol]}</span>}
      </div>
      <div className={`flex items-center justify-center ${size === 'sm' ? 'h-9 text-2xl' : 'h-12 text-3xl'}`}>{cardIcon(cardId)}</div>
      <div className={`px-1.5 pb-1.5 text-center font-semibold leading-tight ${size === 'sm' ? 'text-[10px]' : 'text-[11px] sm:text-xs'} min-h-[2.2em]`}>
        {c.nameTh}
      </div>
      <div className="absolute -bottom-2 -left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-coin px-1 text-[11px] font-bold text-amber-950 shadow ring-2 ring-white">
        {displayCost}
      </div>
      {count !== undefined && count > 1 && (
        <div className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-800 px-1 text-[11px] font-bold text-white ring-2 ring-white">
          ×{count}
        </div>
      )}
    </button>
  );
}

export function CardDetail({ cardId }: { cardId: string }) {
  const c = getCard(cardId);
  const col = colorClasses(c);
  return (
    <div>
      <div className={`${col.bg} -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-2xl px-5 py-4 text-white`}>
        <div className="text-5xl drop-shadow">{cardIcon(cardId)}</div>
        <div>
          <div className="text-xl font-bold leading-tight">{c.nameTh}</div>
          <div className="text-sm opacity-90">{c.nameEn}</div>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full bg-slate-100 px-2 py-1 font-medium ${col.text}`}>
          {c.type === 'establishment' ? c.categoryTh : `แลนด์มาร์ก — ${c.duration === 'ongoing' ? 'ความสามารถต่อเนื่อง' : 'ความสามารถทันที'}`}
        </span>
        {c.type === 'establishment' && (
          <>
            <span className="rounded-full bg-slate-100 px-2 py-1">เลขเต๋า: <b>{c.activation.join(', ')}</b></span>
            <span className="rounded-full bg-slate-100 px-2 py-1">สัญลักษณ์: {SYMBOL_ICON[c.symbol]} {SYMBOL_TH[c.symbol]}</span>
            <span className="rounded-full bg-amber-100 px-2 py-1">ค่าก่อสร้าง: <b>{c.cost}</b> เหรียญ</span>
          </>
        )}
        {c.type === 'landmark' && (
          <>
            <span className="rounded-full bg-amber-100 px-2 py-1">
              ค่าก่อสร้าง (แห่งที่ 1/2/3): <b>{c.costs.join(' / ')}</b>
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1">{c.scope === 'all_players' ? 'มีผลกับผู้เล่นทุกคน' : 'เฉพาะผู้สร้าง'}</span>
          </>
        )}
      </div>
      <p className="font-body text-base leading-relaxed">{c.effectTh}</p>
      {c.type === 'landmark' && c.buildConditionTh && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">เงื่อนไข: {c.buildConditionTh}</p>
      )}
      <p className="mt-3 border-t pt-2 text-xs italic text-slate-500">{c.effectEn}</p>
    </div>
  );
}
