import type { Category } from '../services/aiCategoryMap';

/**
 * Keyword → category mapping dictionary.
 * Min 40 terms, includes Filipino/Taglish per spec.
 */
const categoryMappings: Record<string, Category> = {
  // ── Food ─────────────────────────────────────────────────────────────────
  lunch: 'food',
  tanghalian: 'food',
  meryenda: 'food',
  agahan: 'food',
  hapunan: 'food',
  kain: 'food',
  pagkain: 'food',
  ulam: 'food',
  sinaing: 'food',
  sinigang: 'food',
  adobo: 'food',
  fishball: 'food',
  isaw: 'food',
  'halo-halo': 'food',
  buko: 'food',
  sorbetes: 'food',
  breakfast: 'food',
  dinner: 'food',
  snack: 'food',
  coffee: 'food',
  'milk tea': 'food',
  grocery: 'food',
  groceries: 'food',
  palengke: 'food',
  burger: 'food',
  pizza: 'food',
  rice: 'food',

  // ── Transport ─────────────────────────────────────────────────────────────
  pasahe: 'transport',
  sakay: 'transport',
  angkas: 'transport',
  jeep: 'transport',
  jeepney: 'transport',
  trike: 'transport',
  tricycle: 'transport',
  bus: 'transport',
  mrt: 'transport',
  lrt: 'transport',
  grab: 'transport',
  fare: 'transport',
  taxi: 'transport',

  // ── Bills ─────────────────────────────────────────────────────────────────
  load: 'bills',
  eload: 'bills',
  'e-load': 'bills',
  paload: 'bills',
  kuryente: 'bills',
  meralco: 'bills',
  tubig: 'bills',
  internet: 'bills',
  wifi: 'bills',
  'piso wifi': 'bills',
  bayad: 'bills',
  rent: 'bills',
  water: 'bills',

  // ── Health ────────────────────────────────────────────────────────────────
  gamot: 'health',
  medisina: 'health',
  botika: 'health',
  doctor: 'health',
  hospital: 'health',
  pharmacy: 'health',
  medicine: 'health',

  // ── Shopping ─────────────────────────────────────────────────────────────
  damit: 'shopping',
  sapatos: 'shopping',
  shopee: 'shopping',
  lazada: 'shopping',
  sulat: 'shopping',
  nota: 'shopping',
  clothes: 'shopping',
  shoes: 'shopping',
  mall: 'shopping',
};

export default categoryMappings;
