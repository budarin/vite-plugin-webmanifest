import type { Plugin } from 'vite';

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

// Constants
const HTML_EXTENSION = '.html';
const MANIFEST_LINK_SELECTOR = 'link[rel="manifest"]';

/**
 * Icon type for WebManifest
 */
export type Icon = {
    src: string;
    sizes: string;
    type: string;
};

/**
 * Shortcut type for WebManifest
 */
export type Shortcut = {
    name: string;
    url: string;
    description: string;
    icons: Array<{
        src: string;
        sizes: string;
    }>;
};

/**
 * WebManifest type
 */
export type WebManifest = {
    scope?: string;
    start_url?: string;
    icons?: Icon[];
    screenshots?: Icon[];
    shortcuts?: Shortcut[];
};

/**
 * Check if file exists
 */
function exists(filePath: string): boolean {
    return existsSync(filePath);
}

/**
 * File cache for avoiding duplicate reads
 */
const fileCache = new Map<string, Buffer>();

/**
 * Get file from cache or read from disk
 */
async function getCachedFile(filePath: string): Promise<Buffer> {
    if (!fileCache.has(filePath)) {
        fileCache.set(filePath, await readFile(filePath));
    }
    return fileCache.get(filePath)!;
}

/**
 * Process and emit icons in parallel for better performance
 */
async function emitIcons(
    icons: Icon[] | undefined,
    root: string,
    callback: (iconName: string, iconPath: string) => Promise<string>,
    pluginContext: any,
): Promise<void> {
    if (!icons || !Array.isArray(icons)) {
        return;
    }

    await Promise.all(
        icons.map(async (icon) => {
            // Handle absolute paths starting with /
            let iconPath: string;
            if (icon.src.startsWith('/')) {
                iconPath = path.join(root, icon.src.slice(1));
            } else {
                iconPath = path.resolve(root, icon.src);
            }

            if (exists(iconPath)) {
                const iconExt = path.extname(iconPath);
                const iconName = path.basename(iconPath, iconExt);
                const fileName = await callback(`${iconName}${iconExt}`, iconPath);

                // Update the icon path in the manifest
                icon.src = fileName;
            } else {
                pluginContext.error(`Icon file not found: ${iconPath}`, {
                    code: 'ICON_NOT_FOUND',
                });
            }
        }),
    );
}

/**
 * Process and emit shortcut icons in parallel for better performance
 */
async function emitShortcutIcons(
    shortcuts: Shortcut[] | undefined,
    root: string,
    callback: (iconName: string, iconPath: string) => Promise<string>,
    pluginContext: any,
): Promise<void> {
    if (!shortcuts || !Array.isArray(shortcuts)) {
        return;
    }

    await Promise.all(
        shortcuts.flatMap((shortcut) =>
            shortcut.icons.map(async (icon) => {
                // Handle absolute paths starting with /
                let iconPath: string;
                if (icon.src.startsWith('/')) {
                    iconPath = path.join(root, icon.src.slice(1));
                } else {
                    iconPath = path.resolve(root, icon.src);
                }

                if (exists(iconPath)) {
                    const iconExt = path.extname(iconPath);
                    const iconName = path.basename(iconPath, iconExt);
                    const fileName = await callback(`${iconName}${iconExt}`, iconPath);

                    // Update the icon path in the manifest
                    icon.src = fileName;
                } else {
                    pluginContext.error(`Shortcut icon file not found: ${iconPath}`, {
                        code: 'SHORTCUT_ICON_NOT_FOUND',
                    });
                }
            }),
        ),
    );
}

/**
 * Vite plugin for transforming webmanifest
 * Optimizes icons, screenshots and shortcuts by processing them in parallel
 * and updates manifest paths according to the build configuration
 */
export const webmanifestPlugin = (): Plugin => {
    let base: string = './';
    let root: string = process.cwd();

    return {
        name: 'vite:webmanifest',
        apply: 'build',
        enforce: 'post',

        configResolved(config) {
            base = config.base;
            root = config.root;
        },

        async generateBundle(_, bundle) {
            // Clear file cache at the start of each build
            fileCache.clear();

            // Capture plugin context for use in callbacks
            const pluginContext = this;

            let manifestPath: string | undefined;
            const indexPath = path.resolve(root, 'index.html');

            if (exists(indexPath)) {
                const indexContent = await readFile(indexPath, 'utf-8');
                const $ = cheerio.load(indexContent);
                const manifestLink = $(MANIFEST_LINK_SELECTOR);

                if (manifestLink.length > 0) {
                    const href = manifestLink.attr('href');

                    if (href) {
                        // Handle absolute paths starting with /
                        if (href.startsWith('/')) {
                            manifestPath = path.join(root, href.slice(1));
                        } else {
                            manifestPath = path.resolve(root, href);
                        }
                    }
                }
            }

            if (!manifestPath || !exists(manifestPath)) {
                this.error('WebManifest file not found. Make sure index.html contains <link rel="manifest" href="...">');
            }

            let manifestJson: WebManifest;

            try {
                const manifestContent = await readFile(manifestPath!, 'utf-8');
                manifestJson = JSON.parse(manifestContent) as WebManifest;
            } catch (error) {
                this.error(
                    `Failed to parse WebManifest file: ${error instanceof Error ? error.message : String(error)}`,
                );
            }

            // Update scope and start_url
            manifestJson.scope = base;
            manifestJson.start_url = base;

            // Callback for emitting files with caching
            const emitFileCallback = async (iconName: string, iconPath: string): Promise<string> => {
                const fileId = this.emitFile({
                    type: 'asset',
                    name: iconName,
                    source: await getCachedFile(iconPath),
                });

                const fileName = this.getFileName(fileId);

                // Remove 'assets/' prefix if present since manifest is already in assets folder
                const cleanFileName = fileName.startsWith('assets/') ? fileName.slice(7) : fileName;
                return `./${cleanFileName}`;
            };

            // Process all icons in parallel
            await Promise.all([
                emitIcons(manifestJson.icons, root, emitFileCallback, pluginContext),
                emitIcons(manifestJson.screenshots, root, emitFileCallback, pluginContext),
                emitShortcutIcons(manifestJson.shortcuts, root, emitFileCallback, pluginContext),
            ]);

            // Remove empty arrays to avoid PWA warnings
            if (manifestJson.screenshots && manifestJson.screenshots.length === 0) {
                delete manifestJson.screenshots;
            }
            if (manifestJson.shortcuts && manifestJson.shortcuts.length === 0) {
                delete manifestJson.shortcuts;
            }

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

            // Single pass through bundle: update HTML and remove old manifest
            for (const fileName in bundle) {
                const fileChunk = bundle[fileName];

                // Update HTML files to reference the hashed manifest file
                if (
                    fileName.endsWith(HTML_EXTENSION) &&
                    fileChunk.type === 'asset' &&
                    typeof fileChunk.source === 'string'
                ) {
                    const $ = cheerio.load(fileChunk.source);
                    const manifestLink = $(MANIFEST_LINK_SELECTOR);

                    if (manifestLink.length > 0) {
                        manifestLink.attr('href', `${base}${manifestfileName}`);
                        fileChunk.source = $.html();
                    }
                }

                // Remove the old manifest from the bundle
                if (fileName.endsWith(manifestExt) && fileName !== manifestfileName) {
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete bundle[fileName];
                }
            }

            // Clear cache after bundle is complete
            fileCache.clear();
        },
    };
};
