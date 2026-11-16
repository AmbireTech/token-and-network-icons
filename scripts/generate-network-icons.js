/**
 * Downloads the network icons, so the apps can show them without any network request.
 *
 * Network selection: every network in the relayer's network config (the `RELAYER_URL`
 * environment variable, or the production relayer), the same list the app loads at runtime.
 * Each network's own `iconUrls` are tried in order, so the icons look identical to the ones users
 * saw before they were bundled.
 *
 * Output (committed, re-run to refresh):
 * - assets/networkIcons/<chainId>.webp (128x128)
 * - index/networkIconChainIds.json (which icons exist)
 *
 * Usage: npm run generate:network-icons
 */
const fs = require('fs')
const path = require('path')
const {
  ASSETS_DIR,
  downloadFirstWorkingIcon,
  getRelayerNetworks,
  writeJsonIndex,
  runWithConcurrency
} = require('./downloadIcon')

const OUTPUT_DIR = path.join(ASSETS_DIR, 'networkIcons')

/**
 * Testnets the relayer config has no icon for, mapped to the network whose icon they use instead.
 * Better fixed in the relayer config, which would also give the app's other screens an icon.
 */
const ICON_CHAIN_ID_BY_CHAIN_ID_WITHOUT_ICON = {
  // OP Sepolia uses the OP Mainnet icon
  11155420: 10
}

const getCandidateIconUrls = (network, networksByChainId) => {
  if (network.iconUrls?.length) return network.iconUrls

  const iconChainId = ICON_CHAIN_ID_BY_CHAIN_ID_WITHOUT_ICON[network.chainId]

  return networksByChainId.get(String(iconChainId))?.iconUrls || []
}

const main = async () => {
  const { networks, sourceDescription } = await getRelayerNetworks()
  console.log(`Bundling icons for ${networks.length} networks from ${sourceDescription}`)
  const networksByChainId = new Map(networks.map((network) => [String(network.chainId), network]))

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const bundledChainIds = []
  const failures = []

  await runWithConcurrency(networks, async (network) => {
    const chainId = String(network.chainId)
    try {
      const iconBuffer = await downloadFirstWorkingIcon(
        getCandidateIconUrls(network, networksByChainId)
      )
      fs.writeFileSync(path.join(OUTPUT_DIR, `${chainId}.webp`), iconBuffer)
      bundledChainIds.push(chainId)
    } catch (error) {
      failures.push(`${chainId} ${network.name} -> ${error.message}`)
    }
  })

  writeJsonIndex('networkIconChainIds.json', bundledChainIds, (a, b) => Number(a) - Number(b))

  console.log(`Bundled ${bundledChainIds.length} icons, skipped ${failures.length}`)
  failures.forEach((failure) => console.warn(`  skipped: ${failure}`))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
