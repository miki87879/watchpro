import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SimilarModel {
  reference: string
  nickname: string | null
  note: string
}

export interface WatchResult {
  brand: string
  model: string
  reference: string
  nickname: string | null
  confidence: number
  year_introduced: number | null
  still_in_production: boolean | null
  serial_year: number | null
  case_material: string | null
  case_size_mm: number | null
  case_thickness_mm: number | null
  lug_width_mm: number | null
  movement: string | null
  power_reserve_hours: number | null
  water_resistance_m: number | null
  crystal: string | null
  bracelet: string | null
  clasp: string | null
  dial_color: string | null
  dial_description: string | null
  bezel: string | null
  retail_price_usd: number | null
  market_values: {
    mint_full_set: number | null
    excellent_with_papers: number | null
    excellent_no_papers: number | null
    good: number | null
    fair: number | null
  }
  investment_grade: 'A+' | 'A' | 'B' | 'C' | 'D'
  investment_reasoning: string
  price_trend: 'rising' | 'stable' | 'falling'
  price_trend_note: string
  best_time_to_buy: string
  authentication_tips: string[]
  red_flags: string[]
  similar_models: SimilarModel[]
  collector_notes: string
  availability: string
  historical_significance: string
  box_papers_premium: string
  reference_image_url: string | null
  production_year_range: string | null
  year_significance_note: string | null
  known_variants_by_year: string | null
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function cacheKey(queryType: string, query: string): string {
  return `wid_${queryType}_${query.trim().toLowerCase().replace(/\s+/g, '-')}`
}

function readCache(key: string): WatchResult | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts: number; data: WatchResult }
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

function writeCache(key: string, data: WatchResult): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // storage quota exceeded — ignore
  }
}

export function clearWatchCache(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('wid_')) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}

// ─── Context types ─────────────────────────────────────────────────────────────
interface WatchSearchState {
  loading: boolean
  result: WatchResult | null
  error: string | null
  query: string
  queryType: 'reference' | 'serial' | 'name'
  imagePreview: string | null
  fromCache: boolean
}

interface WatchSearchContextValue extends WatchSearchState {
  startSearch: (params: {
    query: string
    queryType: 'reference' | 'serial' | 'name'
    imageBase64: string | null
    imagePreview: string | null
  }) => void
  cancelSearch: () => void
  clearResult: () => void
}

// ─── Context ───────────────────────────────────────────────────────────────────
const WatchSearchContext = createContext<WatchSearchContextValue | null>(null)

export function useWatchSearch(): WatchSearchContextValue {
  const ctx = useContext(WatchSearchContext)
  if (!ctx) throw new Error('useWatchSearch must be used within WatchSearchProvider')
  return ctx
}

// ─── Provider ──────────────────────────────────────────────────────────────────
export function WatchSearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WatchSearchState>({
    loading: false,
    result: null,
    error: null,
    query: '',
    queryType: 'reference',
    imagePreview: null,
    fromCache: false,
  })

  const abortRef = useRef<AbortController | null>(null)

  const cancelSearch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const clearResult = useCallback(() => {
    setState((prev) => ({ ...prev, result: null, error: null, fromCache: false }))
  }, [])

  const startSearch = useCallback(
    (params: {
      query: string
      queryType: 'reference' | 'serial' | 'name'
      imageBase64: string | null
      imagePreview: string | null
    }) => {
      // Cancel any in-flight request
      cancelSearch()

      const { query, queryType, imageBase64, imagePreview } = params
      const isPureText = !imageBase64

      // Check cache for pure text queries
      if (isPureText && query.trim()) {
        const key = cacheKey(queryType, query)
        const cached = readCache(key)
        if (cached) {
          setState({
            loading: false,
            result: cached,
            error: null,
            query,
            queryType,
            imagePreview,
            fromCache: true,
          })
          return
        }
      }

      setState({
        loading: true,
        result: null,
        error: null,
        query,
        queryType,
        imagePreview,
        fromCache: false,
      })

      const controller = new AbortController()
      abortRef.current = controller

      const payload = {
        query: queryType !== 'serial' ? query.trim() || null : null,
        serial: queryType === 'serial' ? query.trim() || null : null,
        image_base64: imageBase64,
        query_type: query.trim() ? queryType : null,
      }

      const apiBase = import.meta.env.VITE_API_URL ?? ''

      fetch(`${apiBase}/api/watch-id/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }))
            throw new Error((err as { detail?: string }).detail || `שגיאת שרת ${res.status}`)
          }
          return res.json() as Promise<WatchResult>
        })
        .then((data) => {
          // Write to cache for pure text queries
          if (isPureText && query.trim()) {
            writeCache(cacheKey(queryType, query), data)
          }
          setState((prev) => ({
            ...prev,
            loading: false,
            result: data,
            error: null,
            fromCache: false,
          }))
        })
        .catch((e: unknown) => {
          if (e instanceof Error && e.name === 'AbortError') return
          const msg = e instanceof Error ? e.message : String(e)
          const friendly =
            msg.includes('422') || msg.includes('non-JSON')
              ? 'לא ניתן לזהות את השעון. נסה לספק פרטים מדויקים יותר.'
              : msg
          setState((prev) => ({
            ...prev,
            loading: false,
            error: friendly,
          }))
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null
        })
    },
    [cancelSearch]
  )

  return (
    <WatchSearchContext.Provider value={{ ...state, startSearch, cancelSearch, clearResult }}>
      {children}
    </WatchSearchContext.Provider>
  )
}
