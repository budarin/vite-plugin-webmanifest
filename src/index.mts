import type { Plugin } from 'vite';

import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { load } from 'cheerio';

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
 * Plugin configuration options
 */
export type WebManifestPluginOptions = {
    /**
     * Where to emit the manifest file
     * @default 'root' - emits to /dist root
     * @example 'assets' - emits to /assets/ folder (legacy behavior)
     */
    manifestOutput?: 'assets' | 'root';
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
 * Path cache for avoiding duplicate path operations
 */
const pathCache = new Map<string, { ext: string; name: string }>();

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
 * Resolve icon path from src
 */
function resolveIconPath(src: string, root: string): string {
    if (src.startsWith('/')) {
        return path.join(root, src.slice(1));
    }
    return path.resolve(root, src);
}

/**
 * Update HTML files to reference the root manifest
 */
async function updateHtmlManifestLinks(outputDir: string, manifestFileName: string): Promise<void> {
    const indexPath = path.join(outputDir, 'index.html');

    if (existsSync(indexPath)) {
        try {
            const htmlContent = await readFile(indexPath, 'utf-8');
            const $ = load(htmlContent);
            const manifestLink = $(MANIFEST_LINK_SELECTOR);

            if (manifestLink.length > 0) {
                // Update href to point to root manifest
                manifestLink.attr('href', `./${manifestFileName}`);

                // Write updated HTML
                await writeFile(indexPath, $.html(), 'utf-8');
            }
        } catch (error) {
            console.error(
                `❌ Failed to update HTML: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

/**
 * Process and emit icons in parallel for better performance
 */
async function emitIcons(
    icons: Icon[] | undefined,
    root: string,
    callback: (iconName: string, iconPath: string) => Promise<string>,
    pluginContext: any,
    errorCode: string = 'ICON_NOT_FOUND'
): Promise<void> {
    if (!icons || !Array.isArray(icons)) {
        return;
    }

    await Promise.all(
        icons.map(async (icon) => {
            const iconPath = resolveIconPath(icon.src, root);

            if (exists(iconPath)) {
                // Cache path operations for better performance
                let pathInfo = pathCache.get(iconPath);
                if (!pathInfo) {
                    const iconExt = path.extname(iconPath);
                    const iconName = path.basename(iconPath, iconExt);
                    pathInfo = { ext: iconExt, name: iconName };
                    pathCache.set(iconPath, pathInfo);
                }

                const fileName = await callback(`${pathInfo.name}${pathInfo.ext}`, iconPath);

                // Update the icon path in the manifest
                icon.src = fileName;
            } else {
                pluginContext.error(`Icon file not found: ${iconPath}`, {
                    code: errorCode,
                });
            }
        })
    );
}

/**
 * Process and emit shortcut icons in parallel for better performance
 */
async function emitShortcutIcons(
    shortcuts: Shortcut[] | undefined,
    root: string,
    callback: (iconName: string, iconPath: string) => Promise<string>,
    pluginContext: any
): Promise<void> {
    if (!shortcuts || !Array.isArray(shortcuts)) {
        return;
    }

    // Process shortcut icons individually since they have different structure
    await Promise.all(
        shortcuts.flatMap((shortcut) =>
            shortcut.icons.map(async (icon) => {
                const iconPath = resolveIconPath(icon.src, root);

                if (exists(iconPath)) {
                    // Cache path operations for better performance
                    let pathInfo = pathCache.get(iconPath);
                    if (!pathInfo) {
                        const iconExt = path.extname(iconPath);
                        const iconName = path.basename(iconPath, iconExt);
                        pathInfo = { ext: iconExt, name: iconName };
                        pathCache.set(iconPath, pathInfo);
                    }

                    const fileName = await callback(`${pathInfo.name}${pathInfo.ext}`, iconPath);

                    // Update the icon path in the manifest
                    icon.src = fileName;
                } else {
                    pluginContext.error(`Shortcut icon file not found: ${iconPath}`, {
                        code: 'SHORTCUT_ICON_NOT_FOUND',
                    });
                }
            })
        )
    );
}

/**
 * Vite plugin for transforming webmanifest
 *
 * Features:
 * - Optimizes icons, screenshots and shortcuts by processing them in parallel
 * - Updates manifest paths according to the build configuration
 * - Supports both assets and root output modes
 * - Maintains file hashing for cache busting
 * - Updates HTML links automatically
 *
 * @param options - Plugin configuration options
 * @returns Vite plugin instance
 */
export const webmanifestPlugin = (options: WebManifestPluginOptions = {}): Plugin => {
    let base: string = './';
    let root: string = process.cwd();
    const { manifestOutput = 'root' } = options;

    // Store manifest file name for writeBundle hook
    let storedManifestFileName: string | undefined;

    return {
        name: 'vite:webmanifest',
        apply: 'build',
        enforce: 'pre',

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
            let manifestJson: WebManifest = {};
            const indexPath = path.resolve(root, 'index.html');

            if (exists(indexPath)) {
                const indexContent = await readFile(indexPath, 'utf-8');
                const $ = load(indexContent);
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
                throw new Error(
                    'WebManifest file not found. Make sure index.html contains <link rel="manifest" href="...">'
                );
            }

            try {
                const manifestContent = await readFile(manifestPath!, 'utf-8');
                manifestJson = JSON.parse(manifestContent) as WebManifest;

                // No need to store for writeBundle - we handle everything in generateBundle
            } catch (error) {
                this.error(
                    `Failed to parse WebManifest file: ${error instanceof Error ? error.message : String(error)}`
                );
            }

            // Update scope and start_url
            manifestJson.scope = base;
            manifestJson.start_url = base;

            // Callback for emitting files with caching
            const emitFileCallback = async (
                iconName: string,
                iconPath: string
            ): Promise<string> => {
                const fileId = this.emitFile({
                    type: 'asset',
                    name: iconName,
                    source: await getCachedFile(iconPath),
                });

                const fileName = this.getFileName(fileId);

                // Keep the full path including 'assets/' prefix for proper asset referencing
                return `./${fileName}`;
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
            const manifestContent = JSON.stringify(manifestJson, null, 4);

            let manifestfileName: string;

            // Always emit with name to get hashing, then adjust path in HTML
            const fileId = this.emitFile({
                type: 'asset',
                name: `${manifestName}${manifestExt}`,
                source: manifestContent,
            });
            manifestfileName = this.getFileName(fileId);

            // Store for writeBundle hook if needed
            if (manifestOutput === 'root') {
                storedManifestFileName = manifestfileName;
            }

            // Single pass through bundle: update HTML and remove old manifest
            for (const fileName in bundle) {
                const fileChunk = bundle[fileName];

                // Update HTML files to reference the hashed manifest file
                if (
                    fileName.endsWith(HTML_EXTENSION) &&
                    fileChunk.type === 'asset' &&
                    typeof fileChunk.source === 'string'
                ) {
                    const $ = load(fileChunk.source);
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

            // Clear caches after bundle is complete
            fileCache.clear();
            pathCache.clear();
        },

        async writeBundle(options) {
            if (manifestOutput === 'root' && storedManifestFileName) {
                const outputDir = options.dir || 'dist';
                const assetsManifestPath = path.join(outputDir, storedManifestFileName);

                try {
                    if (!existsSync(assetsManifestPath)) {
                        // console.warn(
                        //     `Manifest file not found: ${assetsManifestPath}, skip moving.`
                        // );
                        return;
                    }

                    const manifestFileName = storedManifestFileName.replace(/^assets\//, '');
                    const rootManifestPath = path.join(outputDir, manifestFileName);

                    const manifestContent = await readFile(assetsManifestPath, 'utf-8');
                    await writeFile(rootManifestPath, manifestContent, 'utf-8');
                    await updateHtmlManifestLinks(outputDir, manifestFileName);
                    await unlink(assetsManifestPath);
                } catch (error) {
                    console.error(
                        `❌ Failed to move manifest: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            }
        },
    };
};
