# Token and network icons

Token and network icons that ship with the Ambire wallet apps, so the apps can show them without
a network request (faster, and it doesn't reveal which tokens a user holds). Used by
[ambire-app](https://github.com/AmbireTech/ambire-app) as a git submodule at
`src/token-and-network-icons`.

## What's inside

- `assets/tokenIcons/<chainId>/<lowercaseAddress>.png`: the native coin of every network in the
  relayer config, every token from the [Uniswap Labs Default token list](https://tokens.uniswap.org)
  on the app's predefined networks, and a few custom tokens (WALLET, stkWALLET, Citrea's WcBTC).
- `assets/networkIcons/<chainId>.png`: every network in the relayer config that has an icon.
- `index/`: `bundledTokenIconKeys.ts` and `bundledNetworkIconChainIds.ts`, generated lists of which
  icons exist, imported by the apps. The apps load the icons by path and never `require` them, so
  they don't end up in the JS.

All icons are 64x64 PNGs.

> Keep only icons in `assets/`. The apps ship everything in it: iOS through Xcode folder references
> to `assets/tokenIcons` and `assets/networkIcons`, Android through a Gradle assets folder pointing
> to `assets/`, and the web builds by copying it next to their pages.

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

To ship a refresh, commit it here, then update the submodule in ambire-app. On mobile the icons are
part of the native app, not the JS bundle, so they reach users with the next app store build, not
with an over-the-air update.

## License

The scripts are MIT licensed (see `LICENSE`). The logos belong to their respective owners and are
not covered by that license.
