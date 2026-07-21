import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Grid3x3, Wrench, Package, ChevronDown, ExternalLink, X } from 'lucide-react'
import { publicApi, PartResult } from '../../lib/publicApi'
import CategoryBrowser from './CategoryBrowser'
import NomenclatureBuilder from './NomenclatureBuilder'
import clsx from 'clsx'

type Tab = 'search' | 'browse' | 'builder'

const PAGE_SIZE = 24

interface PartCardProps {
  part: PartResult
}

const PartCard = ({ part }: PartCardProps) => {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="bg-white border border-gray-200 rounded-[1px] flex flex-col hover:shadow-md transition-shadow duration-150">
      <div className="relative bg-gray-50 border-b border-gray-100 flex items-center justify-center h-36 overflow-hidden">
        {part.thumbnailUrl != null && !imgError ? (
          <img
            src={part.thumbnailUrl}
            alt={part.partNumber}
            className="max-h-32 max-w-full object-contain p-2"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center text-gray-300">
            <Package className="w-10 h-10 mb-1" />
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono font-semibold text-wago-secondary text-sm leading-tight">
            {part.partNumber}
          </span>
          <a
            href={`https://www.wago.com/global/search#!q=${part.partNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-wago-primary transition-colors shrink-0 mt-0.5"
            title="View on wago.com"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {part.categoryName && (
          <span className="inline-flex self-start items-center px-2 py-0.5 rounded-[1px] bg-wago-primary/10 text-wago-secondary text-xs font-medium leading-tight border border-wago-primary/20">
            {part.categoryName}
          </span>
        )}

        <p className="text-xs text-gray-600 line-clamp-3 leading-snug flex-1">
          {part.description || <span className="italic text-gray-400">No description</span>}
        </p>
      </div>
    </div>
  )
}

export default function ProductFinder() {
  const [activeTab, setActiveTab] = useState<Tab>('builder')
  const [statusMsg, setStatusMsg] = useState('')

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [searchLoading, setSearchLoading] = useState(false)
  const autocompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [activeCategoryIds, setActiveCategoryIds] = useState<string | null>(null)
  const [activeCategoryName, setActiveCategoryName] = useState('')

  const [results, setResults] = useState<PartResult[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastSearchParams, setLastSearchParams] = useState<{ q?: string; categoryIds?: string } | null>(null)

  const handleQueryChange = (val: string) => {
    setQuery(val)
    setHighlightedIndex(-1)
    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current)
    if (val.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    autocompleteTimer.current = setTimeout(async () => {
      try {
        const { data } = await publicApi.autocompleteParts(val.trim(), 8)
        setSuggestions((data.results ?? []).map((r) => r.partNumber))
        setShowSuggestions(true)
      } catch {
        setSuggestions([])
      }
    }, 200)
  }

  const handleAutocompleteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      handleSuggestionClick(suggestions[highlightedIndex])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setHighlightedIndex(-1)
    }
  }

  const commitSearch = useCallback(async (q: string, catIds?: string, resetOffset = true) => {
    const trimmed = q.trim()
    if (!trimmed && !catIds) return
    setShowSuggestions(false)
    setStatusMsg('')
    const params = { q: trimmed || undefined, categoryIds: catIds }
    setLastSearchParams(params)
    const newOffset = resetOffset ? 0 : offset
    if (resetOffset) setOffset(0)

    const isLoadMore = !resetOffset
    if (isLoadMore) setLoadingMore(true)
    else if (trimmed) setSearchLoading(true)

    try {
      const { data } = await publicApi.searchParts({
        q: params.q,
        categoryIds: params.categoryIds,
        limit: PAGE_SIZE,
        offset: newOffset,
      })
      if (isLoadMore) {
        setResults((prev) => [...prev, ...(data.results ?? [])])
      } else {
        setResults(data.results ?? [])
      }
      setTotal(data.total ?? 0)
      if (!isLoadMore && (data.results?.length ?? 0) === 0) {
        setStatusMsg('No products found')
      }
    } catch {
      setStatusMsg('Search failed')
      if (!isLoadMore) setResults([])
    } finally {
      setSearchLoading(false)
      setLoadingMore(false)
    }
  }, [offset])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length < 2) {
      setStatusMsg('Enter at least 2 characters')
      return
    }
    commitSearch(query)
  }

  const handleSuggestionClick = (s: string) => {
    setQuery(s)
    setSuggestions([])
    setShowSuggestions(false)
    setHighlightedIndex(-1)
    commitSearch(s)
  }

  const handleCategorySelect = useCallback((categoryIds: string, displayName: string) => {
    setActiveCategoryIds(categoryIds)
    setActiveCategoryName(displayName)
    setResults([])
    setTotal(0)
    setOffset(0)
    commitSearch('', categoryIds, true)
  }, [commitSearch])

  const clearCategoryFilter = () => {
    setActiveCategoryIds(null)
    setActiveCategoryName('')
    setResults([])
    setTotal(0)
    setLastSearchParams(null)
  }

  const handleBuilderSearch = (partNumber: string) => {
    commitSearch(partNumber, undefined, true)
  }

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    if (lastSearchParams) {
      commitSearch(lastSearchParams.q ?? '', lastSearchParams.categoryIds, false)
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const wrapper = inputRef.current?.closest('.autocomplete-wrapper')
      if (wrapper && !wrapper.contains(e.target as Node)) {
        setShowSuggestions(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'builder', label: 'Part Number Builder', icon: Wrench },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'browse', label: 'Browse by Category', icon: Grid3x3 },
  ]

  const hasMore = results.length > 0 && results.length < total

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-wago-secondary">Product Finder</h1>
        <p className="text-gray-500 text-sm mt-1">
          Search WAGO&apos;s catalog by keyword, category, or part number. No login required.
        </p>
        {statusMsg && <p className="mt-2 text-sm text-amber-700">{statusMsg}</p>}
      </div>

      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150 -mb-px',
              activeTab === tab.id
                ? 'border-wago-primary text-wago-secondary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'search' && (
        <div className="mb-6">
          <form onSubmit={handleSearchSubmit}>
            <div className="autocomplete-wrapper relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onKeyDown={handleAutocompleteKeyDown}
                placeholder="Search by part number or description…"
                className="input pl-9 pr-24"
              />
              <button
                type="submit"
                disabled={searchLoading}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary h-8 px-3 text-sm"
              >
                {searchLoading ? 'Searching…' : 'Search'}
              </button>

              {showSuggestions && suggestions.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-[1px] overflow-hidden"
                >
                  {suggestions.map((s, i) => (
                    <li key={s} role="option" aria-selected={i === highlightedIndex}>
                      <button
                        type="button"
                        onMouseDown={() => handleSuggestionClick(s)}
                        onMouseEnter={() => setHighlightedIndex(i)}
                        className={clsx(
                          'w-full text-left px-4 py-2.5 text-sm font-mono transition-colors',
                          i === highlightedIndex
                            ? 'bg-wago-primary/10 text-wago-secondary'
                            : 'text-gray-800 hover:bg-gray-50'
                        )}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </form>
          <p className="text-xs text-gray-400 mt-2">
            Try &quot;750-1506&quot;, &quot;power supply&quot;, or &quot;terminal block&quot;
          </p>
        </div>
      )}

      {activeTab === 'browse' && (
        <div className="mb-6">
          {activeCategoryIds && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-wago-primary/5 border border-wago-primary/20 rounded-[1px]">
              <span className="text-sm text-wago-secondary font-medium">
                Showing: <span className="text-wago-primary">{activeCategoryName}</span>
              </span>
              <span className="text-gray-400 text-sm">— {total.toLocaleString()} parts</span>
              <button
                type="button"
                onClick={clearCategoryFilter}
                className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear filter"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <CategoryBrowser
            onCategorySelect={handleCategorySelect}
            activeCategoryIds={activeCategoryIds}
          />
        </div>
      )}

      {activeTab === 'builder' && (
        <div className="mb-6">
          <NomenclatureBuilder onSearch={handleBuilderSearch} />
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              Showing <span className="font-semibold text-wago-secondary">{results.length}</span> of{' '}
              <span className="font-semibold text-wago-secondary">{total.toLocaleString()}</span> results
              {lastSearchParams?.q && (
                <>
                  {' '}
                  for <span className="font-semibold italic">&quot;{lastSearchParams.q}&quot;</span>
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {results.map((part) => (
              <PartCard key={part.id} part={part} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn-secondary flex items-center gap-2"
              >
                {loadingMore ? (
                  'Loading…'
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" /> Load more ({total - results.length} remaining)
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {results.length === 0 && lastSearchParams && !searchLoading && (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">No products found</p>
          <p className="text-sm mt-1">Try a different keyword or browse by category</p>
        </div>
      )}

      {results.length === 0 && !lastSearchParams && !searchLoading && activeTab !== 'builder' && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-wago-primary/10 mb-4">
            <Search className="w-7 h-7 text-wago-primary" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Find WAGO Products</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Use Search to find parts by keyword, Browse by Category to navigate the product hierarchy, or Part
            Number Builder for series-based lookup.
          </p>
        </div>
      )}
    </div>
  )
}
