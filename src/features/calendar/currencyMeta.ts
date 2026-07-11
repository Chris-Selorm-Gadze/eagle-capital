// Display metadata for the currency codes the ForexFactory feed reports under "country" — it's
// actually a currency code (USD/EUR/...), not a literal country name.
export const CURRENCY_META: Record<string, { label: string; flag: string }> = {
  USD: { label: 'United States', flag: '🇺🇸' },
  EUR: { label: 'Euro Area', flag: '🇪🇺' },
  GBP: { label: 'United Kingdom', flag: '🇬🇧' },
  JPY: { label: 'Japan', flag: '🇯🇵' },
  AUD: { label: 'Australia', flag: '🇦🇺' },
  NZD: { label: 'New Zealand', flag: '🇳🇿' },
  CAD: { label: 'Canada', flag: '🇨🇦' },
  CHF: { label: 'Switzerland', flag: '🇨🇭' },
  CNY: { label: 'China', flag: '🇨🇳' },
}

export function currencyLabel(code: string): string {
  return CURRENCY_META[code]?.label ?? code
}

export function currencyFlag(code: string): string {
  return CURRENCY_META[code]?.flag ?? '🏳️'
}
