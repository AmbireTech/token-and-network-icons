/**
 * Downloads the token icons, so the apps can show them without any network request.
 *
 * Token selection: every token from the Uniswap Labs Default token list that is on one of the
 * app's predefined networks, the native coin of every network in the relayer's network config
 * (the `RELAYER_URL` environment variable, or the production relayer) and `CUSTOM_TOKENS`.
 * Image source: the same `cena.ambire.com/iconProxy` URL the app loads at runtime, so the icons
 * look identical to the ones users saw before they were bundled. The list's own `logoURI` (or the
 * relayer's native coin icon) is a fallback. Every network whose native coin is ETH gets the
 * Ethereum ETH icon. Network icons are generated separately, by generate-network-icons.js.
 *
 * Output (committed, re-run to refresh):
 * - assets/tokenIcons/<chainId>/<lowercaseAddress>.png (64x64)
 * - index/bundledTokenIconKeys.ts (which icons exist)
 *
 * The apps load the icons by path and never `require` them. On mobile they are part of the native
 * app (an Xcode folder reference and a Gradle assets dir both point to assets/), NOT the JS bundle,
 * otherwise every OTA update would ship them again; new icons reach mobile users with the next
 * native build. The web builds copy assets/ next to their pages, keeping the icons out of the JS.
 *
 * Usage: npm run generate:token-icons
 */
const fs = require('fs')
const path = require('path')
const {
  ASSETS_DIR,
  INDEX_DIR,
  fetchWithTimeout,
  downloadFirstWorkingIcon,
  getRelayerNetworks,
  runWithConcurrency
} = require('./downloadIcon')

const TOKEN_LIST_URL = 'https://tokens.uniswap.org'
const ICON_PROXY_URL = 'https://cena.ambire.com/iconProxy'
const IPFS_GATEWAY_URL = 'https://ipfs.io/ipfs/'
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000'

// The networks predefined in ambire-common's src/consts/networks.ts. Only their tokens from the
// token list are bundled, while every relayer network gets its native coin
const TOKEN_LIST_CHAIN_IDS = new Set([1, 10, 56, 137, 5000, 8453, 42161, 43114, 534352])

const ETH_ICON_URL = `${ICON_PROXY_URL}/ethereum/${NATIVE_TOKEN_ADDRESS}`
// The icon proxy has no Citrea icons, so the app falls back to this one (its getHardcodedCitreaIcons.ts)
const CITREA_BTC_ICON_URL = 'https://cena.ambire.com/public/networks/cBTC.png'

/**
 * Tokens that aren't in the token list or need a specific icon. `iconUrls` replace the default
 * icon proxy URL.
 */
const CUSTOM_TOKENS = [
  { chainId: 1, address: '0x88800092fF476844f74dC2FC427974BBee2794Ae', symbol: 'WALLET' },
  { chainId: 8453, address: '0x0bbbead62f7647ae8323d2cb243a0db74b7c2b80', symbol: 'WALLET' },
  { chainId: 1, address: '0xE575cC6EC0B5d176127ac61aD2D3d9d19d1aa4a0', symbol: 'stkWALLET' },
  {
    chainId: 4114,
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'cBTC',
    iconUrls: [CITREA_BTC_ICON_URL]
  },
  {
    chainId: 4114,
    address: '0x3100000000000000000000000000000000000006',
    symbol: 'WcBTC',
    iconUrls: [CITREA_BTC_ICON_URL]
  },
  // Ethereal's native coin is USDe, but the relayer config points its icon to Citrea's cBTC
  {
    chainId: 5064014,
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'USDe',
    iconUrls: [`${ICON_PROXY_URL}/ethereum/0x4c9EDD5852cd905f086C759E8383e09bff1E68B3`]
  }
]

const OUTPUT_DIR = path.join(ASSETS_DIR, 'tokenIcons')
const KEYS_INDEX_PATH = path.join(INDEX_DIR, 'bundledTokenIconKeys.ts')

const toFetchableUrl = (uri) => {
  if (!uri) return null
  if (uri.startsWith('ipfs://')) return IPFS_GATEWAY_URL + uri.slice('ipfs://'.length)
  if (uri.startsWith('https://')) return uri

  return null
}

const getIconPngBuffer = (token, platformIdByChainId) => {
  const platformId = platformIdByChainId.get(token.chainId)
  const iconProxyUrl = platformId ? `${ICON_PROXY_URL}/${platformId}/${token.address}` : null

  return downloadFirstWorkingIcon(
    [...(token.iconUrls ?? [iconProxyUrl]), toFetchableUrl(token.logoURI)].filter(Boolean)
  )
}

const getNativeToken = (network) => {
  const isEth = network.native?.symbol === 'ETH'
  const iconProxyUrl = network.platformId
    ? `${ICON_PROXY_URL}/${network.platformId}/${NATIVE_TOKEN_ADDRESS}`
    : null

  return {
    chainId: Number(network.chainId),
    address: NATIVE_TOKEN_ADDRESS,
    symbol: network.native?.symbol,
    iconUrls: [isEth ? ETH_ICON_URL : iconProxyUrl, network.native?.icon].filter(Boolean)
  }
}

const getTokensToBundle = async () => {
  const response = await fetchWithTimeout(TOKEN_LIST_URL)
  if (!response.ok) throw new Error(`Failed to fetch the token list: HTTP ${response.status}`)
  const tokenList = await response.json()
  const { networks, sourceDescription: networksSource } = await getRelayerNetworks()

  const nativeTokens = networks.map(getNativeToken)
  const listedTokens = tokenList.tokens.filter((token) => TOKEN_LIST_CHAIN_IDS.has(token.chainId))

  // Later entries win, so custom tokens override the native and listed ones
  const tokensByKey = new Map()
  ;[...nativeTokens, ...listedTokens, ...CUSTOM_TOKENS].forEach((token) => {
    tokensByKey.set(`${token.chainId}:${token.address.toLowerCase()}`, token)
  })

  const { major, minor, patch } = tokenList.version

  return {
    tokens: [...tokensByKey.values()],
    platformIdByChainId: new Map(
      networks.map((network) => [Number(network.chainId), network.platformId])
    ),
    sourceDescription: `${tokenList.name} token list v${major}.${minor}.${patch} and ${networksSource}`
  }
}

const writeIndexFiles = (entries, sourceDescription) => {
  const sortedEntries = [...entries].sort((a, b) => a.key.localeCompare(b.key))
  const header = `/* eslint-disable */
// AUTO-GENERATED by scripts/generate-token-icons.js - do not edit by hand.
// Source: ${sourceDescription}, icons via ${ICON_PROXY_URL}`

  const keysContent = `${header}

/**
 * Tokens whose icon ships with the apps, as \`\${chainId}:\${lowercaseAddress}\`, stored as
 * \`assets/tokenIcons/<chainId>/<lowercaseAddress>.png\`. The apps load the icons by path and never
 * \`require\` them: on mobile that would put them in every OTA update, and on web in the JS every
 * page loads.
 */
export const BUNDLED_TOKEN_ICON_KEYS: ReadonlySet<string> = new Set([
${sortedEntries.map(({ key }) => `  '${key}',`).join('\n')}
])
`

  fs.mkdirSync(INDEX_DIR, { recursive: true })
  fs.writeFileSync(KEYS_INDEX_PATH, keysContent)
}

const main = async () => {
  const { tokens, platformIdByChainId, sourceDescription } = await getTokensToBundle()
  console.log(`Bundling icons for ${tokens.length} tokens from ${sourceDescription}`)

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const indexEntries = []
  const failures = []

  await runWithConcurrency(tokens, async (token) => {
    const lowercaseAddress = token.address.toLowerCase()
    const relativePath = `${token.chainId}/${lowercaseAddress}.png`
    try {
      const pngBuffer = await getIconPngBuffer(token, platformIdByChainId)
      fs.mkdirSync(path.join(OUTPUT_DIR, String(token.chainId)), { recursive: true })
      fs.writeFileSync(path.join(OUTPUT_DIR, relativePath), pngBuffer)
      indexEntries.push({ key: `${token.chainId}:${lowercaseAddress}` })
    } catch (error) {
      failures.push(`${token.chainId} ${token.symbol} ${token.address} -> ${error.message}`)
    }
  })

  writeIndexFiles(indexEntries, sourceDescription)

  console.log(`Bundled ${indexEntries.length} icons, skipped ${failures.length}`)
  failures.forEach((failure) => console.warn(`  skipped: ${failure}`))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
