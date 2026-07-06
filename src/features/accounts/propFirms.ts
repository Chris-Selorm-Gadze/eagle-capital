export interface PropFirmInfo {
  id: string              // e.g. 'ftmo', 'apex', 'fundednext', 'other'
  name: string            // Display name
  logo?: string           // Icon or character placeholder
  assetClasses: ('futures' | 'forex' | 'cfd' | 'crypto')[]
  website: string
  category: 'futures' | 'forex' | 'multi'
}

export const PROP_FIRMS: PropFirmInfo[] = [
  {
    id: 'fundednext',
    name: 'FundedNext',
    assetClasses: ['forex', 'cfd', 'crypto'],
    website: 'https://fundednext.com',
    category: 'forex'
  },
  {
    id: 'apex',
    name: 'Apex Trader Funding',
    assetClasses: ['futures'],
    website: 'https://apextraderfunding.com',
    category: 'futures'
  },
  {
    id: 'ftmo',
    name: 'FTMO',
    assetClasses: ['forex', 'cfd', 'crypto'],
    website: 'https://ftmo.com',
    category: 'forex'
  },
  {
    id: 'topstep',
    name: 'Topstep',
    assetClasses: ['futures'],
    website: 'https://topstep.com',
    category: 'futures'
  },
  {
    id: 'the5ers',
    name: 'The5ers',
    assetClasses: ['forex', 'cfd'],
    website: 'https://the5ers.com',
    category: 'forex'
  },
  {
    id: 'myfundedfx',
    name: 'MyFundedFX',
    assetClasses: ['forex', 'cfd', 'crypto'],
    website: 'https://myfundedfx.com',
    category: 'forex'
  },
  {
    id: 'fundingpips',
    name: 'Funding Pips',
    assetClasses: ['forex', 'cfd', 'crypto'],
    website: 'https://fundingpips.com',
    category: 'forex'
  },
  {
    id: 'e8funding',
    name: 'E8 Funding',
    assetClasses: ['forex', 'cfd'],
    website: 'https://e8funding.com',
    category: 'forex'
  },
  {
    id: 'fundedtradingplus',
    name: 'Funded Trading Plus',
    assetClasses: ['forex', 'cfd', 'crypto'],
    website: 'https://fundedtradingplus.com',
    category: 'forex'
  },
  {
    id: 'alphacapitalgroup',
    name: 'Alpha Capital Group',
    assetClasses: ['forex', 'cfd'],
    website: 'https://alphacapitalgroup.uk',
    category: 'forex'
  },
  {
    id: 'elitetraderfunding',
    name: 'Elite Trader Funding',
    assetClasses: ['futures'],
    website: 'https://elitetraderfunding.com',
    category: 'futures'
  },
  {
    id: 'citytradersimperium',
    name: 'City Traders Imperium',
    assetClasses: ['forex', 'cfd'],
    website: 'https://citytradersimperium.com',
    category: 'forex'
  },
  {
    id: 'other',
    name: 'Other / Custom',
    assetClasses: ['forex', 'cfd', 'futures', 'crypto'],
    website: '',
    category: 'multi'
  }
]
