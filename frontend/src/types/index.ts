export interface WatchPhoto {
  id: number
  watch_id: number
  filename: string
  url: string
  is_primary: boolean
  uploaded_at: string
}

export interface WatchDocument {
  id: number
  watch_id: number
  filename: string
  original_name: string
  doc_type: string
  url: string
  uploaded_at: string
}

export type WatchStatus = 'available' | 'sold' | 'reserved'
export type WatchCondition = 'mint' | 'excellent' | 'good' | 'fair'

export interface Watch {
  id: number
  brand: string
  model: string
  reference?: string
  year?: number
  condition: WatchCondition
  purchase_price: number
  asking_price: number
  price_currency: string   // currency the prices were entered in (e.g. "USD", "ILS")
  sold_price?: number
  status: WatchStatus
  serial_number?: string
  has_box: boolean
  has_papers: boolean
  notes?: string
  purchase_date?: string
  sold_at?: string
  created_at: string
  primary_photo?: string
  photos?: WatchPhoto[]
  documents?: WatchDocument[]
  // Tax refund (purchased abroad — tourist VAT refund)
  tax_refund?: boolean
  tax_refund_amount?: number
  tax_refund_currency?: string
  tax_refund_country?: string
  // Import customs/duty paid in Israel
  import_tax?: number
  import_tax_currency?: string
  // Physical location of the watch
  location?: string
  location_details?: string
  // Historical exchange rate at time of purchase
  purchase_price_ils?: number       // purchase price converted to ILS on purchase_date
  purchase_rate_to_ils?: number     // 1 {price_currency} = X ILS on purchase_date
}

export interface Contact {
  id: number
  name: string
  email?: string
  phone?: string
  interests?: string
  notes?: string
  created_at: string
  last_contact_at?: string
}

export interface EmailLog {
  id: number
  subject: string
  body: string
  recipients_count: number
  sent_at: string
}

export interface FinancialEntry {
  id: number
  watch_id?: number
  entry_type: 'purchase' | 'sale' | 'expense'
  amount: number
  date: string
  description?: string
}

export interface MonthlyData {
  month: string
  month_short: string
  purchases: number
  sales: number
  expenses: number
  profit: number
}

export interface ProfitByWatch {
  brand: string
  model: string
  profit: number
  margin_pct: number
}

export interface FinancialSummary {
  total_invested: number
  total_sales: number
  total_expenses: number
  total_profit: number
  portfolio_value: number
  portfolio_cost: number
  unrealized_gain: number
  watches_count: number
  available_count: number
  sold_count: number
  monthly_data: MonthlyData[]
  profit_by_watch: ProfitByWatch[]
}

export interface PriceAlert {
  id: number
  brand: string
  model: string
  reference?: string
  target_price: number
  active: boolean
  created_at: string
}

export interface SavedListing {
  id: number
  brand?: string
  model?: string
  price?: number
  url: string
  source: string
  notes?: string
  saved_at: string
}

export interface SearchResult {
  title: string
  price?: number
  currency: string
  url: string
  source: string
  condition?: string
  year?: string
  location?: string
  image?: string
}

export interface AdGenerateRequest {
  brand: string
  model: string
  reference?: string
  year?: number
  condition: string
  asking_price: number
  has_box: boolean
  has_papers: boolean
  serial_number?: string
  notes?: string
  platform: string
}

export interface AdGenerateResponse {
  hebrew: string
  english: string
}

export interface NewsletterTemplate {
  id: string
  name: string
  subject: string
  body: string
}
