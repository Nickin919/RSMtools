import { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingCart, LogIn, ExternalLink, RotateCcw, Ban, Loader2 } from 'lucide-react';
import { publicApi, PartResult } from '../../lib/publicApi';
import { CATEGORIES, SeriesConfig, SegmentColor, Filter, FilterOption } from './builderConfigs';
import clsx from 'clsx';

interface Props {
  onSearch: (partNumber: string) => void;
  onAddToQuote?: (part: PartResult) => void;
  canQuote?: boolean;
}

// ── Color maps (soft, brand-aligned palette) ────────────────────────────────────

const SEGMENT_BG: Record<SegmentColor, string> = {
  green:  'bg-emerald-600/80 text-white',
  blue:   'bg-slate-500 text-white',
  red:    'bg-rose-400 text-white',
  yellow: 'bg-amber-300 text-amber-900',
  orange: 'bg-orange-400 text-white',
  purple: 'bg-violet-400 text-white',
  teal:   'bg-teal-500 text-white',
};

const SEGMENT_DIM: Record<SegmentColor, string> = {
  green:  'bg-emerald-50 text-emerald-300 border border-emerald-200',
  blue:   'bg-slate-50 text-slate-300 border border-slate-200',
  red:    'bg-rose-50 text-rose-300 border border-rose-200',
  yellow: 'bg-amber-50 text-amber-300 border border-amber-200',
  orange: 'bg-orange-50 text-orange-300 border border-orange-200',
  purple: 'bg-violet-50 text-violet-300 border border-violet-200',
  teal:   'bg-teal-50 text-teal-300 border border-teal-200',
};

const COL_HEADER: Record<SegmentColor, string> = {
  green:  'bg-emerald-600/80',
  blue:   'bg-slate-500',
  red:    'bg-rose-400',
  yellow: 'bg-amber-300 !text-amber-900',
  orange: 'bg-orange-400',
  purple: 'bg-violet-400',
  teal:   'bg-teal-500',
};

const ITEM_ACTIVE: Record<SegmentColor, string> = {
  green:  'bg-emerald-50 border-emerald-400 text-emerald-800',
  blue:   'bg-slate-50 border-slate-400 text-slate-700',
  red:    'bg-rose-50 border-rose-400 text-rose-700',
  yellow: 'bg-amber-50 border-amber-400 text-amber-800',
  orange: 'bg-orange-50 border-orange-400 text-orange-700',
  purple: 'bg-violet-50 border-violet-400 text-violet-700',
  teal:   'bg-teal-50 border-teal-400 text-teal-700',
};

const CODE_COLOR: Record<SegmentColor, string> = {
  green:  'text-emerald-700',
  blue:   'text-slate-600',
  red:    'text-rose-600',
  yellow: 'text-amber-700',
  orange: 'text-orange-600',
  purple: 'text-violet-600',
  teal:   'text-teal-600',
};

/** Filters that are visible given current selections (showWhen satisfied). */
function getVisibleFilters(config: SeriesConfig, selections: Record<string, string>): Filter[] {
  return config.filters.filter(
    (f) =>
      !f.showWhen ||
      Object.entries(f.showWhen).every(([key, allowed]) => allowed.includes(selections[key] ?? ''))
  );
}

// ── Catalog cross-product check ───────────────────────────────────────────────
//
// Given a partial selection map (some filters set, others not), recursively
// tries all option combinations for unset filters and returns true as soon as
// any generated part number appears in the catalog set.
//
// This is the source-of-truth availability check — no hardcoded rules needed.

function anyComboInCatalog(
  config: SeriesConfig,
  catalogParts: Set<string>,
  currentSelections: Record<string, string>,
  remainingFilters: Filter[],
  getOptions: (f: Filter, sel: Record<string, string>) => FilterOption[],
): boolean {
  if (remainingFilters.length === 0) {
    return catalogParts.has(config.pnFormat(currentSelections));
  }
  const [next, ...rest] = remainingFilters;
  const options = getOptions(next, currentSelections);
  return options.some(opt =>
    anyComboInCatalog(config, catalogParts, { ...currentSelections, [next.id]: opt.code }, rest, getOptions)
  );
}

function isOptionAvailable(
  config: SeriesConfig,
  catalogParts: Set<string> | null,
  selections: Record<string, string>,
  filterId: string,
  code: string,
  getOptionsForFilter: (f: Filter, sel: Record<string, string>) => FilterOption[],
): boolean {
  const testSel = { ...selections, [filterId]: code };

  // For attribute-parsed configs (relays), pnFormat only uses the part code,
  // so intermediate filter changes don't alter the generated PN. Clear all
  // filters downstream of the one being checked to force the recursive
  // cross-product check to re-enumerate valid combinations.
  if (config.parsePartAttributes) {
    const idx = config.filters.findIndex((f) => f.id === filterId);
    for (let i = idx + 1; i < config.filters.length; i++) {
      delete testSel[config.filters[i].id];
    }
  }

  // Always run logic-based validator if present (e.g. TOPJOB S variant rule)
  if (config.validate && !config.validate(testSel)) return false;

  // Catalog-driven check — only when we have data; consider only visible filters
  if (catalogParts) {
    const visible = getVisibleFilters(config, testSel);
    const unset = visible.filter((f) => testSel[f.id] === undefined);
    return anyComboInCatalog(config, catalogParts, testSel, unset, getOptionsForFilter);
  }

  // No catalog data yet (or series has no catalogPrefixes) → allow all
  return true;
}

// ── Result panel ──────────────────────────────────────────────────────────────

const ResultPanel = ({
  partNumber, onSearch, onAddToQuote, canQuote,
}: {
  partNumber: string;
  onSearch: (pn: string) => void;
  onAddToQuote?: (part: PartResult) => void;
  canQuote?: boolean;
}) => {
  const [part, setPart]       = useState<PartResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!partNumber) return;
    setLoading(true);
    setPart(null);
    publicApi
      .searchParts({ q: partNumber, limit: 1 })
      .then(({ data }) => {
        const results = data.results ?? [];
        const exact = results.find(r => r.partNumber === partNumber)
          ?? results.find(r => r.description?.startsWith(partNumber));
        setPart(exact ?? null);
      })
      .catch(() => setPart(null))
      .finally(() => setLoading(false));
  }, [partNumber]);

  return (
    <div className="mt-8 pt-6 border-t border-gray-200 text-center space-y-3">
      <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">Generated Part Number</p>
      <p className="font-mono font-bold text-2xl text-gray-800">{partNumber}</p>

      {loading && <p className="text-sm text-gray-400 animate-pulse">Looking up in catalog…</p>}

      {!loading && part && (
        <div className="inline-block text-left">
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-[1px] max-w-lg">
            {part.categoryName && (
              <span className="inline-flex mb-1 px-2 py-0.5 rounded-[1px] bg-wago-primary/10 text-wago-secondary text-xs font-medium border border-wago-primary/20">
                {part.categoryName}
              </span>
            )}
            <p className="text-sm text-gray-700 leading-snug">{part.description}</p>
          </div>
        </div>
      )}

      {!loading && !part && (
        <p className="text-sm text-gray-400">Part details temporarily unavailable.</p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <button
          onClick={() => onSearch(partNumber)}
          className="px-4 py-2 bg-wago-secondary text-white text-sm font-medium rounded-[1px] hover:bg-wago-darkgreen transition-colors"
        >
          Search this part
        </button>
        {part && onAddToQuote && (
          <button
            onClick={() => onAddToQuote(part)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-[1px] border transition-colors',
              canQuote
                ? 'border-wago-primary/40 text-wago-secondary hover:bg-wago-primary hover:border-wago-primary hover:text-white'
                : 'border-gray-200 text-gray-400'
            )}
          >
            {canQuote
              ? <><ShoppingCart className="w-3.5 h-3.5" /> Add to Quote</>
              : <><LogIn className="w-3.5 h-3.5" /> Sign in to quote</>}
          </button>
        )}
        <a
          href={`https://www.wago.com/global/search#!q=${partNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 text-gray-600 rounded-[1px] hover:border-gray-400 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          wago.com ↗
        </a>
      </div>
    </div>
  );
};

// ── Accessories panel (for Power Cage Clamp, etc.) ───────────────────────────

const AccessoriesPanel = ({
  partNumber,
  config,
  onSearch,
  onAddToQuote,
  canQuote,
}: {
  partNumber: string;
  config: SeriesConfig | null;
  onSearch: (pn: string) => void;
  onAddToQuote?: (part: PartResult) => void;
  canQuote?: boolean;
}) => {
  const [accessories, setAccessories] = useState<PartResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!partNumber) return;
    setLoading(true);
    setAccessories([]);

    const brochureList =
      config?.accessoryPartNumbersByFamily &&
      config?.getAccessoryFamilyFromPartNumber &&
      config.getAccessoryFamilyFromPartNumber(partNumber) != null
        ? config.accessoryPartNumbersByFamily[config.getAccessoryFamilyFromPartNumber(partNumber)!] ?? []
        : null;

    if (brochureList?.length) {
      publicApi
        .getPartsByPartNumbers(brochureList)
        .then(({ data }) => setAccessories(data.results ?? []))
        .catch(() => setAccessories([]))
        .finally(() => setLoading(false));
    } else {
      publicApi
        .getPartAccessories(partNumber)
        .then(({ data }) => setAccessories(data.results ?? []))
        .catch(() => setAccessories([]))
        .finally(() => setLoading(false));
    }
  }, [partNumber, config]);

  if (loading) {
    return (
      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-2">Accessories</p>
        <p className="text-sm text-gray-400 animate-pulse">Loading accessories…</p>
      </div>
    );
  }
  if (accessories.length === 0) return null;

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <p className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-1">Accessories</p>
      <p className="text-xs text-gray-500 mb-3">Compatible accessories for this wire size (from product brochure; marking accessories excluded).</p>
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {accessories.map((acc) => (
          <li
            key={acc.id}
            className="flex flex-wrap items-center gap-2 py-2 px-3 bg-gray-50 border border-gray-100 rounded-[1px] text-left"
          >
            <span className="font-mono text-sm font-semibold text-gray-800">{acc.partNumber}</span>
            <span className="text-sm text-gray-600 flex-1 min-w-0 line-clamp-2">{acc.description}</span>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onSearch(acc.partNumber)}
                className="text-xs font-medium text-wago-secondary hover:underline"
              >
                Search
              </button>
              {onAddToQuote && (
                <button
                  type="button"
                  onClick={() => onAddToQuote(acc)}
                  className={clsx(
                    'text-xs font-medium',
                    canQuote ? 'text-wago-primary hover:underline' : 'text-gray-400'
                  )}
                >
                  {canQuote ? 'Add to Quote' : 'Sign in to quote'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ── Option column ─────────────────────────────────────────────────────────────

const OptionColumn = ({
  filter,
  options,
  config,
  catalogParts,
  catalogLoading,
  selections,
  onSelect,
  dynamicPartList,
  getOptionsForFilter,
}: {
  filter: Filter;
  options: FilterOption[];
  config: SeriesConfig;
  catalogParts: Set<string> | null;
  catalogLoading: boolean;
  selections: Record<string, string>;
  onSelect: (filterId: string, code: string) => void;
  dynamicPartList?: boolean;
  getOptionsForFilter?: (f: Filter, sel: Record<string, string>) => FilterOption[];
}) => {
  const currentCode = selections[filter.id];
  const getOpts = getOptionsForFilter ?? (() => options);

  const availability = options.map(opt => ({
    opt,
    available:
      dynamicPartList ||
      catalogLoading
        ? true
        : isOptionAvailable(config, catalogParts, selections, filter.id, opt.code, (f, sel) => getOpts(f, sel)),
  }));

  const unavailableCount = dynamicPartList ? 0 : availability.filter(a => !a.available).length;

  return (
    <div className="bg-white border border-gray-200 rounded-[1px] overflow-hidden flex flex-col">
      <div className={clsx('px-3 py-2 text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2', COL_HEADER[filter.color])}>
        {filter.label}
        {catalogLoading && <Loader2 className="w-3 h-3 animate-spin opacity-60 ml-auto" />}
      </div>

      <div className="p-2 space-y-1 flex-1">
        {availability.map(({ opt, available }) => {
          const isActive = currentCode === opt.code;

          return (
            <button
              key={opt.code}
              onClick={() => available && onSelect(filter.id, opt.code)}
              disabled={!available}
              title={!available ? 'Not available with current selection' : undefined}
              className={clsx(
                'w-full text-left px-3 py-2 rounded-[1px] border text-sm transition-all duration-100 flex items-start gap-2',
                !available
                  ? 'cursor-not-allowed bg-gray-50 border-transparent'
                  : isActive
                    ? clsx('border font-semibold', ITEM_ACTIVE[filter.color])
                    : 'text-gray-700 bg-white border-transparent hover:bg-gray-50 hover:border-gray-200 cursor-pointer'
              )}
            >
              {!available ? (
                <Ban className="w-3.5 h-3.5 mt-0.5 text-gray-300 shrink-0" />
              ) : (
                <span className={clsx(
                  'font-mono font-semibold text-xs shrink-0 mt-0.5 min-w-[2rem] text-right',
                  CODE_COLOR[filter.color]
                )}>
                  {opt.code || '∅'}
                </span>
              )}
              <span className={clsx('leading-snug', !available ? 'text-gray-300 line-through' : '')}>
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>

      {unavailableCount > 0 && !catalogLoading && (
        <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100 bg-gray-50 flex items-center gap-1">
          <Ban className="w-3 h-3 shrink-0" />
          {unavailableCount} option{unavailableCount !== 1 ? 's' : ''} not in catalog with current selection
        </div>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

// Default to TOPJOB S so users land on the richest builder immediately
const DEFAULT_CATEGORY    = 'terminal-blocks';
const DEFAULT_SUBCATEGORY = 'topjob-s';

const NomenclatureBuilder = ({ onSearch, onAddToQuote, canQuote }: Props) => {
  const [categoryId,    setCategoryId]    = useState(DEFAULT_CATEGORY);
  const [subcategoryId, setSubcategoryId] = useState(DEFAULT_SUBCATEGORY);
  const [selections,    setSelections]    = useState<Record<string, string>>({});

  // Catalog validation state
  const [catalogParts,   setCatalogParts]   = useState<Set<string> | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, FilterOption[]>>({});
  const fetchAbort = useRef<AbortController | null>(null);

  const selectedCategory    = CATEGORIES.find(c => c.id === categoryId);
  const selectedSubcategory = selectedCategory?.subcategories.find(s => s.id === subcategoryId);
  const config: SeriesConfig | null = selectedSubcategory?.config ?? null;

  // ── Fetch catalog parts (and dynamic part list when applicable) ───────────
  useEffect(() => {
    fetchAbort.current?.abort();
    setCatalogParts(null);
    setDynamicOptions({});

    if (!config?.catalogPrefixes?.length) return;

    const controller = new AbortController();
    fetchAbort.current = controller;
    setCatalogLoading(true);

    const dynamicPartList = config.dynamicPartList === true;
    const unifiedPowerSupply = config.filters.some((f) => f.id === 'part' && f.showWhen);

    if (dynamicPartList) {
      publicApi
        .getPartsByPrefixes(config.catalogPrefixes)
        .then(({ data }) => {
          if (controller.signal.aborted) return;
          const results = data.results ?? [];
          setCatalogParts(new Set(results.map((r) => r.partNumber)));
          const partFilter = config.filters.find((f) => f.id === 'part');
          if (partFilter) {
            setDynamicOptions({
              [partFilter.id]: results.map((r) => ({
                code: r.partNumber,
                desc: r.description || r.partNumber,
              })),
            });
          }
          setCatalogLoading(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setCatalogParts(new Set());
            setDynamicOptions({});
            setCatalogLoading(false);
          }
        });
      return () => controller.abort();
    }

    const hasPartPrefixMap = !!config.partPrefixMap;

    if (unifiedPowerSupply || hasPartPrefixMap) {
      publicApi
        .getPartsByPrefixes(config.catalogPrefixes, 1000)
        .then(({ data }) => {
          if (controller.signal.aborted) return;
          const results = data.results ?? [];
          setCatalogParts(new Set(results.map((r) => r.partNumber)));

          if (config.partPrefixMap) {
            const map = config.partPrefixMap;
            const hasParser = !!config.parsePartAttributes;
            const attrSets: Record<string, Set<string>> = {};

            const partOptions: FilterOption[] = results
              .map((r) => {
                const seriesMatch = Object.entries(map.prefixes).find(([, prefix]) => r.partNumber.startsWith(prefix));
                if (!seriesMatch) return null;

                const baseWhen: Record<string, string> = { [map.parentFilterId]: seriesMatch[0] };

                if (hasParser) {
                  const attrs = config.parsePartAttributes!(r.partNumber, r.description || '');
                  if (!attrs) return null;
                  Object.entries(attrs).forEach(([key, val]) => {
                    baseWhen[key] = val;
                    (attrSets[key] ??= new Set()).add(val);
                  });
                }

                return {
                  code: r.partNumber,
                  desc: r.description || r.partNumber,
                  when: baseWhen,
                };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);

            const dynOpts: Record<string, FilterOption[]> = { part: partOptions };
            for (const [key, vals] of Object.entries(attrSets)) {
              dynOpts[key] = [...vals].sort((a, b) => {
                const na = parseFloat(a), nb = parseFloat(b);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.localeCompare(b);
              }).map((v) => ({ code: v, desc: v }));
            }
            setDynamicOptions((prev) => ({ ...prev, ...dynOpts }));
          } else {
            const partOptions = results
              .filter((r) => r.partNumber.startsWith('787-'))
              .map((r) => ({ code: r.partNumber, desc: r.description || r.partNumber }));
            setDynamicOptions((prev) => (partOptions.length ? { ...prev, part: partOptions } : prev));
          }
          setCatalogLoading(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setCatalogParts(new Set());
            setCatalogLoading(false);
          }
        });
      return () => controller.abort();
    }

    const useBulk = config.catalogPrefixes.length > 5;
    const promise = useBulk
      ? publicApi
          .getPartNumbers(config.catalogPrefixes)
          .then(({ data }) => data.partNumbers ?? [])
      : Promise.all(
          config.catalogPrefixes.map(prefix =>
            publicApi
              .searchParts({ q: prefix, limit: 500 })
              .then(({ data }) => (data.results ?? []).map((r) => r.partNumber))
              .catch(() => [] as string[])
          )
        ).then((results) => results.flat());

    promise
      .then((partNumbers) => {
        if (controller.signal.aborted) return;
        setCatalogParts(new Set(partNumbers));
        setCatalogLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCatalogParts(new Set());
          setCatalogLoading(false);
        }
      });

    return () => controller.abort();
  }, [subcategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initialise selections to first valid option per filter ───────────────
  useEffect(() => {
    if (!config) return;
    const preferred = config.defaultSelections ?? {};
    const defaults: Record<string, string> = {};
    for (const f of config.filters) {
      if (f.showWhen && !Object.entries(f.showWhen).every(([k, v]) => v.includes(defaults[k] ?? ''))) continue;
      if (preferred[f.id] !== undefined) { defaults[f.id] = preferred[f.id]; continue; }
      const base = dynamicOptions[f.id] ?? f.options;
      const filtered = base.some((o) => o.when)
        ? base.filter((opt) => !opt.when || Object.entries(opt.when).every(([id, val]) => defaults[id] === val))
        : base;
      defaults[f.id] = filtered[0]?.code ?? '';
    }
    setSelections(defaults);
  }, [subcategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When dynamic options load, set initial values for any empty dynamic filters.
  // For parsePartAttributes configs, use isOptionAvailable to pick the first
  // option that actually has valid downstream combinations.
  useEffect(() => {
    if (!config) return;
    const partFilter = config.filters.find((f) => f.id === 'part');
    const isUnifiedPower = partFilter?.showWhen && selections.productLine === '787';
    const hasDynamic = config.dynamicPartList || isUnifiedPower || !!config.partPrefixMap;
    if (!hasDynamic) return;

    const preferred = config.defaultSelections ?? {};
    setSelections((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const f of config.filters) {
        const opts = dynamicOptions[f.id];
        if (!opts?.length || next[f.id]) continue;

        const filtered = opts.some((o) => o.when)
          ? opts.filter((o) => !o.when || Object.entries(o.when as Record<string, string>).every(([k, v]) => next[k] === v))
          : opts;
        const candidates = filtered.length ? filtered : opts;

        let code = '';
        // Try the preferred default first, but only if it's valid for current selections.
        if (preferred[f.id] !== undefined && candidates.some((o) => o.code === preferred[f.id])) {
          if (!config.parsePartAttributes || !catalogParts ||
              isOptionAvailable(config, catalogParts, { ...next, [f.id]: preferred[f.id] }, f.id, preferred[f.id], getOptionsForFilterRef)) {
            code = preferred[f.id];
          }
        }

        if (!code) {
          if (config.parsePartAttributes && catalogParts) {
            const valid = candidates.find((o) =>
              isOptionAvailable(config, catalogParts, { ...next, [f.id]: o.code }, f.id, o.code, getOptionsForFilterRef)
            );
            code = valid?.code ?? candidates[0]?.code ?? '';
          } else {
            code = candidates[0]?.code ?? '';
          }
        }
        if (code) { next[f.id] = code; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [config, dynamicOptions, catalogParts, selections]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-validate current selections whenever catalog data arrives ─────────
  // (skip when dynamicPartList — all options are valid)
  const getOptionsForFilterRef = useCallback(
    (f: Filter, sel: Record<string, string>) => {
      const base = dynamicOptions[f.id] ?? f.options;
      const withWhen = base.some((o) => 'when' in o && o.when);
      if (!withWhen) return base;
      return base.filter((opt) => {
        if (!opt.when) return true;
        return Object.entries(opt.when).every(([id, value]) => sel[id] === value);
      });
    },
    [dynamicOptions]
  );

  useEffect(() => {
    if (!config || !catalogParts || config.dynamicPartList) return;
    setSelections((prev) => {
      const next = { ...prev };
      const visible = getVisibleFilters(config, next);
      for (const f of visible) {
        const val = next[f.id];
        if (val === undefined) continue;
        const optionsList = getOptionsForFilterRef(f, next);
        if (!isOptionAvailable(config, catalogParts, next, f.id, val, getOptionsForFilterRef)) {
          const fallback = optionsList.find((o) =>
            isOptionAvailable(config, catalogParts, next, f.id, o.code, getOptionsForFilterRef)
          );
          if (fallback) next[f.id] = fallback.code;
          else delete next[f.id];
        }
      }
      return next;
    });
  }, [catalogParts, config?.dynamicPartList, getOptionsForFilterRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    setSubcategoryId('');
    setSelections({});
    setCatalogParts(null);
  };

  const handleSubcategoryChange = (id: string) => {
    setSubcategoryId(id);
  };

  const handleOptionClick = useCallback((filterId: string, code: string) => {
    if (!config) return;
    setSelections(prev => {
      const next = { ...prev, [filterId]: code };

      // For attribute-parsed configs (relays), clear everything downstream of
      // the changed filter. The dynamic-options useEffect will re-fill them
      // with the first valid values for the new upstream selection.
      if (config.parsePartAttributes) {
        const idx = config.filters.findIndex((f) => f.id === filterId);
        for (let i = idx + 1; i < config.filters.length; i++) {
          delete next[config.filters[i].id];
        }
        return next;
      }

      const visible = getVisibleFilters(config, next);

      // When a dependency filter (e.g. family or productLine) changes, clear dependent filters and set first valid
      for (const f of visible) {
        if (f.id === filterId) continue;
        const currentVal = next[f.id];
        const opts = getOptionsForFilterRef(f, next);
        const stillValid = opts.some((o) => o.code === currentVal);
        if (!stillValid) {
          const fallback = opts.find(o =>
            isOptionAvailable(config, catalogParts, { ...next, [f.id]: o.code }, f.id, o.code, getOptionsForFilterRef)
          );
          if (fallback) next[f.id] = fallback.code;
          else delete next[f.id];
        }
      }
      // Catalog validation: clear if current value not in catalog
      for (const f of visible) {
        const val = next[f.id];
        if (val === undefined) continue;
        if (!isOptionAvailable(config, catalogParts, next, f.id, val, getOptionsForFilterRef)) {
          const opts = getOptionsForFilterRef(f, next);
          const fallback = opts.find(o =>
            isOptionAvailable(config, catalogParts, { ...next, [f.id]: o.code }, f.id, o.code, getOptionsForFilterRef)
          );
          if (fallback) next[f.id] = fallback.code;
          else delete next[f.id];
        }
      }
      return next;
    });
  }, [config, catalogParts, getOptionsForFilterRef]);

  const handleReset = () => {
    if (!config) return;
    const preferred = config.defaultSelections ?? {};
    const defaults: Record<string, string> = {};
    for (const f of config.filters) {
      if (f.showWhen && !Object.entries(f.showWhen).every(([k, v]) => v.includes(defaults[k] ?? ''))) continue;
      if (preferred[f.id] !== undefined) { defaults[f.id] = preferred[f.id]; continue; }
      const base = dynamicOptions[f.id] ?? f.options;
      const filtered = base.some((o) => o.when)
        ? base.filter((opt) => !opt.when || Object.entries(opt.when).every(([id, val]) => defaults[id] === val))
        : base;
      const candidates = filtered.length ? filtered : base;
      if (config.parsePartAttributes && catalogParts) {
        const valid = candidates.find((o) =>
          isOptionAvailable(config, catalogParts, { ...defaults, [f.id]: o.code }, f.id, o.code, getOptionsForFilterRef)
        );
        defaults[f.id] = valid?.code ?? candidates[0]?.code ?? '';
      } else {
        defaults[f.id] = candidates[0]?.code ?? '';
      }
    }
    setSelections(defaults);
  };

  const getOptionsForFilter = (f: Filter, currentSelections: Record<string, string> = selections): FilterOption[] => {
    const base = dynamicOptions[f.id] ?? f.options;
    const withWhen = base.some((o) => 'when' in o && o.when);
    if (!withWhen) return base;
    return base.filter((opt) => {
      if (!opt.when) return true;
      return Object.entries(opt.when).every(([filterId, value]) => currentSelections[filterId] === value);
    });
  };

  const visibleFilters = config ? getVisibleFilters(config, selections) : [];
  const allFilled =
    config !== null &&
    visibleFilters.every((f) => {
      const v = selections[f.id];
      return v !== undefined && v !== '';
    });
  const partNumber = allFilled && config ? config.pnFormat(selections) : null;
  const partInCatalog = partNumber && (!catalogParts || catalogParts.has(partNumber));

  return (
    <div className="space-y-6">

      {/* ── Master filters ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
          <select
            value={categoryId}
            onChange={e => handleCategoryChange(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-[1px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wago-primary/40"
          >
            <option value="">Select a category…</option>
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Product Series</label>
          <select
            value={subcategoryId}
            onChange={e => handleSubcategoryChange(e.target.value)}
            disabled={!selectedCategory}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-[1px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-wago-primary/40 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">Select a series…</option>
            {selectedCategory?.subcategories.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {config ? (
        <>
          {/* ── Part number display ── */}
          <div className="bg-white border border-gray-200 rounded-[1px] p-6 text-center shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-4 font-medium">
              {config.name}
            </p>

            {/* Colored segment row */}
            <div className="flex items-center justify-center gap-1 flex-wrap min-h-[4.5rem]">
              {config.segments.map((seg, i) => {
                if (seg.type === 'fixed') {
                  return (
                    <span key={i} className="text-3xl sm:text-5xl font-bold text-gray-400 select-none">
                      {seg.text}
                    </span>
                  );
                }
                if (seg.type === 'computed') {
                  const text = seg.getText(selections);
                  return (
                    <span
                      key={i}
                      className={clsx(
                        'inline-flex items-center justify-center px-3 py-2 sm:px-5 sm:py-3 rounded-[2px]',
                        'text-2xl sm:text-4xl font-bold font-mono transition-all duration-200',
                        text && text !== '————' ? 'bg-slate-500 text-white' : 'bg-slate-50 text-slate-300 border border-slate-200'
                      )}
                    >
                      {text || '?'}
                    </span>
                  );
                }

                const filter   = config.filters.find(f => f.id === seg.filterId)!;
                const value    = selections[seg.filterId];
                const hasValue = value !== undefined && value !== '';

                // Don't render the variant segment when it's the empty/standard option
                if (seg.filterId === 'variant' && !hasValue) return null;

                return (
                  <span
                    key={i}
                    className={clsx(
                      'inline-flex items-center justify-center px-3 py-2 sm:px-5 sm:py-3 rounded-[2px]',
                      'text-3xl sm:text-5xl font-bold font-mono min-w-[2.5rem] transition-all duration-200',
                      hasValue ? SEGMENT_BG[filter.color] : SEGMENT_DIM[filter.color]
                    )}
                  >
                    {hasValue ? value : '?'}
                  </span>
                );
              })}
            </div>

            {allFilled && partNumber && (
              <p className="mt-4 text-sm text-gray-500">
                Full part number:{' '}
                <span className="font-mono font-bold text-gray-800">{partNumber}</span>
              </p>
            )}

            <div className="mt-3 flex items-center justify-center gap-3">
              {catalogLoading && (
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading catalog for validation…
                </span>
              )}
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
          </div>

          {/* ── Options grid (only visible filters) ── */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.min(visibleFilters.length, 3)}, minmax(0, 1fr))` }}
          >
            {visibleFilters.map((filter) => (
              <OptionColumn
                key={filter.id}
                filter={filter}
                options={getOptionsForFilter(filter, selections)}
                config={config}
                catalogParts={catalogParts}
                catalogLoading={catalogLoading}
                selections={selections}
                onSelect={handleOptionClick}
                dynamicPartList={config.dynamicPartList}
                getOptionsForFilter={getOptionsForFilterRef}
              />
            ))}
          </div>

          {/* ── Result panel (only when this combination exists in catalog) ── */}
          {allFilled && partNumber && partInCatalog && (
            <>
              <ResultPanel
                partNumber={partNumber}
                onSearch={onSearch}
                onAddToQuote={onAddToQuote}
                canQuote={canQuote}
              />
              {config.showAccessories && (
                <AccessoriesPanel
                  partNumber={partNumber}
                  config={config}
                  onSearch={onSearch}
                  onAddToQuote={onAddToQuote}
                  canQuote={canQuote}
                />
              )}
            </>
          )}
        </>
      ) : (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-[1px]">
          <p className="text-4xl mb-3">🔧</p>
          <p className="text-sm font-semibold text-gray-500 mb-1">Select a category and series above</p>
          <p className="text-xs text-gray-400">
            Choose from TOPJOB S terminal blocks, 221 LEVER-NUTS, 2x87 power supplies, and more.
          </p>
        </div>
      )}
    </div>
  );
};

export default NomenclatureBuilder;
