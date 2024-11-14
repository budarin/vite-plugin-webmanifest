# vite-plugin-webmanifest

By default, Vite does not analyze or modify webmanifest, so it does not emit the icons it references.

The plugin analyzes the webmanifest and emits icons from it, and also modifies the paths to these icons in the manifest itself.

## Install

```shell
# npm
npm i -D @budarin/vite-plugin-webmanifest

# yarn
yarn add -D @budarin/vite-plugin-webmanifest

# pnpm
pnpm add -D @budarin/vite-plugin-webmanifest

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
