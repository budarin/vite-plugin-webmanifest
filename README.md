# vite-plugin-webmanifest

By default, Vite does not analyze or modify webmanifest, so it does not emit the icons it references.

The plugin analyzes the webmanifest and emits icons from it, and also modifies the paths to these icons in the manifest itself.

## Install

```shell
# npm
npm i @budarin/vite-plugin-webmanifest -D

# yarn
yarn add @budarin/vite-plugin-webmanifest -D

# pnpm
pnpm add @budarin/vite-plugin-webmanifest -D

```

## Usage

Add `webmanifest` plugin to vite.config.mjs / vite.config.mts and configure it:

```ts
import { webmanifestPlugin } from '@budarin/vite-plugin-webmanifest';

export default {
    plugins: [webmanifestPlugin()],
};
```

## License

[MIT](/LICENSE)
