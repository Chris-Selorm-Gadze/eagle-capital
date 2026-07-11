export type RuleKey = 'rule1' | 'rule2' | 'rule3' | 'rule4' | 'rule5' | 'rule6' | 'rule7' | 'rule8' | 'rule9' | 'rule10'

export const REPORT_CARD_RULES: { key: RuleKey; text: string; core: boolean }[] = [
  { key: 'rule1', text: 'Every position had a stop loss set before entry.', core: true },
  { key: 'rule2', text: 'Fixed size. Every trade the same. No exceptions.', core: true },
  { key: 'rule3', text: 'I stopped after 3 consecutive losses.', core: true },
  { key: 'rule4', text: 'Every trade I entered, I left alone until SL or TP hit.', core: true },
  { key: 'rule5', text: 'I took 3 trades or fewer.', core: false },
  { key: 'rule6', text: 'I traded with the higher-timeframe direction.', core: false },
  { key: 'rule7', text: 'One position per idea. No stacking.', core: false },
  { key: 'rule8', text: 'Approved instrument only. No gold, Dow, forex, crypto.', core: false },
  { key: 'rule9', text: 'I did not re-enter an idea I had just lost on.', core: false },
  { key: 'rule10', text: 'No trades before 06:00 or after 20:00.', core: false },
]
