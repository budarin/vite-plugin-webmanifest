# vite-plugin-webmanifest

By default, Vite does not analyze or modify webmanifest, so it does not emit the icons it references.

The plugin analyzes the webmanifest and emits icons from it, and also modifies the paths to these icons in the manifest itself.

## Install

```shell
# npm
npm i vite-plugin-webmanifest -D

# yarn
yarn add vite-plugin-webmanifest -D

# pnpm
pnpm add vite-plugin-webmanifest -D

```

## Usage

Add `webmanifest` plugin to vite.config.js / vite.config.ts and configure it:

```ts
import { VitePWA } from '@budarin/vite-plugin-webmanifest';

export default {
    plugins: [webmanifestPlugin()],
};
```

## License

[MIT](/LICENSE)
