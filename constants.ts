
import { Category, Company } from './types';

// Helper for logos — Google's high-res favicon service (Clearbit is dead)
const getLogo = (domain: string) =>
  `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;

// Helper to check if a date is within the last 6 months
export const isJobRecent = (dateInput: string | any): boolean => {
  if (!dateInput) return false;
  
  // Handle case where input is already a Date object
  if (dateInput instanceof Date) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return dateInput >= sixMonthsAgo;
  }

  // Handle case where input might be a Firestore timestamp object that wasn't normalized
  if (typeof dateInput === 'object' && 'seconds' in dateInput) {
       const date = new Date(dateInput.seconds * 1000);
       const sixMonthsAgo = new Date();
       sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
       return date >= sixMonthsAgo;
  }

  // Handle String
  const date = new Date(dateInput);
  // Strictly check for invalid date objects
  if (isNaN(date.getTime())) return false; 
  
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return date >= sixMonthsAgo;
};

export const MOCK_COMPANIES: Company[] = [
  // --- ISSUERS (Crypto-First) ---
  {
    id: '1',
    name: 'Circle',
    logoPlaceholder: getLogo('circle.com'),
    description: 'Issuer of USDC, a leading regulated digital dollar stablecoin.',
    categories: [Category.ISSUER, Category.PAYMENTS, Category.INFRASTRUCTURE],
    website: 'https://www.circle.com',
    headquarters: 'Boston, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'BlackRock', type: 'Fortune500Global', description: 'Strategic partnership and custodian for USDC reserves.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'Visa', type: 'Fortune500Global', description: 'Enabling USDC payments on Visa network.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'Mastercard', type: 'Fortune500Global', description: 'Testing USDC settlements.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'Grab', type: 'Fortune500Global', description: 'Web3 wallet integration in Singapore.', country: 'Singapore', region: 'APAC', industry: 'Technology' },
      { name: 'Stripe', type: 'Fortune500Global', description: 'Pay with USDC integration.', country: 'USA', region: 'North America', industry: 'Technology' },
      { name: 'Sony', type: 'Fortune500Global', description: 'Powering bridged USDC on Soneium blockchain.', country: 'Japan', region: 'APAC', industry: 'Electronics' },
      { name: 'SBI Holdings', type: 'Fortune500Global', description: 'Strategic expansion of USDC in Japan.', country: 'Japan', region: 'APAC', industry: 'Financial Services' },
      { name: 'Shell', type: 'Fortune500Global', description: 'Exploration of USDC for global B2B payments.', country: 'United Kingdom', region: 'Europe', industry: 'Energy' },
      { name: 'Nestle', type: 'Fortune500Global', description: 'Blockchain pilot for supply chain transparency.', country: 'Switzerland', region: 'Europe', industry: 'Food & Beverage' },
      { name: 'TotalEnergies', type: 'Fortune500Global', description: 'Energy settlement and tracking pilots.', country: 'France', region: 'Europe', industry: 'Energy' }
    ],
    jobs: [
      { 
        id: 'j1', 
        title: 'VP of Partnerships', 
        department: 'Partnerships', 
        locations: ['New York, NY', 'Remote'], 
        postedDate: new Date().toISOString().split('T')[0], // Today
        url: 'https://www.circle.com/en/careers'
      }
    ]
  },
  {
    id: '2',
    name: 'Paxos',
    logoPlaceholder: getLogo('paxos.com'),
    description: 'Regulated blockchain infrastructure platform. Issuer of USDP, PYUSD.',
    categories: [Category.ISSUER, Category.INFRASTRUCTURE, Category.CUSTODY],
    website: 'https://www.paxos.com',
    headquarters: 'New York, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'PayPal', type: 'Fortune500Global', description: 'Issuer of PYUSD stablecoin.', country: 'USA', region: 'North America', industry: 'Technology' },
      { name: 'Interactive Brokers', type: 'Fortune500Global', description: 'Crypto trading infrastructure.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'Mercado Libre', type: 'Fortune500Global', description: 'Powering crypto capabilities in Brazil.', country: 'Argentina', region: 'LATAM', industry: 'E-Commerce' },
      { name: 'Societe Generale', type: 'Fortune500Global', description: 'Collaboration on digital asset issuance standards.', country: 'France', region: 'Europe', industry: 'Financial Services' },
      { name: 'Mercedes-Benz Group', type: 'Fortune500Global', description: 'Exploring stablecoin-based supply chain settlements.', country: 'Germany', region: 'Europe', industry: 'Automotive' }
    ],
    jobs: [
      { 
        id: 'j3', 
        title: 'Director, Business Development', 
        department: 'Business Dev', 
        locations: ['London, UK'], 
        postedDate: '2023-12-20', 
        url: 'https://paxos.com/careers'
      }
    ]
  },
  {
    id: '3',
    name: 'Tether',
    logoPlaceholder: getLogo('tether.to'),
    description: 'Issuer of USDT, the largest stablecoin by market cap.',
    categories: [Category.ISSUER],
    website: 'https://tether.to',
    headquarters: 'Hong Kong',
    region: 'APAC',
    focus: 'Crypto-First',
    partners: [
      { name: 'Bitfinex', type: 'CryptoNative', description: 'Deep strategic integration.' },
      { name: 'Lugano City', type: 'Fortune500Global', description: 'Plan B city adoption initiative (Government).', country: 'Switzerland', region: 'Europe', industry: 'Government' },
      { name: 'Trafigura Group', type: 'Fortune500Global', description: 'Crude oil trade settlement pilots using USDT.', country: 'Singapore', region: 'APAC', industry: 'Commodities Trading' }
    ]
  },

  // --- INFRASTRUCTURE & PAYMENTS (Mixed) ---
  {
    id: '4',
    name: 'Fireblocks',
    logoPlaceholder: getLogo('fireblocks.com'),
    description: 'Enterprise-grade platform delivering a secure infrastructure for moving, storing, and issuing digital assets.',
    categories: [Category.INFRASTRUCTURE, Category.CUSTODY],
    website: 'https://www.fireblocks.com',
    headquarters: 'New York, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'BNY Mellon', type: 'Fortune500Global', description: 'Digital asset custody platform.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'ANZ Group Holdings', type: 'Fortune500Global', description: 'Australian Dollar stablecoin pilot A$DC.', country: 'Australia', region: 'APAC', industry: 'Financial Services' },
      { name: 'National Australia Bank', type: 'Fortune500Global', description: 'First cross-border stablecoin transfer.', country: 'Australia', region: 'APAC', industry: 'Financial Services' },
      { name: 'Toyota Motor', type: 'Fortune500Global', description: 'Research into blockchain for automotive logistics.', country: 'Japan', region: 'APAC', industry: 'Automotive' },
      { name: 'Hyundai Motor', type: 'Fortune500Global', description: 'Digital asset ecosystem security in South Korea.', country: 'South Korea', region: 'APAC', industry: 'Automotive' },
      { name: 'Bosch Group', type: 'Fortune500Global', description: 'Industrial IoT and digital identity blockchain pilots.', country: 'Germany', region: 'Europe', industry: 'Industrial Technology' }
    ]
  },
  {
    id: '51',
    name: 'Taurus',
    logoPlaceholder: getLogo('taurushq.com'),
    description: 'Market-leading Swiss digital asset infrastructure provider for banks, covering custody, tokenization, and trading.',
    categories: [Category.CUSTODY, Category.INFRASTRUCTURE, Category.ISSUER],
    website: 'https://www.taurushq.com',
    headquarters: 'Geneva, Switzerland',
    region: 'Europe',
    focus: 'Crypto-First',
    partners: [
      { name: 'Deutsche Bank', type: 'Fortune500Global', description: 'Global crypto custody and tokenization partnership.', country: 'Germany', region: 'Europe', industry: 'Financial Services' },
      { name: 'Credit Suisse', type: 'Fortune500Global', description: 'Strategic investment and custody implementation.', country: 'Switzerland', region: 'Europe', industry: 'Financial Services' },
      { name: 'Santander', type: 'Fortune500Global', description: 'Digital asset custody and tokenization infrastructure.', country: 'Spain', region: 'Europe', industry: 'Financial Services' },
      { name: 'BMW Group', type: 'Fortune500Global', description: 'Asset tokenization and loyalty system exploration.', country: 'Germany', region: 'Europe', industry: 'Automotive' }
    ],
    jobs: [
        { 
          id: 'j-taurus-1', 
          title: 'Sales Director DACH', 
          department: 'Business Dev', 
          locations: ['Zurich, Switzerland', 'Frankfurt, Germany'], 
          postedDate: new Date().toISOString().split('T')[0], 
          url: 'https://www.taurushq.com/careers'
        }
    ]
  },
  {
    id: '6',
    name: 'Stripe',
    logoPlaceholder: getLogo('stripe.com'),
    description: 'Financial infrastructure platform, recently re-entered crypto with USDC payments and acquired Bridge.',
    categories: [Category.PAYMENTS, Category.INFRASTRUCTURE],
    website: 'https://stripe.com',
    headquarters: 'San Francisco, USA',
    region: 'North America',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Circle', type: 'CryptoNative', description: 'USDC integration.' },
      { name: 'Polygon', type: 'CryptoNative', description: 'Payment rails.' },
      { name: 'Volkswagen', type: 'Fortune500Global', description: 'Exploring crypto-enabled payments for connected vehicles.', country: 'Germany', region: 'Europe', industry: 'Automotive' }
    ]
  },
  {
    id: '7',
    name: 'BVNK',
    logoPlaceholder: getLogo('bvnk.com'),
    description: 'Global payments platform for businesses, bridging the gap between traditional finance and digital assets.',
    categories: [Category.PAYMENTS, Category.INFRASTRUCTURE],
    website: 'https://bvnk.com',
    headquarters: 'London, UK',
    region: 'Europe',
    focus: 'Crypto-First',
    partners: [
      { name: 'Circle', type: 'CryptoNative', description: 'Strategic stablecoin partnership.' },
      { name: 'Worldpay', type: 'Fortune500Global', description: 'Settlement via stablecoins.', country: 'USA', region: 'North America', industry: 'Financial Services' }
    ]
  },
  {
    id: '8',
    name: 'Bridge',
    logoPlaceholder: getLogo('bridge.xyz'),
    description: 'Stablecoin orchestration platform for developers. Acquired by Stripe.',
    categories: [Category.INFRASTRUCTURE, Category.PAYMENTS],
    website: 'https://bridge.xyz',
    headquarters: 'San Antonio, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'Stripe', type: 'Fortune500Global', description: 'Parent company.', country: 'USA', region: 'North America', industry: 'Technology' },
      { name: 'Coinbase', type: 'CryptoNative', description: 'Base L2 integration.' }
    ]
  },
  {
    id: '9',
    name: 'Transak',
    logoPlaceholder: getLogo('transak.com'),
    description: 'Web3 onboarding infrastructure connecting traditional finance with crypto assets via APIs.',
    categories: [Category.INFRASTRUCTURE, Category.PAYMENTS],
    website: 'https://transak.com',
    headquarters: 'Miami, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'Visa', type: 'Fortune500Global', description: 'Visa Direct capability for crypto withdrawals.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'MetaMask', type: 'CryptoNative', description: 'Primary on-ramp provider.' }
    ]
  },
  {
    id: '10',
    name: 'Due',
    logoPlaceholder: getLogo('due.com'),
    description: 'Next-generation payments platform leveraging stablecoins for seamless international settlements.',
    categories: [Category.PAYMENTS],
    website: 'https://due.com',
    headquarters: 'London, UK',
    region: 'Europe',
    focus: 'Crypto-First',
    partners: [
      { name: 'Arbitrum', type: 'CryptoNative', description: 'Built on Arbitrum for low-cost transactions.' }
    ]
  },
  {
    id: '11',
    name: 'MoonPay',
    logoPlaceholder: getLogo('moonpay.com'),
    description: 'Leading Web3 infrastructure company offering payment solutions for crypto on-ramps and off-ramps.',
    categories: [Category.INFRASTRUCTURE, Category.PAYMENTS],
    website: 'https://www.moonpay.com',
    headquarters: 'Miami, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'PayPal', type: 'Fortune500Global', description: 'Integration for US users to buy crypto.', country: 'USA', region: 'North America', industry: 'Technology' },
      { name: 'OpenSea', type: 'CryptoNative', description: 'Checkout integration for NFTs.' }
    ]
  },
  {
    id: '12',
    name: 'Zero Hash',
    logoPlaceholder: getLogo('zerohash.com'),
    description: 'B2B embedded infrastructure allowing platforms to integrate digital assets natively.',
    categories: [Category.INFRASTRUCTURE, Category.CUSTODY],
    website: 'https://zerohash.com',
    headquarters: 'Chicago, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'Stripe', type: 'Fortune500Global', description: 'Powering crypto infrastructure for Connect.', country: 'USA', region: 'North America', industry: 'Technology' },
      { name: 'Interactive Brokers', type: 'Fortune500Global', description: 'Crypto liquidity and custody.', country: 'USA', region: 'North America', industry: 'Financial Services' }
    ]
  },
  {
    id: '13',
    name: 'Ramp Network',
    logoPlaceholder: getLogo('ramp.network'),
    description: 'Fintech infrastructure converting between crypto and fiat.',
    categories: [Category.INFRASTRUCTURE, Category.PAYMENTS],
    website: 'https://ramp.network',
    headquarters: 'London, UK',
    region: 'Europe',
    focus: 'Crypto-First',
    partners: [
      { name: 'Trust Wallet', type: 'CryptoNative', description: 'In-app purchasing integration.' }
    ]
  },
  {
    id: '14',
    name: 'Coinbase',
    logoPlaceholder: getLogo('coinbase.com'),
    description: 'Leading US crypto exchange and wallet provider. Co-founder of Centre (USDC).',
    categories: [Category.INFRASTRUCTURE, Category.WALLET, Category.CUSTODY],
    website: 'https://www.coinbase.com',
    headquarters: 'Remote (US)',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'BlackRock', type: 'Fortune500Global', description: 'Aladdin integration and custody for ETFs.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'Google', type: 'Fortune500Global', description: 'Cloud payments via crypto.', country: 'USA', region: 'North America', industry: 'Technology' },
      { name: 'Standard Chartered', type: 'Fortune500Global', description: 'Banking and payment rails partnership.', country: 'United Kingdom', region: 'Europe', industry: 'Financial Services' },
      { name: 'Samsung Electronics', type: 'Fortune500Global', description: 'Wallet and keystore integration for mobile devices.', country: 'South Korea', region: 'APAC', industry: 'Electronics' },
      { name: 'Panasonic Holdings', type: 'Fortune500Global', description: 'Crypto payment options for digital services.', country: 'Japan', region: 'APAC', industry: 'Electronics' }
    ]
  },
  {
    id: '15',
    name: 'Ripple',
    logoPlaceholder: getLogo('ripple.com'),
    description: 'Real-time gross settlement system, currency exchange and remittance network. Issuer of RLUSD.',
    categories: [Category.INFRASTRUCTURE, Category.ISSUER, Category.PAYMENTS],
    website: 'https://ripple.com',
    headquarters: 'San Francisco, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'SBI Holdings', type: 'Fortune500Global', description: 'Joint venture (SBI Ripple Asia) for regional payments.', country: 'Japan', region: 'APAC', industry: 'Financial Services' },
      { name: 'Banco Santander', type: 'Fortune500Global', description: 'One Pay FX cross-border payment app.', country: 'Spain', region: 'Europe', industry: 'Financial Services' },
      { name: 'HSBC Holdings', type: 'Fortune500Global', description: 'Custody technology provider via Metaco acquisition.', country: 'United Kingdom', region: 'Europe', industry: 'Financial Services' },
      { name: 'Honda Motor', type: 'Fortune500Global', description: 'Remittance and supply chain settlement pilots.', country: 'Japan', region: 'APAC', industry: 'Automotive' }
    ]
  },
  {
    id: '36',
    name: 'Checkout.com',
    logoPlaceholder: getLogo('checkout.com'),
    description: 'Global payment solution provider helping businesses accept more payments.',
    categories: [Category.PAYMENTS, Category.INFRASTRUCTURE],
    website: 'https://www.checkout.com',
    headquarters: 'London, UK',
    region: 'Europe',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Binance', type: 'CryptoNative', description: 'Fiat on/off ramp partner.' },
      { name: 'Crypto.com', type: 'CryptoNative', description: 'Payment processing.' }
    ]
  },
  {
    id: '37',
    name: 'Worldpay',
    logoPlaceholder: getLogo('worldpay.com'),
    description: 'Payment processing company enabling merchants to accept stablecoin payments.',
    categories: [Category.PAYMENTS, Category.INFRASTRUCTURE],
    website: 'https://www.worldpay.com',
    headquarters: 'Cincinnati, USA',
    region: 'North America',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Circle', type: 'CryptoNative', description: 'USDC settlement pilot.' }
    ]
  },

  // --- BANKS (Crypto-Second) ---
  {
    id: '16',
    name: 'JPMorgan Chase',
    logoPlaceholder: getLogo('jpmorgan.com'),
    description: 'Leading global financial services firm. Created JPM Coin for repo market settlement.',
    categories: [Category.BANKS],
    website: 'https://www.jpmorgan.com',
    headquarters: 'New York, USA',
    region: 'North America',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Siemens', type: 'Fortune500Global', description: 'Used JPM Coin for automated, programmable payments.', country: 'Germany', region: 'Europe', industry: 'Industrial Technology' },
      { name: 'BMW Group', type: 'Fortune500Global', description: 'Blockchain-based supply chain and settlement pilot.', country: 'Germany', region: 'Europe', industry: 'Automotive' }
    ]
  },
  {
    id: '17',
    name: 'Citi',
    logoPlaceholder: getLogo('citi.com'),
    description: 'Global investment bank offering Citi Token Services for cash management and trade finance.',
    categories: [Category.BANKS],
    website: 'https://www.citigroup.com',
    headquarters: 'New York, USA',
    region: 'North America',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Maersk', type: 'Fortune500Global', description: 'Pilot for programmable trade finance using smart contracts.', country: 'Denmark', region: 'Europe', industry: 'Shipping & Logistics' }
    ]
  },
  {
    id: '18',
    name: 'Societe Generale-FORGE',
    logoPlaceholder: getLogo('societegenerale.com'),
    description: 'Subsidiary of Societe Generale Group dedicated to digital assets. Issuer of EURCV.',
    categories: [Category.BANKS, Category.ISSUER],
    website: 'https://www.sgforge.com',
    headquarters: 'Paris, France',
    region: 'Europe',
    focus: 'Crypto-Second', 
    partners: [
      { name: 'Bitpanda', type: 'CryptoNative', description: 'Listing of EURCV stablecoin.' },
      { name: 'AXA', type: 'Fortune500Global', description: 'Joint experiments on security token lifecycle and settlement.', country: 'France', region: 'Europe', industry: 'Insurance' }
    ]
  },
  {
    id: '19',
    name: 'Standard Chartered',
    logoPlaceholder: getLogo('sc.com'),
    description: 'British multinational bank. Backer of Zodia Custody and Zodia Markets.',
    categories: [Category.BANKS, Category.CUSTODY],
    website: 'https://www.sc.com',
    headquarters: 'London, UK',
    region: 'Europe',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Zodia Custody', type: 'CryptoNative', description: 'Institutional custody subsidiary.' }
    ]
  },
  {
    id: '20',
    name: 'HSBC',
    logoPlaceholder: getLogo('hsbc.com'),
    description: 'Launched HSBC Orion platform for tokenized assets and gold tokenization.',
    categories: [Category.BANKS],
    website: 'https://www.hsbc.com',
    headquarters: 'London, UK',
    region: 'Europe',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Metaco', type: 'CryptoNative', description: 'Custody technology provider (now Ripple).' }
    ]
  },
  {
    id: '21',
    name: 'Visa',
    logoPlaceholder: getLogo('visa.com'),
    description: 'Global payments technology company facilitating stablecoin settlements on Solana.',
    categories: [Category.BANKS, Category.PAYMENTS],
    website: 'https://www.visa.com',
    headquarters: 'San Francisco, USA',
    region: 'North America',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Solana', type: 'CryptoNative', description: 'High throughput settlement pilot.' },
      { name: 'Worldpay', type: 'Fortune500Global', description: 'Merchant stablecoin settlement.', country: 'USA', region: 'North America', industry: 'Financial Services' }
    ]
  },

  // --- DEFI & PROTOCOLS (Crypto-First) ---
  {
    id: '23',
    name: 'Sky',
    logoPlaceholder: getLogo('sky.money'),
    description: 'Formerly MakerDAO. Decentralized organization managing the generation of DAI/USDS.',
    categories: [Category.DEFI, Category.ISSUER],
    website: 'https://sky.money',
    headquarters: 'Decentralized',
    region: 'Global',
    focus: 'Crypto-First',
    partners: [
      { name: 'Coinbase', type: 'CryptoNative', description: 'Custody for RWA collateral.' },
      { name: 'Societe Generale', type: 'Fortune500Global', description: 'Onboarding SG-Forge security tokens as collateral for USDS.', country: 'France', region: 'Europe', industry: 'Financial Services' }
    ]
  },
  {
    id: '24',
    name: 'Aave',
    logoPlaceholder: getLogo('aave.com'),
    description: 'Open source and non-custodial liquidity protocol. Issuer of GHO stablecoin.',
    categories: [Category.DEFI, Category.ISSUER],
    website: 'https://aave.com',
    headquarters: 'London, UK',
    region: 'Europe',
    focus: 'Crypto-First',
    partners: []
  },
  {
    id: '25',
    name: 'Uniswap',
    logoPlaceholder: getLogo('uniswap.org'),
    description: 'Leading decentralized trading protocol ensuring liquidity for all major stablecoins.',
    categories: [Category.DEFI, Category.INFRASTRUCTURE],
    website: 'https://uniswap.org',
    headquarters: 'New York, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: []
  },
  {
    id: '31',
    name: 'Solana',
    logoPlaceholder: getLogo('solana.com'),
    description: 'High-performance blockchain supporting massive stablecoin volume.',
    categories: [Category.INFRASTRUCTURE],
    website: 'https://solana.com',
    headquarters: 'San Francisco, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'Visa', type: 'Fortune500Global', description: 'USDC settlement pilot.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'Shopify', type: 'Fortune500Global', description: 'Solana Pay integration.', country: 'Canada', region: 'North America', industry: 'E-Commerce' }
    ]
  },

  // --- CUSTODY (Crypto-First) ---
  {
    id: '5',
    name: 'Anchorage Digital',
    logoPlaceholder: getLogo('anchorage.com'),
    description: 'Regulated crypto platform that provides institutions with integrated financial services.',
    categories: [Category.CUSTODY, Category.INFRASTRUCTURE],
    website: 'https://www.anchorage.com',
    headquarters: 'San Francisco, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'Visa', type: 'Fortune500Global', description: 'Crypto settlement capabilities.', country: 'USA', region: 'North America', industry: 'Financial Services' },
      { name: 'Allianz', type: 'Fortune500Global', description: 'Institutional custody and insurance framework.', country: 'Germany', region: 'Europe', industry: 'Insurance' }
    ]
  },
  {
    id: '26',
    name: 'BitGo',
    logoPlaceholder: getLogo('bitgo.com'),
    description: 'Market leader in institutional-grade cryptocurrency security and custody.',
    categories: [Category.CUSTODY, Category.INFRASTRUCTURE],
    website: 'https://www.bitgo.com',
    headquarters: 'Palo Alto, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: [
      { name: 'Nike', type: 'Fortune500Global', description: 'Custody for RTFKT/NFT assets.', country: 'USA', region: 'North America', industry: 'Consumer Goods' }
    ]
  },
  {
    id: '27',
    name: 'Copper',
    logoPlaceholder: getLogo('copper.co'),
    description: 'Award-winning custody and settlement infrastructure for digital assets.',
    categories: [Category.CUSTODY],
    website: 'https://copper.co',
    headquarters: 'London, UK',
    region: 'Europe',
    focus: 'Crypto-First',
    partners: [
      { name: 'State Street', type: 'Fortune500Global', description: 'Digital asset custody licensing.', country: 'USA', region: 'North America', industry: 'Financial Services' }
    ]
  },

  // --- WALLETS & EXCHANGES (Mixed) ---
  {
    id: '40',
    name: 'MetaMask',
    logoPlaceholder: getLogo('metamask.io'),
    description: 'The world’s leading self-custody web3 wallet.',
    categories: [Category.WALLET],
    website: 'https://metamask.io',
    headquarters: 'Remote',
    region: 'Global',
    focus: 'Crypto-First',
    partners: [
      { name: 'Mastercard', type: 'Fortune500Global', description: 'Testing card-to-wallet transactions.', country: 'USA', region: 'North America', industry: 'Financial Services' }
    ]
  },
  {
    id: '49',
    name: 'Binance',
    logoPlaceholder: getLogo('binance.com'),
    description: 'World largest crypto exchange by trading volume.',
    categories: [Category.INFRASTRUCTURE, Category.WALLET],
    website: 'https://www.binance.com',
    headquarters: 'Remote',
    region: 'Global',
    focus: 'Crypto-First',
    partners: []
  },
  {
    id: '50',
    name: 'Kraken',
    logoPlaceholder: getLogo('kraken.com'),
    description: 'One of the oldest and most secure Bitcoin exchanges.',
    categories: [Category.INFRASTRUCTURE, Category.CUSTODY],
    website: 'https://www.kraken.com',
    headquarters: 'San Francisco, USA',
    region: 'North America',
    focus: 'Crypto-First',
    partners: []
  },
  {
    id: '30',
    name: 'PayPal',
    logoPlaceholder: getLogo('paypal.com'),
    description: 'Global payment giant enabling crypto buying/selling and issuing PYUSD.',
    categories: [Category.PAYMENTS, Category.ISSUER, Category.WALLET],
    website: 'https://www.paypal.com',
    headquarters: 'San Jose, USA',
    region: 'North America',
    focus: 'Crypto-Second',
    partners: [
      { name: 'Paxos', type: 'CryptoNative', description: 'Issuer of PYUSD.' }
    ]
  }
];

export const MOCK_NEWS: any[] = [
  {
    id: 'n3',
    title: 'Stripe acquires Bridge for $1.1B',
    source: 'TechCrunch',
    date: '2024-10-21',
    summary: 'Stripe has completed its largest acquisition to date, purchasing stablecoin infrastructure startup Bridge to accelerate global crypto payments.',
    relatedCompanies: ['Stripe', 'Bridge'],
    url: '#'
  },
  {
    id: 'n4',
    title: 'Visa Expands Stablecoin Settlement to Solana',
    source: 'CoinDesk',
    date: '2023-09-05',
    summary: 'Visa has expanded its stablecoin settlement capabilities to the high-performance Solana blockchain, working with Worldpay and Nuvei.',
    relatedCompanies: ['Visa', 'Solana', 'Worldpay'],
    url: '#'
  },
  {
    id: 'n5',
    title: 'Societe Generale launches stablecoin on Bitstamp',
    source: 'Reuters',
    date: '2023-12-06',
    summary: 'Societe Generale’s crypto division has launched its own euro-pegged stablecoin, EUR CoinVertible, on Bitstamp exchange.',
    relatedCompanies: ['Societe Generale', 'Bitstamp'],
    url: '#'
  },
  {
    id: 'n1',
    title: 'PayPal expands PYUSD to Venmo',
    source: 'TechCrunch',
    date: '2023-11-01',
    summary: 'PayPal has announced that its stablecoin PYUSD is now available for transfers between PayPal and Venmo wallets.',
    relatedCompanies: ['Paxos', 'PayPal'],
    url: '#'
  }
];
