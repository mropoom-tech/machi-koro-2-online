// Regenerates data/*.json from src/cards.ts (the single source of truth in code).
// Run: npm run export-data -w packages/game-engine
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_DECK, ESTABLISHMENTS, LANDMARKS } from '../src';

const out = (name: string, data: unknown) =>
  writeFileSync(resolve(__dirname, '../../../data', name), JSON.stringify(data, null, 2) + '\n', 'utf8');

out('establishments_th.json', ESTABLISHMENTS);
out('landmarks_th.json', LANDMARKS);
out('cards_localized.json', [...ESTABLISHMENTS, ...LANDMARKS].map((c) => ({
  id: c.id, type: c.type, name_en: c.nameEn, name_th: c.nameTh, effect_en: c.effectEn, effect_th: c.effectTh,
})));
out('deck_manifest_TO_FILL.json', {
  status: 'UNVERIFIED — fill quantity_in_deck from the original rulebook/component list, then set it in src/cards.ts',
  rulebook_totals: { establishments: 86, landmarks: 20 },
  cards: [...ESTABLISHMENTS, ...LANDMARKS].map((c) => ({ id: c.id, quantity_in_deck: c.quantityInDeck })),
  demo_only_fixture: DEMO_DECK.copies,
});
out('asset_manifest.json', {
  status: 'No card art in the repository. UI renders cards from data with emoji icons.',
  cards: [...ESTABLISHMENTS, ...LANDMARKS].map((c) => ({ id: c.id, asset_path: c.assetPath })),
});
console.log('data/ exported');
