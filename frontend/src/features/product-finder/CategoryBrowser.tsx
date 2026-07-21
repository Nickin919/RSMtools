import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronLeft, Package, Check } from 'lucide-react';
import { publicApi, CategoryNode } from '../../lib/publicApi';
import clsx from 'clsx';

interface Props {
  /**
   * Called whenever the effective category selection changes.
   * categoryIds is a comma-separated string of selected IDs (may be one or many).
   * displayName is a human-readable label for the active filter badge.
   */
  onCategorySelect: (categoryIds: string, displayName: string) => void;
  /** Currently active category IDs (comma-separated) for visual feedback */
  activeCategoryIds?: string | null;
}

interface BreadcrumbItem {
  id: string;
  name: string;
  children: CategoryNode[];
}

// L1 accent palette
const L1_ACCENTS = [
  { active: 'bg-wago-primary border-wago-primary', chip: 'border-wago-primary/30 hover:border-wago-primary/60', selected: 'bg-wago-primary/10 border-wago-primary text-wago-secondary' },
  { active: 'bg-blue-600 border-blue-600',          chip: 'border-blue-200 hover:border-blue-400',              selected: 'bg-blue-50 border-blue-500 text-blue-900' },
  { active: 'bg-purple-600 border-purple-600',       chip: 'border-purple-200 hover:border-purple-400',          selected: 'bg-purple-50 border-purple-500 text-purple-900' },
];

const CategoryBrowser = ({ onCategorySelect, activeCategoryIds }: Props) => {
  const [selectedL1Index, setSelectedL1Index] = useState(0);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [childrenCache, setChildrenCache] = useState<Map<string, CategoryNode[]>>(new Map());
  // IDs of leaf chips selected at the current level (multi-select)
  const [selectedLeafIds, setSelectedLeafIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-categories'],
    queryFn: async () => {
      const { data } = await publicApi.getPublicCategories();
      return data.categories;
    },
    staleTime: 5 * 60 * 1000,
  });

  const l1Categories = data ?? [];
  const selectedL1 = l1Categories[selectedL1Index];

  // Parent category of the current chip level (for the "All …" chip)
  const currentParent: { id: string; name: string } | null =
    breadcrumb.length > 0
      ? { id: breadcrumb[breadcrumb.length - 1].id, name: breadcrumb[breadcrumb.length - 1].name }
      : selectedL1
        ? { id: selectedL1.id, name: selectedL1.name }
        : null;

  const currentLevel: CategoryNode[] =
    breadcrumb.length > 0
      ? breadcrumb[breadcrumb.length - 1].children
      : (selectedL1?.children ?? []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Emit the selection upstream and reset leaf selection */
  const emitSelection = useCallback((ids: string[], names: string[]) => {
    if (ids.length === 0) return;
    const displayName =
      names.length === 1
        ? names[0]
        : `${names[0]} + ${names.length - 1} more`;
    onCategorySelect(ids.join(','), displayName);
  }, [onCategorySelect]);

  /** Clear leaf selections and reset results (call when navigating levels) */
  const clearLeafSelection = () => setSelectedLeafIds(new Set());

  // ── Event handlers ─────────────────────────────────────────────────────────

  const handleL1Select = (index: number) => {
    setSelectedL1Index(index);
    setBreadcrumb([]);
    clearLeafSelection();
  };

  const handleAllChip = useCallback(() => {
    if (!currentParent) return;
    clearLeafSelection();
    emitSelection([currentParent.id], [currentParent.name]);
  }, [currentParent, emitSelection]);

  const handleChipClick = useCallback(async (cat: CategoryNode) => {
    if (cat.childCount > 0) {
      // Drill into this category — fetch children if not yet cached
      let children = childrenCache.get(cat.id);
      if (!children) {
        try {
          const { data } = await publicApi.getCategoryChildren(cat.id);
          children = data.children;
          setChildrenCache(prev => new Map(prev).set(cat.id, children!));
        } catch {
          children = [];
        }
      }
      clearLeafSelection();
      setBreadcrumb(prev => [...prev, { id: cat.id, name: cat.name, children }]);
    } else {
      // Leaf chip — toggle multi-select
      setSelectedLeafIds(prev => {
        const next = new Set(prev);
        if (next.has(cat.id)) {
          next.delete(cat.id);
        } else {
          next.add(cat.id);
        }

        // Collect names for display label
        const leafMap = new Map(currentLevel.map(c => [c.id, c.name]));
        const selectedEntries = [...next].map(id => ({ id, name: leafMap.get(id) ?? id }));
        if (selectedEntries.length > 0) {
          emitSelection(selectedEntries.map(e => e.id), selectedEntries.map(e => e.name));
        }
        return next;
      });
    }
  }, [childrenCache, currentLevel, emitSelection]);

  const handleBreadcrumbNav = (index: number) => {
    clearLeafSelection();
    setBreadcrumb(prev => prev.slice(0, index + 1));
  };

  const handleBackToL2 = () => {
    clearLeafSelection();
    setBreadcrumb([]);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 w-40 bg-gray-100 animate-pulse rounded-[1px]" />)}
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-9 w-36 bg-gray-100 animate-pulse rounded-[1px]" />)}
        </div>
      </div>
    );
  }

  if (isError || l1Categories.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Categories unavailable</p>
      </div>
    );
  }

  const accent = L1_ACCENTS[selectedL1Index % L1_ACCENTS.length];
  const activeIdSet = new Set((activeCategoryIds ?? '').split(',').filter(Boolean));

  return (
    <div className="space-y-4">

      {/* L1 tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {l1Categories.map((cat, i) => {
          const acc = L1_ACCENTS[i % L1_ACCENTS.length];
          return (
            <button
              key={cat.id}
              onClick={() => handleL1Select(i)}
              className={clsx(
                'px-4 py-2 text-sm font-semibold border rounded-[1px] transition-all duration-150',
                selectedL1Index === i
                  ? clsx(acc.active, 'text-white shadow-sm')
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              {cat.name}
              <span className={clsx('ml-2 text-xs font-normal', selectedL1Index === i ? 'opacity-75' : 'text-gray-400')}>
                {cat.totalPartCount.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Breadcrumb */}
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 text-sm text-gray-500 flex-wrap">
          <button
            onClick={handleBackToL2}
            className="flex items-center gap-1 text-wago-secondary hover:text-wago-primary font-medium transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {selectedL1?.name}
          </button>
          {breadcrumb.map((bc, i) => (
            <span key={bc.id} className="flex items-center gap-1">
              <ChevronRight className="w-4 h-4 text-gray-300" />
              {i < breadcrumb.length - 1 ? (
                <button onClick={() => handleBreadcrumbNav(i)} className="hover:text-wago-primary font-medium transition-colors">
                  {bc.name}
                </button>
              ) : (
                <span className="text-wago-secondary font-semibold">{bc.name}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Chip grid */}
      <div className="flex flex-wrap gap-2">
        {currentLevel.length === 0 && (
          <p className="text-sm text-gray-400 italic py-2">No subcategories</p>
        )}

        {/* "All [parent]" chip */}
        {currentParent && currentLevel.length > 0 && (
          <button
            onClick={handleAllChip}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 border rounded-[1px] text-sm font-semibold transition-all duration-150',
              selectedLeafIds.size === 0 && activeIdSet.has(currentParent.id)
                ? clsx(accent.active, 'text-white shadow-sm')
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400'
            )}
          >
            All {currentParent.name}
            <span className="text-xs font-normal opacity-60">
              {currentLevel.reduce((s, c) => s + c.totalPartCount, 0).toLocaleString()}
            </span>
          </button>
        )}

        {/* Category chips */}
        {currentLevel.map(cat => {
          const hasChildren = cat.childCount > 0;
          const isLeafSelected = selectedLeafIds.has(cat.id);
          const isActiveViaParent = !hasChildren && activeIdSet.has(cat.id) && !isLeafSelected;

          return (
            <button
              key={cat.id}
              onClick={() => handleChipClick(cat)}
              title={cat.shortText ?? cat.name}
              className={clsx(
                'group flex items-center gap-2 px-3 py-2 border rounded-[1px] text-sm transition-all duration-150',
                isLeafSelected
                  ? clsx(accent.selected, 'font-semibold shadow-sm')
                  : isActiveViaParent
                    ? clsx(accent.selected, 'font-medium')
                    : clsx('bg-white text-gray-800 hover:bg-gray-50', accent.chip, 'border')
              )}
            >
              {/* Checkbox indicator for leaf chips */}
              {!hasChildren && (
                <span className={clsx(
                  'flex-shrink-0 w-4 h-4 rounded-sm border flex items-center justify-center transition-all',
                  isLeafSelected
                    ? 'bg-current border-current'
                    : 'border-gray-300 group-hover:border-gray-500'
                )}>
                  {isLeafSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
              )}

              <span className="font-medium leading-tight text-left">{cat.name}</span>

              <span className={clsx('ml-auto text-xs tabular-nums shrink-0', isLeafSelected ? 'opacity-75' : 'text-gray-400')}>
                {cat.totalPartCount.toLocaleString()}
              </span>

              {hasChildren && (
                <ChevronRight className={clsx(
                  'w-3.5 h-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 text-gray-400'
                )} />
              )}
            </button>
          );
        })}
      </div>

      {/* Hint */}
      {breadcrumb.length === 0 && currentLevel.length > 0 && (
        <p className="text-xs text-gray-400">
          Check multiple subcategories to combine results.
          Categories with <ChevronRight className="inline w-3 h-3" /> drill down further.
        </p>
      )}
    </div>
  );
};

export default CategoryBrowser;
