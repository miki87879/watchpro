import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../api/client'

export interface CurrencyMeta {
  symbol: string
  name: string
  flag: string
}

interface CurrencyRates {
  [code: string]: number
}

interface CurrencyContextType {
  selectedCurrency: string
  setSelectedCurrency: (c: string) => void
  rates: CurrencyRates
  meta: Record<string, CurrencyMeta>
  supported: string[]
  formatPrice: (amountUSD: number | null | undefined, sourceCurrency?: string) => string
  convertToSelected: (amountUSD: number) => number
  loading: boolean
}

const CurrencyContext = createContext<CurrencyContextType | null>(null)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [selectedCurrency, setSelectedCurrencyState] = useState<string>(
    () => localStorage.getItem('preferred_currency') || 'USD'
  )
  const [rates, setRates] = useState<CurrencyRates>({
    USD: 1, EUR: 0.92, GBP: 0.79, ILS: 3.70, CHF: 0.89,
    JPY: 149, AUD: 1.53, CAD: 1.36, HKD: 7.82, SGD: 1.34,
    NOK: 10.5, SEK: 10.4, DKK: 6.88,
  })
  const [meta, setMeta] = useState<Record<string, CurrencyMeta>>({
    USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
    EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺' },
    ILS: { symbol: '₪', name: 'שקל ישראלי', flag: '🇮🇱' },
  })
  const [supported, setSupported] = useState<string[]>(['USD', 'EUR', 'ILS', 'GBP', 'CHF'])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/currency/rates')
      .then((res) => {
        setRates(res.data.rates || {})
        setMeta(res.data.meta || {})
        setSupported(res.data.supported || [])
      })
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false))
  }, [])

  const setSelectedCurrency = (c: string) => {
    localStorage.setItem('preferred_currency', c)
    setSelectedCurrencyState(c)
  }

  /**
   * Format a price. If sourceCurrency is given (e.g. from Price Scout),
   * first convert source→USD, then USD→selectedCurrency.
   * If no sourceCurrency, assume input is already in USD.
   */
  const formatPrice = (amount: number | null | undefined, sourceCurrency?: string): string => {
    if (amount == null || isNaN(amount)) return '—'
    const m = meta[selectedCurrency]
    const sym = m?.symbol || selectedCurrency

    // Convert: source → USD → selected
    let usdAmount = amount
    if (sourceCurrency && sourceCurrency !== 'USD' && rates[sourceCurrency]) {
      usdAmount = amount / rates[sourceCurrency] // to USD
    }
    const converted = usdAmount * (rates[selectedCurrency] || 1)

    // Format with locale
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(converted))

    return `${sym}${formatted}`
  }

  const convertToSelected = (amountUSD: number): number => {
    return amountUSD * (rates[selectedCurrency] || 1)
  }

  return (
    <CurrencyContext.Provider
      value={{ selectedCurrency, setSelectedCurrency, rates, meta, supported, formatPrice, convertToSelected, loading }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be inside CurrencyProvider')
  return ctx
}
