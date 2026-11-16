# Token and network icons

Token and network icons that ship with the Ambire wallet apps, so the apps can show them without
a network request (faster, and it doesn't reveal which tokens a user holds). Published to npm as
[`@ambire/token-and-network-icons`](https://www.npmjs.com/package/@ambire/token-and-network-icons)
and used by [ambire-app](https://github.com/AmbireTech/ambire-app).

## What's in the package

The package holds only data, no code:

- `assets/tokenIcons/<chainId>/<lowercaseAddress>.webp`: the native coin of every network in the
  relayer config, every token from the [Uniswap Labs Default token list](https://tokens.uniswap.org)
  on the app's predefined networks, and a few custom tokens (WALLET, stkWALLET, Citrea's WcBTC).
- `assets/networkIcons/<chainId>.webp`: every network in the relayer config.
- `index/tokenIconKeys.json`: which token icons exist, as `"<chainId>:<lowercaseAddress>"`.
- `index/networkIconChainIds.json`: which network icons exist, as chain id strings.

All icons are 128x128 lossy WebP, sharp at the largest size the apps draw them (40pt) on 3x
screens. The apps load them by path and never `require` them, so they stay out of the JS: iOS
through Xcode folder references to the two icon folders, Android through a Gradle assets folder,
and the web builds by copying the two folders next to their pages. The scripts that generate them
(and `sharp`) aren't published.

## Refreshing the icons

Requires Node 22 or newer. Works on macOS and Linux.

```bash
npm ci
npm run generate
```

`generate:token-icons` and `generate:network-icons` can also be run on their own. Both read the
networks from the production relayer; set `RELAYER_URL` to use another one. The scripts list any
icon they couldn't download. The output is the same on every run as long as the sources don't
change, so the diff only shows icons that really changed.

**When the relayer adds a network, refresh the icons too.** The apps never load network icons
from the internet, so until the next release (the next app store build on mobile) the new network
shows its first letter instead of its icon. A network the relayer config gives no icon (no
`iconUrls`) can be mapped to another network's icon in `generate-network-icons.js`, but adding the
icon to the relayer config is the better fix.

## Publishing

1. Bump `version` in `package.json` and commit the refresh.
2. Check what will be published: `npm pack --dry-run` should list only the two icon folders, the
   two JSON files, `README.md`, `LICENSE` and `package.json`.
3. `npm publish`
4. In ambire-app, update the exact version of `@ambire/token-and-network-icons` in `package.json`.

On mobile the icons are part of the native app, not the JS bundle, so a new version reaches users
with the next app store build, not with an over-the-air update.

## License

The scripts are MIT licensed (see `LICENSE`). The logos belong to their respective owners and are
not covered by that license.
