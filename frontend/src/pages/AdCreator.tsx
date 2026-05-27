import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, Copy, RefreshCw, ChevronDown, Wand2, Watch } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'
import { Watch as WatchType, AdGenerateResponse } from '../types'

const platforms = [
  { id: 'general', label: 'כללי', emoji: '📄' },
  { id: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { id: 'facebook', label: 'Facebook', emoji: '👥' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'yad2', label: 'יד2', emoji: '🇮🇱' },
]

export default function AdCreator() {
  const [searchParams] = useSearchParams()
  const preselectedWatchId = searchParams.get('watch')

  const [watches, setWatches] = useState<WatchType[]>([])
  const [selectedWatch, setSelectedWatch] = useState<WatchType | null>(null)
  const [platform, setPlatform] = useState('general')
  const [language, setLanguage] = useState<'hebrew' | 'english'>('hebrew')
  const [generating, setGenerating] = useState(false)
  const [ad, setAd] = useState<AdGenerateResponse | null>(null)
  const [editedHebrew, setEditedHebrew] = useState('')
  const [editedEnglish, setEditedEnglish] = useState('')
  const [showWatchPicker, setShowWatchPicker] = useState(false)

  useEffect(() => {
    api.get('/api/inventory').then(res => {
      const availableWatches = res.data.filter((w: WatchType) => w.status !== 'sold')
      setWatches(availableWatches)
      if (preselectedWatchId) {
        const found = res.data.find((w: WatchType) => w.id === parseInt(preselectedWatchId))
        if (found) setSelectedWatch(found)
      }
    }).catch(() => {})
  }, [preselectedWatchId])

  useEffect(() => {
    if (ad) {
      setEditedHebrew(ad.hebrew)
      setEditedEnglish(ad.english)
    }
  }, [ad])

  const generateAd = async () => {
    if (!selectedWatch) {
      toast.error('בחר שעון תחילה')
      return
    }
    setGenerating(true)
    try {
      const res = await api.post('/api/ads/generate', {
        brand: selectedWatch.brand,
        model: selectedWatch.model,
        reference: selectedWatch.reference,
        year: selectedWatch.year,
        condition: selectedWatch.condition,
        asking_price: selectedWatch.asking_price,
        has_box: selectedWatch.has_box,
        has_papers: selectedWatch.has_papers,
        serial_number: selectedWatch.serial_number,
        notes: selectedWatch.notes,
        platform,
      })
      setAd(res.data)
      toast.success('מודעה נוצרה בהצלחה')
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'שגיאה ביצירת מודעה'
      if (msg.includes('ANTHROPIC_API_KEY')) {
        toast.error('מפתח API של Anthropic לא מוגדר')
      } else {
        toast.error(msg)
      }
    } finally {
      setGenerating(false)
    }
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('הועתק ללוח')
  }

  const currentAdText = language === 'hebrew' ? editedHebrew : editedEnglish

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">יצירת מודעות</h1>
        <p className="text-gray-400 text-sm mt-1">AI ליצירת מודעות בעברית ואנגלית</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left - Settings */}
        <div className="space-y-4">
          {/* Watch selector */}
          <div
            className="rounded-xl p-5"
            style={{ background: '#111827', border: '1px solid #1f2937' }}
          >
            <h2 className="text-sm font-semibold text-gray-400 mb-3">בחר שעון</h2>
            <div className="relative">
              <button
                onClick={() => setShowWatchPicker(!showWatchPicker)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm"
                style={{ background: '#1f2937', border: '1px solid #374151', color: selectedWatch ? 'white' : '#6b7280' }}
              >
                <div className="flex items-center gap-3">
                  <Watch size={16} color="#6b7280" />
                  {selectedWatch ? (
                    <span className="font-medium">{selectedWatch.brand} {selectedWatch.model} — ${selectedWatch.asking_price?.toLocaleString()}</span>
                  ) : (
                    <span>בחר שעון מהמלאי...</span>
                  )}
                </div>
                <ChevronDown size={16} color="#6b7280" />
              </button>

              {showWatchPicker && (
                <div
                  className="absolute top-full mt-1 w-full rounded-xl overflow-hidden z-10 shadow-xl max-h-60 overflow-y-auto"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                >
                  {watches.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">אין שעונים זמינים</div>
                  ) : (
                    watches.map(w => (
                      <button
                        key={w.id}
                        onClick={() => { setSelectedWatch(w); setShowWatchPicker(false); setAd(null) }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-gray-700 transition-colors"
                      >
                        {w.primary_photo ? (
                          <img src={`http://localhost:8000${w.primary_photo}`} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: '#374151' }}>
                            <Watch size={16} color="#6b7280" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{w.brand} {w.model}</div>
                          <div className="text-xs text-gray-500">${w.asking_price?.toLocaleString()}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Watch details preview */}
          {selectedWatch && (
            <div
              className="rounded-xl p-4"
              style={{ background: '#0d1117', border: '1px solid #1f2937' }}
            >
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['מותג', selectedWatch.brand],
                  ['דגם', selectedWatch.model],
                  ['רפרנס', selectedWatch.reference],
                  ['שנה', selectedWatch.year?.toString()],
                  ['מצב', selectedWatch.condition],
                  ['מחיר', `$${selectedWatch.asking_price?.toLocaleString()}`],
                  ['קופסה', selectedWatch.has_box ? '✓' : '✗'],
                  ['ניירות', selectedWatch.has_papers ? '✓' : '✗'],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-gray-500">{k}:</span>
                    <span className="text-gray-300 text-left">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Platform */}
          <div
            className="rounded-xl p-5"
            style={{ background: '#111827', border: '1px solid #1f2937' }}
          >
            <h2 className="text-sm font-semibold text-gray-400 mb-3">פלטפורמה</h2>
            <div className="grid grid-cols-3 gap-2">
              {platforms.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPlatform(p.id); setAd(null) }}
                  className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl text-sm font-medium transition-all"
                  style={
                    platform === p.id
                      ? { background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid #d4af37' }
                      : { background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }
                  }
                >
                  <span className="text-lg">{p.emoji}</span>
                  <span className="text-xs">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generateAd}
            disabled={generating || !selectedWatch}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold transition-opacity disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
          >
            {generating ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                יוצר מודעה...
              </>
            ) : (
              <>
                <Wand2 size={18} />
                צור מודעה עם AI
              </>
            )}
          </button>

          {!selectedWatch && (
            <p className="text-center text-xs text-gray-600">בחר שעון מהמלאי כדי להתחיל</p>
          )}
        </div>

        {/* Right - Ad output */}
        <div className="space-y-4">
          {ad ? (
            <>
              {/* Language tabs */}
              <div
                className="rounded-xl p-5"
                style={{ background: '#111827', border: '1px solid #1f2937' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setLanguage('hebrew')}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={
                        language === 'hebrew'
                          ? { background: 'rgba(212,175,55,0.2)', color: '#d4af37', border: '1px solid #d4af37' }
                          : { background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }
                      }
                    >
                      🇮🇱 עברית
                    </button>
                    <button
                      onClick={() => setLanguage('english')}
                      className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={
                        language === 'english'
                          ? { background: 'rgba(212,175,55,0.2)', color: '#d4af37', border: '1px solid #d4af37' }
                          : { background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }
                      }
                    >
                      🇺🇸 English
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyText(currentAdText)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: 'rgba(212,175,55,0.1)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.2)' }}
                    >
                      <Copy size={14} />
                      העתק
                    </button>
                    <button
                      onClick={generateAd}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }}
                    >
                      <RefreshCw size={14} />
                      יצור מחדש
                    </button>
                  </div>
                </div>

                <textarea
                  value={currentAdText}
                  onChange={e => {
                    if (language === 'hebrew') setEditedHebrew(e.target.value)
                    else setEditedEnglish(e.target.value)
                  }}
                  rows={18}
                  dir={language === 'hebrew' ? 'rtl' : 'ltr'}
                  className="w-full px-4 py-3 rounded-xl text-sm text-gray-200 leading-relaxed outline-none resize-none"
                  style={{ background: '#0d1117', border: '1px solid #1f2937' }}
                />

                <div className="flex justify-between items-center mt-3">
                  <span className="text-xs text-gray-600">{currentAdText.length} תווים</span>
                  <button
                    onClick={() => copyText(currentAdText)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
                  >
                    <Copy size={14} />
                    העתק מודעה
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div
              className="rounded-xl flex flex-col items-center justify-center text-center"
              style={{ background: '#111827', border: '1px solid #1f2937', minHeight: '400px' }}
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                style={{ background: 'rgba(212,175,55,0.08)' }}
              >
                <Wand2 size={36} color="#d4af37" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">מוכן ליצירת מודעה</h3>
              <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
                בחר שעון מהמלאי, בחר פלטפורמה ולחץ "צור מודעה" כדי לקבל טקסט שיווקי מקצועי בעברית ואנגלית
              </p>
              {!selectedWatch && watches.length > 0 && (
                <button
                  onClick={() => { setSelectedWatch(watches[0]); }}
                  className="mt-4 px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(212,175,55,0.1)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.2)' }}
                >
                  בחר שעון ראשון
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
