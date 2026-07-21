// ─────────────────────────────────────────────────────────────────────────────
// Part Number Builder — Series Configurations
//
// Validation strategy:
//   • catalogPrefixes  → when set, the component fetches actual catalog parts
//                         on series load and uses cross-product matching to
//                         determine which option combinations really exist.
//                         This is the source of truth — no hardcoded sets needed.
//   • validate()       → optional logic rule run in addition to catalog check
//                         (e.g. TOPJOB S variant restriction)
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentColor =
  | 'green' | 'blue' | 'red' | 'yellow' | 'orange' | 'purple' | 'teal';

export interface FilterOption {
  code: string;
  desc: string;
  /** When set, this option is only available when selections[filterId] === value for each entry. Used for dependent filters (e.g. Power Cage Clamp partCode depends on family). */
  when?: Record<string, string>;
}

export interface Filter {
  id: string;
  label: string;
  color: SegmentColor;
  options: FilterOption[];
  /** When set, this filter is only shown when selections[filterId] is in the given array. Used for conditional filters (e.g. 787 vs 2x87). */
  showWhen?: Record<string, string[]>;
}

export type Segment =
  | { type: 'filter'; filterId: string }
  | { type: 'fixed';  text: string }
  | { type: 'computed'; getText: (selections: Record<string, string>) => string };

export interface SeriesConfig {
  id: string;
  name: string;
  filters: Filter[];
  segments: Segment[];
  /** Computes the full part number string from the complete selection map */
  pnFormat: (values: Record<string, string>) => string;
  /**
   * Search query prefixes used to fetch real catalog parts for this series.
   * The component fetches ?q=prefix&limit=500 for each, merges results into
   * a Set<string>, and uses cross-product checking to determine valid options.
   * Omit only when the combination space is too large to pre-fetch
   * (e.g. TOPJOB S with 12 k+ combos) — fall back to validate() instead.
   */
  catalogPrefixes?: string[];
  /**
   * When true, the builder has a single "part" filter whose options are loaded
   * from the catalog (parts matching catalogPrefixes). Used for Power Cage Clamp.
   */
  dynamicPartList?: boolean;
  /**
   * When true, show an "Accessories" section for the selected part (excludes marking accessories).
   */
  showAccessories?: boolean;
  /**
   * Brochure-derived accessory part numbers by family (e.g. Power Cage Clamp 13|15|19|11).
   * When set, Accessories panel prefers this list for the part's family; catalog lookup fills in descriptions.
   */
  accessoryPartNumbersByFamily?: Record<string, string[]>;
  /**
   * Given a part number (e.g. 285-135), return the family key for accessoryPartNumbersByFamily.
   */
  getAccessoryFamilyFromPartNumber?: (partNumber: string) => string | null;
  /**
   * Additional logic-based validator run after catalog check.
   * Return false to mark a combination as invalid regardless of catalog.
   */
  validate?: (values: Record<string, string>) => boolean;
  /**
   * Maps a parent filter's option codes to catalog prefixes for a dynamic 'part' filter.
   * Catalog parts are tagged with `when` based on their matching prefix so that only
   * parts belonging to the selected parent option are shown.
   */
  partPrefixMap?: { parentFilterId: string; prefixes: Record<string, string> };
  /**
   * Extracts filterable attributes from a catalog part's description. Returned keys
   * must match filter IDs; values are added to the part's `when` tags. Return null
   * to exclude the part (e.g. accessories, optocouplers that shouldn't appear).
   * When set, the builder also populates dynamic options for each returned key
   * from the unique values across all parsed parts.
   */
  parsePartAttributes?: (partNumber: string, description: string) => Record<string, string> | null;
  /**
   * Preferred default selections for init and reset. Keys are filter IDs.
   * The builder will use these instead of picking the first available option.
   */
  defaultSelections?: Record<string, string>;
}

export interface Subcategory {
  id: string;
  label: string;
  config: SeriesConfig;
}

export interface Category {
  id: string;
  label: string;
  subcategories: Subcategory[];
}

// ─── TOPJOB S Rail-Mount Terminal Blocks ─────────────────────────────────────
// Format: {actuation}{size}-{tiers}{conductors}{color}{variant}
// Example: 2002-1201 = 20+02 - 1+2+01
//
// catalogPrefixes: 21 actuation+size combos (20/21/22 × 00/01/02/04/06/10/16).
// Fetched via bulk /parts/part-numbers; cross-product check grays out invalid options.

const topjobS: SeriesConfig = {
  id: 'topjob-s',
  name: 'TOPJOB S — 2xxx Series',
  catalogPrefixes: [
    '2000', '2001', '2002', '2004', '2006', '2010', '2016',
    '2100', '2101', '2102', '2104', '2106', '2110', '2116',
    '2200', '2201', '2202', '2204', '2206', '2210', '2216',
  ],
  filters: [
    {
      id: 'actuation', label: 'Actuation', color: 'green',
      options: [
        { code: '20', desc: 'Tool Operated  (Screwless CAGE CLAMP®)' },
        { code: '21', desc: 'Lever on Field Side  (PUSH WIRE®)' },
        { code: '22', desc: 'Push Button Operated' },
      ],
    },
    {
      id: 'size', label: 'Wire Size / Current', color: 'blue',
      options: [
        { code: '00', desc: '24–16 AWG · 10 A' },
        { code: '01', desc: '22–14 AWG · 15 A' },
        { code: '02', desc: '22–12 AWG · 20 A  (2.5 mm²)' },
        { code: '04', desc: '20–10 AWG · 30 A  (4 mm²)' },
        { code: '06', desc: '20–8 AWG  · 50 A  (6 mm²)' },
        { code: '10', desc: '20–6 AWG  · 65 A' },
        { code: '16', desc: '20–4 AWG  · 85 A' },
      ],
    },
    {
      id: 'tiers', label: 'Tiers', color: 'red',
      options: [
        { code: '1', desc: '1 Tier  (standard)' },
        { code: '2', desc: '2 Tiers' },
        { code: '3', desc: '3 Tiers' },
      ],
    },
    {
      id: 'conductors', label: 'Conductors', color: 'yellow',
      options: [
        { code: '2', desc: '2 Conductors' },
        { code: '3', desc: '3 Conductors' },
        { code: '4', desc: '4 Conductors' },
        { code: '6', desc: 'Fuse Block  2-Cond' },
        { code: '8', desc: 'Fuse Block  4-Cond' },
      ],
    },
    {
      id: 'color', label: 'Housing Color', color: 'orange',
      options: [
        { code: '01', desc: 'Gray' },
        { code: '02', desc: 'Orange' },
        { code: '03', desc: 'Red' },
        { code: '04', desc: 'Blue' },
        { code: '05', desc: 'Black' },
        { code: '06', desc: 'Yellow' },
        { code: '07', desc: 'Green-Yellow  (PE / Ground)' },
        { code: '09', desc: 'Light Gray' },
      ],
    },
    {
      id: 'variant', label: 'Variant', color: 'purple',
      options: [
        { code: '',          desc: 'Standard' },
        { code: '/1000-410', desc: 'Diode 1N4007 — anode left' },
        { code: '/1000-411', desc: 'Diode 1N4007 — anode right' },
        { code: '/1000-413', desc: 'LED 24 V — anode left' },
        { code: '/1000-434', desc: 'LED 24 V — anode right' },
      ],
    },
  ],
  segments: [
    { type: 'filter', filterId: 'actuation' },
    { type: 'filter', filterId: 'size' },
    { type: 'fixed',  text: '-' },
    { type: 'filter', filterId: 'tiers' },
    { type: 'filter', filterId: 'conductors' },
    { type: 'filter', filterId: 'color' },
    { type: 'filter', filterId: 'variant' },
  ],
  pnFormat: ({ actuation, size, tiers, conductors, color, variant }) => {
    if (variant) {
      // Component terminal blocks replace the color code with a type indicator:
      // 11 = diode module, 21 = LED module. The catalog stores them this way.
      const componentType = ['/1000-410', '/1000-411'].includes(variant) ? '11' : '21';
      return `${actuation}${size}-${tiers}${conductors}${componentType}${variant}`;
    }
    return `${actuation}${size}-${tiers}${conductors}${color}`;
  },
  defaultSelections: { actuation: '20', size: '02', tiers: '1', conductors: '2', color: '01', variant: '' },
};

// ─── 221 LEVER-NUTS® Splice Connectors ───────────────────────────────────────
// Format: 221-{cap}{cond}
// catalogPrefixes drives all availability — no hardcoded sets needed.

const leverNuts221: SeriesConfig = {
  id: '221-lever-nuts',
  name: '221 LEVER-NUTS®',
  catalogPrefixes: ['221-4', '221-6', '221-8'],
  filters: [
    {
      id: 'cap', label: 'Wire Capacity', color: 'green',
      options: [
        { code: '4', desc: 'Up to 4 mm²  (24–12 AWG)' },
        { code: '6', desc: 'Up to 6 mm²  (20–10 AWG)' },
        { code: '8', desc: 'Up to 8 mm²  (10–8 AWG)' },
      ],
    },
    {
      id: 'cond', label: 'Conductors', color: 'blue',
      options: [
        { code: '12', desc: '2 Conductors  (inline splice)' },
        { code: '13', desc: '3 Conductors  (T-junction)' },
        { code: '15', desc: '5 Conductors  (multi-branch)' },
        { code: '20', desc: '10 Conductors  (fan-out)' },
      ],
    },
  ],
  segments: [
    { type: 'fixed',  text: '221-' },
    { type: 'filter', filterId: 'cap' },
    { type: 'filter', filterId: 'cond' },
  ],
  pnFormat: ({ cap, cond }) => `221-${cap}${cond}`,
};

// ─── 787 (Gen 1) + 2x87 (Gen 2) DIN-Rail Power Supplies ─────────────────────
// 787 = Gen 1. 2x87 = Gen 2: 2587 BASE, 2687 ECO 2, 2787 PRO 2.
// 2x87 format: 2{series}87-2{phase}{current}; x1xx = 1-phase, x3xx = 3-phase;
// xx44=5A, xx46=10A, xx47=20A, xx48=40A. Special: 2787-2448 for PRO 2 1-phase 40 A.
// Catalog: 787- + 2587- + 2687- + 2787- so brochure items + 4 extra 2587 in catalog are included.
// No accessories for power supplies.

const powerSupply2x87CurrentOptions: FilterOption[] = [
  { code: '42', desc: '1.25 A @ 24 VDC' },
  { code: '43', desc: '2.5 A  @ 24 VDC' },
  { code: '44', desc: '5 A    @ 24 VDC' },
  { code: '46', desc: '10 A   @ 24 VDC' },
  { code: '47', desc: '20 A   @ 24 VDC' },
  { code: '48', desc: '40 A   @ 24 VDC' },
  { code: '34', desc: '10 A   @ 12 VDC (PRO 2)' },
  { code: '35', desc: '15 A   @ 12 VDC (PRO 2)' },
  { code: '54', desc: '2.5 A  @ 48 VDC (PRO 2)' },
  { code: '57', desc: '10 A   @ 48 VDC (PRO 2)' },
  { code: '58', desc: '20 A   @ 48 VDC (PRO 2)' },
];

function powerSupply787_2x87PnFormat(values: Record<string, string>): string {
  const { productLine, part, phase, current } = values;
  if (productLine === '787') return part || '';
  if (!productLine || productLine === '787' || !phase || !current) return '';
  const series = productLine === '2587' ? '5' : productLine === '2687' ? '6' : productLine === '2787' ? '7' : '';
  if (!series) return '';
  if (series === '7' && phase === '1' && current === '48') return '2787-2448';
  return `2${series}87-2${phase}${current}`;
}

const powerSupply787_2x87: SeriesConfig = {
  id: 'power-supply-787-2x87',
  name: 'Power Supplies (787 / 2x87)',
  catalogPrefixes: ['787-', '2587-', '2687-', '2787-'],
  /** Part options for Gen 1 (787) are loaded from catalog and stored in dynamicOptions['part']. */
  filters: [
    {
      id: 'productLine',
      label: 'Product line',
      color: 'green',
      options: [
        { code: '787', desc: '787 (Gen 1)' },
        { code: '2587', desc: '2587 BASE' },
        { code: '2687', desc: '2687 ECO 2' },
        { code: '2787', desc: '2787 PRO 2' },
      ],
    },
    {
      id: 'part',
      label: 'Part (787)',
      color: 'blue',
      options: [],
      showWhen: { productLine: ['787'] },
    },
    {
      id: 'phase',
      label: 'Input',
      color: 'orange',
      options: [
        { code: '1', desc: '1-Phase  (100–240 VAC)' },
        { code: '3', desc: '3-Phase  (400–500 VAC)' },
      ],
      showWhen: { productLine: ['2587', '2687', '2787'] },
    },
    {
      id: 'current',
      label: 'Output (voltage · current)',
      color: 'blue',
      options: powerSupply2x87CurrentOptions,
      showWhen: { productLine: ['2587', '2687', '2787'] },
    },
  ],
  segments: [
    {
      type: 'computed',
      getText: (s) => powerSupply787_2x87PnFormat(s) || '————',
    },
  ],
  pnFormat: powerSupply787_2x87PnFormat,
  defaultSelections: { productLine: '2787', phase: '1', current: '46' },
};

// ─── Power Cage Clamp® High-Current Terminal Blocks ──────────────────────────
// Nomenclature from brochure Power-CAGE-CLAMP-60369122: 285-(x)xxx
// 35 mm² (13x), 50 mm² (15x), 95 mm² (19x), 185 mm² (11xx). Light gray ex: 935, 950, 995, 1189.
// Accessories per family from brochure (marking excluded).

const powerCageClampPartCodes: FilterOption[] = [
  // 35 mm²: 6–35 mm² / 10–2 AWG
  { code: '131', desc: 'Orange', when: { family: '13' } },
  { code: '134', desc: 'Blue', when: { family: '13' } },
  { code: '135', desc: 'Gray', when: { family: '13' } },
  { code: '137', desc: 'Green-Yellow (PE)', when: { family: '13' } },
  { code: '935', desc: 'Light gray ex block', when: { family: '13' } },
  { code: '139', desc: 'Three-phase set', when: { family: '13' } },
  // 50 mm²: 10–50 mm² / 8–1/0 AWG
  { code: '150', desc: 'Gray', when: { family: '15' } },
  { code: '151', desc: 'Orange', when: { family: '15' } },
  { code: '154', desc: 'Blue', when: { family: '15' } },
  { code: '157', desc: 'Green-Yellow (PE)', when: { family: '15' } },
  { code: '950', desc: 'Light gray ex block', when: { family: '15' } },
  { code: '159', desc: 'Three-phase set', when: { family: '15' } },
  // 95 mm²: 25–95 mm² / 4–4/0 AWG
  { code: '191', desc: 'Orange', when: { family: '19' } },
  { code: '194', desc: 'Blue', when: { family: '19' } },
  { code: '195', desc: 'Gray', when: { family: '19' } },
  { code: '197', desc: 'Green-Yellow (PE)', when: { family: '19' } },
  { code: '995', desc: 'Light gray ex block', when: { family: '19' } },
  { code: '199', desc: 'Three-phase set', when: { family: '19' } },
  // 185 mm²: 50–185 mm² / 1/0–350 kcmil
  { code: '1181', desc: 'Orange', when: { family: '11' } },
  { code: '1184', desc: 'Blue', when: { family: '11' } },
  { code: '1185', desc: 'Gray', when: { family: '11' } },
  { code: '1187', desc: 'Green-Yellow (PE)', when: { family: '11' } },
  { code: '1189', desc: 'Light gray ex block', when: { family: '11' } },
  { code: '1169', desc: 'Three-phase set', when: { family: '11' } },
  // Mounting flange versions (brochure p.10–11)
  { code: '141', desc: '50 mm² flange — Gray', when: { family: '15' } },
  { code: '144', desc: '50 mm² flange — Blue', when: { family: '15' } },
  { code: '147', desc: '50 mm² flange — Green-Yellow', when: { family: '15' } },
  { code: '148', desc: '50 mm² flange three-phase', when: { family: '15' } },
  { code: '181', desc: '95 mm² flange — Gray', when: { family: '19' } },
  { code: '184', desc: '95 mm² flange — Blue', when: { family: '19' } },
  { code: '187', desc: '95 mm² flange — Green-Yellow', when: { family: '19' } },
  { code: '188', desc: '95 mm² flange three-phase', when: { family: '19' } },
  { code: '1161', desc: '185 mm² flange — Gray', when: { family: '11' } },
  { code: '1164', desc: '185 mm² flange — Blue', when: { family: '11' } },
  { code: '1167', desc: '185 mm² flange — Green-Yellow', when: { family: '11' } },
  { code: '1165', desc: '185 mm² flange three-phase', when: { family: '11' } },
];

// Brochure accessories by wire-size family (marking excluded). Key = family code 13|15|19|11.
export const POWER_CAGE_CLAMP_ACCESSORIES_BY_FAMILY: Record<string, string[]> = {
  '13': ['285-435', '285-430', '285-427', '285-420', '285-421', '285-172'], // 35 mm²: adjacent jumper, step-down jumper, power tap, warning cover, finger guard, tool
  '15': ['285-450', '285-447', '285-440', '285-441', '285-172'],             // 50 mm²
  '19': ['285-495', '285-407', '285-168', '285-170', '285-169', '285-172'], // 95 mm²: adjacent jumper, power tap, block-to-block, warning cover, finger guard, tool
  '11': ['285-1171', '285-1175', '285-1179', '285-1177', '285-1178', '285-172'],         // 185 mm²
};

function powerCageClampFamilyFromPartNumber(partNumber: string): string | null {
  const code = partNumber.replace(/^285-/, '');
  if (/^(13|93)/.test(code)) return '13';
  if (/^(15|95)/.test(code) || code === '950') return '15';
  if (/^(19|99)/.test(code) || code === '995') return '19';
  if (/^11/.test(code) || code === '1189') return '11';
  return null;
}

const powerCageClamp: SeriesConfig = {
  id: 'power-cage-clamp',
  name: 'Power Cage Clamp® — 285',
  catalogPrefixes: ['285-'],
  showAccessories: true,
  /** Brochure-derived accessory part numbers by family (marking excluded). */
  accessoryPartNumbersByFamily: POWER_CAGE_CLAMP_ACCESSORIES_BY_FAMILY,
  getAccessoryFamilyFromPartNumber: powerCageClampFamilyFromPartNumber,
  filters: [
    {
      id: 'family',
      label: 'Wire range / family',
      color: 'green',
      options: [
        { code: '13', desc: '35 mm² — 6–35 mm² / 10–2 AWG' },
        { code: '15', desc: '50 mm² — 10–50 mm² / 8–1/0 AWG' },
        { code: '19', desc: '95 mm² — 25–95 mm² / 4–4/0 AWG' },
        { code: '11', desc: '185 mm² — 50–185 mm² / 1/0–350 kcmil' },
      ],
    },
    {
      id: 'partCode',
      label: 'Part / color',
      color: 'blue',
      options: powerCageClampPartCodes,
    },
  ],
  segments: [
    { type: 'fixed', text: '285-' },
    { type: 'filter', filterId: 'partCode' },
  ],
  pnFormat: (values) => (values.partCode ? `285-${values.partCode}` : ''),
};

// ─── Relays ──────────────────────────────────────────────────────────────────
// Series → Coil Voltage → Contacts → Amperage → Part.
// Intermediate filter options and part list are populated from catalog
// descriptions at load time via parsePartAttributes. Only parts whose
// descriptions can be parsed (actual relay modules) are shown; accessories,
// optocouplers, signal conditioners, etc. are excluded.
// Excluded: 286 series per product team request.

function parseRelayAttributes(_pn: string, desc: string): Record<string, string> | null {
  // Exclude replacement/basic relay elements — only full relay modules belong in the finder.
  // "Basic relay" and "Basic solid-state relay" are plug-in replacement elements (xxx-1xx).
  // "Relay Element" (2585) and "Relay socket" are components, not complete assemblies.
  if (/^(Basic (relay|solid-state relay)|Relay Element|Relay socket)\b/i.test(desc)) return null;

  // ── Coil voltage ──
  let voltage: string | null = null;
  const nomMatch = desc.match(/Nominal input voltage:\s*(.+?)(?:;|$)/);
  if (nomMatch) {
    voltage = nomMatch[1].trim();
    // Normalize bare "24V" → prepend AC/DC|AC|DC hint from description prefix
    if (/^\d+V$/i.test(voltage)) {
      const typeHint = desc.match(/\b(AC\/DC|AC|DC)\s*;?\s*Nominal/i);
      if (typeHint) {
        const t = typeHint[1].toUpperCase();
        voltage = voltage.replace(/V$/i, t === 'AC/DC' ? ' V AC/DC' : t === 'AC' ? ' VAC' : ' VDC');
      }
    }
  }
  // 2585 format: "24 VDC Coil"
  if (!voltage) {
    const coilMatch = desc.match(/(\d+)\s*(VDC|VAC|V\s*AC(?:\/DC)?)\s+Coil/i);
    if (coilMatch) voltage = `${coilMatch[1]} ${coilMatch[2].trim().toUpperCase()}`;
  }

  // ── Contacts ──
  let contacts: string | null = null;
  const coMatch = desc.match(/(\d+)\s*changeover\s+contacts?/i);
  if (coMatch) contacts = `${coMatch[1]} c/o`;
  if (!contacts) {
    const coAbbr = desc.match(/(\d+)\s*CO\s+Contact/i);
    if (coAbbr) contacts = `${coAbbr[1]} c/o`;
  }
  if (!contacts) {
    const makeMatch = desc.match(/(\d+)\s*make\s+contacts?/i);
    if (makeMatch) contacts = `${makeMatch[1]} make`;
  }

  // ── Amperage ──
  const ampMatch = desc.match(/Limiting continuous current:\s*(.+?)(?:;|$)/);
  const amperage = ampMatch ? ampMatch[1].trim() : null;

  if (!voltage || !contacts) return null;

  const result: Record<string, string> = { coilVoltage: voltage, contacts };
  result.amperage = amperage ?? 'N/A';
  return result;
}

const relays: SeriesConfig = {
  id: 'relays',
  name: 'Relays',
  catalogPrefixes: ['857-', '788-', '858-', '2585-', '859-', '288-', '2042-', '789-'],
  partPrefixMap: {
    parentFilterId: 'series',
    prefixes: {
      '857':  '857-',
      '788':  '788-',
      '858':  '858-',
      '2585': '2585-',
      '859':  '859-',
      '288':  '288-',
      '2042': '2042-',
      '789':  '789-',
    },
  },
  parsePartAttributes: parseRelayAttributes,
  filters: [
    {
      id: 'series',
      label: 'Relay Type',
      color: 'green',
      options: [
        { code: '857',  desc: 'SLIM (857)' },
        { code: '788',  desc: 'Light Duty (788)' },
        { code: '858',  desc: 'Ice Cube (858)' },
        { code: '2585', desc: 'ECO Ice Cube (2585)' },
        { code: '859',  desc: 'Classic (859)' },
        { code: '288',  desc: 'Fixed Mount (288)' },
        { code: '2042', desc: 'TJS Pluggable (2042)' },
        { code: '789',  desc: 'Enclosed (789)' },
      ],
    },
    {
      id: 'coilVoltage',
      label: 'Coil Voltage',
      color: 'orange',
      options: [],
    },
    {
      id: 'contacts',
      label: 'Contacts',
      color: 'red',
      options: [],
    },
    {
      id: 'amperage',
      label: 'Contact Rating',
      color: 'yellow',
      options: [],
    },
    {
      id: 'part',
      label: 'Part',
      color: 'blue',
      options: [],
    },
  ],
  segments: [
    { type: 'computed', getText: (s) => s.part || '————' },
  ],
  pnFormat: ({ part }) => part || '',
  defaultSelections: { series: '857', coilVoltage: '24 VDC', contacts: '1 c/o', amperage: '6 A', part: '857-304' },
};

// ─── Gelbox® Connector Insulation ────────────────────────────────────────────
// Series 207: gel-filled enclosures for insulating 221 / 2773 splices.
// Format: 207-{gauge}{size}
//   gauge: 13 = 12 AWG (for 221 & 2773), 14 = 10 AWG (for 221 only)
//   size:  31/32/33 = Size 1/2/3, 72/73 = Inline 2/3 cond. (12 AWG only)
// Catalog stores these under internal IDs (604xxxxx), not 207- prefixes,
// so catalogPrefixes is omitted; `when` conditions handle validity.

const gelbox207: SeriesConfig = {
  id: 'gelbox-207',
  name: 'Gelbox® — 207',
  filters: [
    {
      id: 'gauge',
      label: 'Wire Gauge',
      color: 'green',
      options: [
        { code: '13', desc: '12 AWG — for 221 & 2773' },
        { code: '14', desc: '10 AWG — for 221' },
      ],
    },
    {
      id: 'size',
      label: 'Size / Form',
      color: 'blue',
      options: [
        { code: '31', desc: 'Size 1 — 2 conductors' },
        { code: '32', desc: 'Size 2 — 3 conductors' },
        { code: '33', desc: 'Size 3 — 5 conductors' },
        { code: '72', desc: 'Inline — 2 conductors', when: { gauge: '13' } },
        { code: '73', desc: 'Inline — 3 conductors', when: { gauge: '13' } },
      ],
    },
  ],
  segments: [
    { type: 'fixed', text: '207-' },
    { type: 'filter', filterId: 'gauge' },
    { type: 'filter', filterId: 'size' },
  ],
  pnFormat: ({ gauge, size }) => (gauge && size) ? `207-${gauge}${size}` : '',
  defaultSelections: { gauge: '13', size: '31' },
};

// ─── Master registry ──────────────────────────────────────────────────────────

export const CATEGORIES: Category[] = [
  {
    id: 'terminal-blocks',
    label: 'Terminal Blocks',
    subcategories: [
      { id: 'topjob-s',         label: 'TOPJOB S (2xxx)',              config: topjobS },
      { id: 'power-cage-clamp', label: 'Power Cage Clamp®',            config: powerCageClamp },
    ],
  },
  {
    id: 'splice-connectors',
    label: 'Splice Connectors',
    subcategories: [
      { id: '221-lever-nuts',   label: '221 LEVER-NUTS®',              config: leverNuts221 },
      { id: 'gelbox-207',       label: 'Gelbox® (207)',                 config: gelbox207 },
    ],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    subcategories: [
      { id: 'power-supply-787-2x87', label: 'Power Supplies', config: powerSupply787_2x87 },
      { id: 'relays',                label: 'Relays',         config: relays },
    ],
  },
];
