import { createContext, useContext, useState } from 'react';
import { getCard, type Card as CardData, type CardSymbol } from '@mk2/game-engine';
import { useI18n, type UiKey } from '../i18n';
import { cardImageUrl } from '../net';

// Matches the icons printed on the cards (see docs/RULE_ISSUES.md — symbols).
export const SYMBOL_ICON: Record<CardSymbol, string> = {
  cup: '☕', wheat: '🌾', fruit: '🍎', shop: '🏠', flower: '🌷', gear: '⚙️', tower: '🏛️', combo: '✨',
};
/** Symbols that cards and landmarks count, in display order. */
export const COUNTED_SYMBOLS: CardSymbol[] = ['cup', 'wheat', 'fruit', 'shop', 'flower', 'gear', 'tower'];

/** Big, readable symbol badge shown on top of a card's printed icon. */
export function SymbolBadge({ symbol, size = 'md' }: { symbol: CardSymbol; size?: 'sm' | 'md' }) {
  const { symbol: name } = useI18n();
  if (symbol === 'combo') {
    return (
      <span title={name(symbol)}
        className="absolute -left-1.5 -top-2 z-10 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-950 shadow ring-2 ring-white">
        combo
      </span>
    );
  }
  const dim = size === 'sm' ? 'h-7 w-7 text-base' : 'h-8 w-8 text-lg';
  return (
    <span title={name(symbol)}
      className={`absolute -left-2 -top-2 z-10 flex ${dim} items-center justify-center rounded-full bg-white leading-none shadow-md ring-2 ring-slate-300`}>
      {SYMBOL_ICON[symbol]}
    </span>
  );
}

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

/** Signed ticket for this room's card images (null → images unavailable, use drawn tiles). */
export const CardTicketContext = createContext<string | null>(null);

function useCardImage(cardId: string): [string | null, () => void] {
  const ticket = useContext(CardTicketContext);
  const { lang } = useI18n();
  const url = cardImageUrl(ticket, lang, cardId);
  const [failed, setFailed] = useState<string | null>(null);
  return [url && failed !== url ? url : null, () => setFailed(url)];
}

export function colorClasses(c: CardData): { bg: string; text: string; label: UiKey } {
  if (c.type === 'landmark') return { bg: 'bg-orange-card', text: 'text-orange-700', label: 'cat_landmark' };
  switch (c.color) {
    case 'red': return { bg: 'bg-red-card', text: 'text-red-700', label: 'cat_red' };
    case 'blue': return { bg: 'bg-blue-card', text: 'text-blue-700', label: 'cat_blue' };
    case 'green': return { bg: 'bg-green-card', text: 'text-green-700', label: 'cat_green' };
    case 'purple': return { bg: 'bg-purple-card', text: 'text-purple-700', label: 'cat_purple' };
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
  /** activated by the current roll */
  fired?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

/** A card in the market or a tableau: card art when available, otherwise a tile drawn from data. */
export function CardTile({ cardId, count, cost, dim, highlight, fired, size = 'md', onClick }: Props) {
  const c = getCard(cardId);
  const col = colorClasses(c);
  const { card, u } = useI18n();
  const [img, onImgError] = useCardImage(cardId);
  const w = size === 'sm' ? 'w-[76px]' : 'w-[96px] sm:w-[104px]';
  const printedCost = c.type === 'establishment' ? c.cost : c.costs[0];
  const displayCost = cost ?? printedCost;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative ${w} shrink-0 rounded-xl bg-white text-left shadow-md transition
        hover:-translate-y-0.5 hover:shadow-lg active:scale-95 ${dim ? 'opacity-45 saturate-50' : ''} ${highlight ? 'ring-[3px] ring-amber-400' : fired ? 'ring-[3px] ring-emerald-500' : 'ring-1 ring-black/5'}`}
      aria-label={`${card(cardId)}${count && count > 1 ? ` ${u('copies', { n: count })}` : ''}`}
    >
      {img ? (
        <img src={img} onError={onImgError} alt="" loading="lazy" draggable={false}
          className="block aspect-[5/7] w-full rounded-xl object-cover" />
      ) : (
        <>
          <div className={`${col.bg} flex h-6 items-center justify-between rounded-t-xl px-1.5 text-[11px] font-semibold text-white`}>
            <span>{activationLabel(c) || '★'}</span>
          </div>
          <div className={`flex items-center justify-center ${size === 'sm' ? 'h-9 text-2xl' : 'h-12 text-3xl'}`}>{cardIcon(cardId)}</div>
          <div className={`min-h-[2.2em] px-1.5 pb-1.5 text-center font-semibold leading-tight ${size === 'sm' ? 'text-[10px]' : 'text-[11px] sm:text-xs'}`}>
            {card(cardId)}
          </div>
        </>
      )}
      {/* With art, only show the price when it differs from what is printed (landmark position, discounts). */}
      {(!img || displayCost !== printedCost || c.type === 'landmark') && (
        <div className="absolute -bottom-2 -left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-coin px-1 text-[11px] font-bold text-amber-950 shadow ring-2 ring-white">
          {displayCost}
        </div>
      )}
      {c.type === 'establishment' && <SymbolBadge symbol={c.symbol} size={size} />}
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
  const { lang, u, card, effect, symbol } = useI18n();
  const [img, onImgError] = useCardImage(cardId);
  const otherName = lang === 'th' ? c.nameEn : c.nameTh;
  const otherEffect = lang === 'th' ? c.effectEn : c.effectTh;
  return (
    <div>
      {img ? (
        <div className="-mx-5 -mt-5 mb-4 flex justify-center rounded-t-2xl bg-slate-100 px-5 pt-5 pb-3">
          <img src={img} onError={onImgError} alt={card(cardId)} draggable={false}
            className="max-h-[46vh] w-auto rounded-xl shadow-lg" />
        </div>
      ) : (
        <div className={`${col.bg} -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-2xl px-5 py-4 text-white`}>
          <div className="text-5xl drop-shadow">{cardIcon(cardId)}</div>
          <div className="text-xl font-bold leading-tight">{card(cardId)}</div>
        </div>
      )}
      <div className="mb-2">
        <div className="text-xl font-bold leading-tight">{card(cardId)}</div>
        <div className="text-sm text-slate-500">{otherName}</div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full bg-slate-100 px-2 py-1 font-medium ${col.text}`}>
          {u(col.label)}{c.type === 'landmark' && ` — ${u(c.duration === 'ongoing' ? 'ongoing' : 'immediate')}`}
        </span>
        {c.type === 'establishment' && (
          <>
            <span className="rounded-full bg-slate-100 px-2 py-1">{u('activation')}: <b>{c.activation.join(', ')}</b></span>
            <span className="rounded-full bg-slate-100 px-2 py-1">{u('symbol')}: <span className="text-base">{SYMBOL_ICON[c.symbol]}</span> {symbol(c.symbol)}</span>
            <span className="rounded-full bg-amber-100 px-2 py-1">{u('cost', { n: c.cost })}</span>
          </>
        )}
        {c.type === 'landmark' && (
          <>
            <span className="rounded-full bg-amber-100 px-2 py-1">{u('landmark_costs', { c: c.costs.join(' / ') })}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">{u(c.scope === 'all_players' ? 'all_players' : 'builder_only')}</span>
          </>
        )}
      </div>
      <p className="font-body text-base leading-relaxed">{effect(cardId)}</p>
      {c.type === 'landmark' && c.buildConditionTh && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{u('condition')}: {u('loan_condition')}</p>
      )}
      <p className="mt-3 border-t pt-2 text-xs italic text-slate-500">{otherEffect}</p>
    </div>
  );
}

/** Per-city count of each symbol (every copy counts) — what combo cards and landmarks look at. */
export function SymbolSummary({ establishments, className = '' }: { establishments: Record<string, number>; className?: string }) {
  const { symbol: name } = useI18n();
  const counts = new Map<CardSymbol, number>();
  for (const [id, n] of Object.entries(establishments)) {
    const c = getCard(id);
    if (c.type === 'establishment') counts.set(c.symbol, (counts.get(c.symbol) ?? 0) + n);
  }
  const shown = COUNTED_SYMBOLS.filter((s) => counts.get(s));
  if (shown.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map((s) => (
        <span key={s} title={name(s)}
          className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-black/10">
          <span className="text-lg leading-none">{SYMBOL_ICON[s]}</span>{counts.get(s)}
        </span>
      ))}
    </div>
  );
}
