// Funded-capital projection scenarios, copied verbatim from the "Projection" tab of
// FundedNext_600K_Scaling_Plan.xlsx (Total ($) columns). Not a firm rule — Chris's own
// plan — so re-copy from the spreadsheet if the plan changes rather than editing here.

export interface ScenarioPoint {
  month: string
  conservative: number
  base: number
  aggressive: number
}

export const SCENARIOS: ScenarioPoint[] = [
  { month: 'Jul 2026', conservative: 20_000, base: 20_000, aggressive: 20_000 },
  { month: 'Aug 2026', conservative: 20_000, base: 45_000, aggressive: 95_000 },
  { month: 'Sep 2026', conservative: 45_000, base: 98_750, aggressive: 203_400 },
  { month: 'Oct 2026', conservative: 48_750, base: 203_450, aggressive: 335_600 },
  { month: 'Nov 2026', conservative: 103_450, base: 320_550, aggressive: 462_600 },
  { month: 'Dec 2026', conservative: 109_350, base: 348_150, aggressive: 694_600 },
  { month: 'Jan 2027', conservative: 166_650, base: 393_150, aggressive: 869_600 },
  { month: 'Feb 2027', conservative: 175_750, base: 453_150, aggressive: 1_089_600 },
  { month: 'Mar 2027', conservative: 287_150, base: 533_150, aggressive: 1_359_600 },
  { month: 'Apr 2027', conservative: 307_150, base: 633_150, aggressive: 1_359_600 },
  { month: 'May 2027', conservative: 332_150, base: 753_150, aggressive: 1_359_600 },
  { month: 'Jun 2027', conservative: 362_150, base: 893_150, aggressive: 1_359_600 },
]
