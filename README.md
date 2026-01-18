# vite-plugin-webmanifest

A Vite plugin that processes Web App Manifest files, automatically emitting all referenced assets (icons, screenshots, shortcut icons) with content hashes and updating paths in the manifest.

## Features

- 🚀 High-performance parallel processing of manifest assets
- 📦 Automatic hashing of icons, screenshots, and shortcut icons
- 🔄 Updates manifest paths and adjusts `scope`/`start_url` based on Vite's `base`
- 📍 Always emits manifest to the root of the build output
- 🔌 Zero configuration required

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

Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { webmanifestPlugin } from '@budarin/vite-plugin-webmanifest';

export default defineConfig({
    plugins: [webmanifestPlugin()],
});
```

Link your manifest in `index.html`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
```

## Configuration

The plugin works out of the box with zero configuration required. The manifest file is always emitted to the root of the build output directory.

### Automatic Behavior

The plugin automatically:

- Discovers the manifest file from your `index.html`
- Processes all referenced assets in parallel
- Updates paths with content hashes for optimal caching
- Always places the manifest file in the root of the build output
- Adjusts `scope` and `start_url` based on Vite's `base` config

## License

[MIT](/LICENSE)
