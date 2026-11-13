/**
 * Shared by the scripts that generate the icons (generate-token-icons.js and
 * generate-network-icons.js).
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ICON_SIZE_PX = 64
const CONCURRENCY = 8
const REQUEST_TIMEOUT_MS = 20000
const DEFAULT_RELAYER_URL = 'https://relayer.ambire.com'
const RELAYER_NETWORKS_ENDPOINT = '/v2/config/networks'
// The default density SVGs are drawn at (72 DPI = 1 SVG unit per pixel)
const SVG_DEFAULT_DENSITY = 72
// Keeps a huge SVG viewBox from being drawn at a size that takes too long or too much memory
const SVG_MAX_DENSITY = 2400
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/** Folder with the icons. The apps package everything in it, so keep only icons in it. */
const ASSETS_DIR = path.join(__dirname, '../assets')
/** Folder with the generated lists of which icons exist, imported by the apps. */
const INDEX_DIR = path.join(__dirname, '../index')

const fetchWithTimeout = async (url) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * SVGs are drawn at 1 pixel per SVG unit by default, so a small viewBox (like 24x24) would be
 * scaled up and come out blurry. Draws them big enough to fill the icon instead.
 */
const getSvgDensity = async (imageBuffer) => {
  const { width, height } = await sharp(imageBuffer).metadata()
  const largestSide = Math.max(width || 0, height || 0)
  if (!largestSide) return SVG_DEFAULT_DENSITY

  const densityToFillIcon = Math.ceil((SVG_DEFAULT_DENSITY * ICON_SIZE_PX) / largestSide)

  return Math.min(SVG_MAX_DENSITY, Math.max(SVG_DEFAULT_DENSITY, densityToFillIcon))
}

/**
 * Downloads an image and returns it as a square PNG buffer, `ICON_SIZE_PX` wide. The format is
 * read from the image itself, since some servers send WebP under a .jpg name.
 */
const downloadAndResizeIcon = async (url) => {
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const downloadedBuffer = Buffer.from(await response.arrayBuffer())
  const { format } = await sharp(downloadedBuffer).metadata()
  const density = format === 'svg' ? await getSvgDensity(downloadedBuffer) : undefined

  return sharp(downloadedBuffer, { density })
    .resize(ICON_SIZE_PX, ICON_SIZE_PX, { fit: 'contain', background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Tries each URL in order and returns the first icon that downloads and decodes. */
const downloadFirstWorkingIcon = async (candidateUrls) => {
  const errors = []
  // eslint-disable-next-line no-restricted-syntax
  for (const url of candidateUrls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await downloadAndResizeIcon(url)
    } catch (error) {
      errors.push(`${url}: ${error.message}`)
    }
  }

  throw new Error(errors.join(' | ') || 'no icon URL')
}

/**
 * Fetches the relayer's network config (the `RELAYER_URL` environment variable, or the
 * production relayer), the same list of networks the app loads at runtime, including each
 * network's `platformId`, `native` coin and `iconUrls`.
 */
const getRelayerNetworks = async () => {
  const relayerUrl = process.env.RELAYER_URL || DEFAULT_RELAYER_URL
  const url = `${relayerUrl}${RELAYER_NETWORKS_ENDPOINT}`
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`Failed to fetch the networks from ${url}: HTTP ${response.status}`)

  const body = await response.json()
  const networks = Object.values(body?.data?.extensionConfigNetworks || {})
  if (!networks.length) throw new Error(`The response from ${url} contains no networks`)

  return { networks, sourceDescription: url }
}

const runWithConcurrency = async (items, worker) => {
  let nextIndex = 0
  const runNext = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      // eslint-disable-next-line no-await-in-loop
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, runNext))
}

module.exports = {
  ASSETS_DIR,
  INDEX_DIR,
  fetchWithTimeout,
  downloadFirstWorkingIcon,
  getRelayerNetworks,
  runWithConcurrency
}
