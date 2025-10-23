import type { Plugin } from 'vite';

import { readFile, access, constants } from 'fs/promises';
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
 * Modern replacement for deprecated fs.exists
 */
async function exists(filePath: string): Promise<boolean> {
    try {
        await access(filePath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
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
    base: string = '/',
    root: string,
    callback: (iconName: string, iconPath: string) => Promise<string>,
): Promise<void> {
    if (!icons || !Array.isArray(icons)) {
        return;
    }

    await Promise.all(
        icons.map(async (icon) => {
            const iconPath = path.join(root, icon.src);

            if (await exists(iconPath)) {
                const iconExt = path.extname(iconPath);
                const iconName = path.basename(iconPath, iconExt);
                const fileName = await callback(`${iconName}${iconExt}`, iconPath);

                // Update the icon path in the manifest
                icon.src = `${base}${fileName}`;
            }
        }),
    );
}

/**
 * Process and emit shortcut icons in parallel for better performance
 */
async function emitShortcutIcons(
    shortcuts: Shortcut[] | undefined,
    base: string = '/',
    root: string,
    callback: (iconName: string, iconPath: string) => Promise<string>,
): Promise<void> {
    if (!shortcuts || !Array.isArray(shortcuts)) {
        return;
    }

    await Promise.all(
        shortcuts.flatMap((shortcut) =>
            shortcut.icons.map(async (icon) => {
                const iconPath = path.join(root, icon.src);

                if (await exists(iconPath)) {
                    const iconExt = path.extname(iconPath);
                    const iconName = path.basename(iconPath, iconExt);
                    const fileName = await callback(`${iconName}${iconExt}`, iconPath);

                    // Update the icon path in the manifest
                    icon.src = `${base}${fileName}`;
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
    let base: string = '/';
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

            let manifestPath: string | undefined;
            const indexPath = path.join(root, 'index.html');

            if (await exists(indexPath)) {
                const indexContent = await readFile(indexPath, 'utf-8');
                const $ = cheerio.load(indexContent);
                const manifestLink = $(MANIFEST_LINK_SELECTOR);

                if (manifestLink.length > 0) {
                    const href = manifestLink.attr('href');

                    if (href) {
                        manifestPath = path.join(root, href);
                    }
                }
            }

            if (!manifestPath || !(await exists(manifestPath))) {
                this.error('WebManifest file not found');
            }

            let manifestJson: WebManifest;

            try {
                const manifestContent = await readFile(manifestPath, 'utf-8');
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

                return this.getFileName(fileId);
            };

            // Process all icons in parallel
            await Promise.all([
                emitIcons(manifestJson.icons, base, root, emitFileCallback),
                emitIcons(manifestJson.screenshots, base, root, emitFileCallback),
                emitShortcutIcons(manifestJson.shortcuts, base, root, emitFileCallback),
            ]);

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
