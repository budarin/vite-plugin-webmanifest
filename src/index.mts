import type { Plugin } from 'vite';

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { parse } from 'node-html-parser';

type Icon = {
    src: string;
    sizes: string;
    type: string;
};

async function emitIcons(
    icons: Icon[],
    base: string = '/',
    callback: (iconName: string, iconPath: string) => Promise<string>,
): Promise<void> {
    const root = process.cwd();
    if (icons && Array.isArray(icons)) {
        for (const icon of icons) {
            const iconPath = path.join(root, icon.src);
            if (await exists(iconPath)) {
                const iconExt = path.extname(iconPath);
                const iconName = path.basename(iconPath, iconExt);
                const fileName = await callback(`${iconName}${iconExt}`, iconPath);
                // Update the icon path in the manifest
                icon.src = `${base}${fileName}`;
            }
        }
    }
}

type Shortcut = {
    name: string;
    url: string;
    description: string;
    icons: [
        {
            src: string;
            sizes: string;
        },
    ];
};

async function emitShortcutIcons(
    shortcuts: Shortcut[],
    base: string = '/',
    callback: (iconName: string, iconPath: string) => Promise<string>,
): Promise<void> {
    const root = process.cwd();
    if (shortcuts && Array.isArray(shortcuts)) {
        for (const shortcut of shortcuts) {
            for (const icon of shortcut.icons) {
                const iconPath = path.join(root, icon.src);
                if (await exists(iconPath)) {
                    const iconExt = path.extname(iconPath);
                    const iconName = path.basename(iconPath, iconExt);
                    const fileName = await callback(`${iconName}${iconExt}`, iconPath);
                    // Update the icon path in the manifest
                    icon.src = `${base}${fileName}`;
                }
            }
        }
    }
}

const readFile = promisify(fs.readFile);
const exists = promisify(fs.exists);

export const webmanifestPlugin = (): Plugin => {
    let base: string = '/';

    return {
        name: 'vite:webmanifest',
        apply: 'build',
        enforce: 'post',

        configResolved(config) {
            base = config.base;
        },

        async generateBundle(_, bundle) {
            const root = process.cwd();
            const indexPath = path.join(root, 'index.html');
            let manifestPath;

            if (await exists(indexPath)) {
                const indexContent = await readFile(indexPath, 'utf-8');
                const rootHtml = parse(indexContent);
                const manifestLink = rootHtml.querySelector('link[rel="manifest"]');

                if (manifestLink) {
                    const href = manifestLink.getAttribute('href');
                    if (href) {
                        manifestPath = path.join(root, href);
                    }
                }
            }

            if (!manifestPath || !(await exists(manifestPath))) {
                this.error('WebManifest file not found');
            } else {
                const manifestContent = await readFile(manifestPath, 'utf-8');
                const manifestJson = JSON.parse(manifestContent);
                const icons = manifestJson.icons as Icon[];
                const screenshots = manifestJson.screenshots;
                const shortcuts = manifestJson.shortcuts;

                await emitIcons(icons, base, async (iconName, iconPath) => {
                    const fileId = this.emitFile({
                        type: 'asset',
                        name: iconName,
                        source: await readFile(iconPath, { encoding: 'utf-8' }),
                    });

                    // Get path to the icon asset
                    return this.getFileName(fileId);
                });

                await emitIcons(screenshots, base, async (iconName, iconPath) => {
                    const fileId = this.emitFile({
                        type: 'asset',
                        name: iconName,
                        source: await readFile(iconPath, { encoding: 'utf-8' }),
                    });

                    return this.getFileName(fileId);
                });

                await emitShortcutIcons(shortcuts, base, async (iconName, iconPath) => {
                    const fileId = this.emitFile({
                        type: 'asset',
                        name: iconName,
                        source: await readFile(iconPath, { encoding: 'utf-8' }),
                    });

                    return this.getFileName(fileId);
                });

                // Get file name of the manifest
                const manifestExt = path.extname(manifestPath);
                const manifestName = path.basename(manifestPath, manifestExt);

                // Emit the updated manifest
                const fileId = this.emitFile({
                    type: 'asset',
                    name: `${manifestName}${manifestExt}`,
                    source: JSON.stringify(manifestJson, null, 4),
                });

                const manifestfileName = this.getFileName(fileId);

                // Update the index.html in the bundle to reference the hashed manifest file
                for (const fileName in bundle) {
                    const htmlChunk = bundle[fileName];

                    if (
                        fileName.endsWith('.html') &&
                        htmlChunk.type === 'asset' &&
                        typeof htmlChunk.source === 'string'
                    ) {
                        const rootHtml = parse(htmlChunk.source);
                        const manifestLink = rootHtml.querySelector('link[rel="manifest"]');
                        if (manifestLink) {
                            manifestLink.setAttribute('href', `${base}${manifestfileName}`);
                            htmlChunk.source = rootHtml.toString();
                        }
                    }
                }

                // Remove the wrong manifest from the bundle
                for (const fileName in bundle) {
                    if (fileName.endsWith(manifestExt) && fileName !== manifestfileName) {
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                        delete bundle[fileName];
                    }
                }
            }
        },
    };
};
