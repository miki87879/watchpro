import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

interface Props {
  compact?: boolean
}

export default function CurrencySelector({ compact = false }: Props) {
  const { selectedCurrency, setSelectedCurrency, meta, supported, rates } = useCurrency()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = meta[selectedCurrency]

  // Compact version — used in forms / headers
  if (compact) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((p) => !p)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: open ? 'rgba(212,175,55,0.2)' : 'rgba(212,175,55,0.08)',
            border: '1px solid rgba(212,175,55,0.3)',
            color: '#d4af37',
          }}
        >
          <span className="text-sm">{current?.flag || '🌐'}</span>
          <span>{selectedCurrency}</span>
          <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : '', transition: '0.15s' }} />
        </button>

        {open && (
          <div
            className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden shadow-2xl"
            style={{
              background: '#0f0d06',
              border: '1px solid rgba(212,175,55,0.35)',
              minWidth: 180,
            }}
          >
            <div className="max-h-56 overflow-y-auto">
              {supported.map((code) => {
                const m = meta[code]
                const isSelected = code === selectedCurrency
                return (
                  <button
                    key={code}
                    onClick={() => { setSelectedCurrency(code); setOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-all"
                    style={{
                      background: isSelected ? 'rgba(212,175,55,0.12)' : 'transparent',
                      color: isSelected ? '#d4af37' : '#9ca3af',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span className="text-base w-5 text-center">{m?.flag}</span>
                    <span className="font-bold w-8 text-left">{code}</span>
                    <span className="opacity-50 flex-1 text-left">{m?.name}</span>
                    <span className="font-bold opacity-70">{m?.symbol}</span>
                    {isSelected && <Check size={11} style={{ color: '#d4af37' }} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Full sidebar version
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all"
        style={{
          background: open ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.07)'}`,
          color: '#d4af37',
        }}
      >
        <span className="text-lg">{current?.flag || '🌐'}</span>
        <div className="flex-1 text-right">
          <span className="text-sm font-bold">{selectedCurrency}</span>
          <span className="text-xs opacity-50 mr-1.5">{current?.name}</span>
        </div>
        <span className="text-xs font-bold opacity-60">{current?.symbol}</span>
        <ChevronDown
          size={13}
          style={{ transform: open ? 'rotate(180deg)' : '', transition: 'transform 0.2s', color: '#d4af37' }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: '#0f0d06',
            border: '1px solid rgba(212,175,55,0.35)',
          }}
        >
          <div className="px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>בחר מטבע</p>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {supported.map((code) => {
              const m = meta[code]
              const isSelected = code === selectedCurrency
              // Show live rate vs USD
              const rateVsUsd = rates[code]
              const rateStr = rateVsUsd && code !== 'USD'
                ? `= ${m?.symbol}${rateVsUsd.toFixed(code === 'JPY' || code === 'NOK' || code === 'SEK' || code === 'DKK' ? 1 : 3)}`
                : ''

              return (
                <button
                  key={code}
                  onClick={() => { setSelectedCurrency(code); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-all"
                  style={{
                    background: isSelected ? 'rgba(212,175,55,0.1)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <span className="text-base">{m?.flag}</span>

                  <div className="flex-1 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-xs opacity-40">{m?.name}</span>
                      <span className="font-bold text-sm" style={{ color: isSelected ? '#d4af37' : '#e5e7eb' }}>
                        {code}
                      </span>
                    </div>
                    {rateStr && (
                      <p className="text-xs opacity-40 text-right">$1 {rateStr}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold" style={{ color: isSelected ? '#d4af37' : '#6b7280' }}>
                      {m?.symbol}
                    </span>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: '#d4af37' }}>
                        <Check size={10} color="#000" />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
