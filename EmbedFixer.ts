/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

type PatternRule = [RegExp, string];

const autoPatterns: PatternRule[] = [
    // Remove query parameters from e621 /posts/ links but keep the original domain
    [/(https?:\/\/)e621\.net\/posts\/(\d+)(\?[^\s]*)?/gi, "$1e621.net/posts/$2"],
    [/(https?:\/\/)(www\.)?furaffinity\.net\/view\/(\d+)/gi, "$1fxraffinity.net/view/$3"],
    [/(https?:\/\/)(furaffinity\.net\/view\/(\d+))/gi, "$1fxraffinity.net/view/$3"],
    [/(https?:\/\/)(www\.)?(fxtwitter\.com|twitter\.com|x\.com)/gi, "$1fixupx.com"],
    [/(https?:\/\/)(www\.)?vrchat\.com\/home\/launch\?worldId=([a-zA-Z0-9_-]+)/gi, "$1vrchat.com/home/world/$3"],
    [/(https?:\/\/)(www\.)?tiktok\.com/gi, "$1vxtiktok.com"],
    [/(https?:\/\/)(tiktok\.com)/gi, "$1vxtiktok.com"],
    [/(https?:\/\/terabox\.benjifox\.gay\/d\/Terabox\/([a-zA-Z0-9_-]+)(\?.*)?)/gi, "https://terabox.benjifox.gay/d/$2$3"],
    [/(https?:\/\/alist\.benjifox\.gay\/d\/Terabox\/([a-zA-Z0-9_-]+)(\?.*)?)/gi, "https://terabox.benjifox.gay/d/$2$3"],
    [/(https?:\/\/)(www\.)?bsky\.app/gi, "$1fxbsky.app"],
    [/(https?:\/\/)(www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/gi, "$1youtube.com/watch?v=$3"],
    [/(https?:\/\/)(www\.)?instagram\.com/gi, "$1kkinstagram.com"],
    [/(https?:\/\/)(www\.)?tiktok\.com/gi, "$1proxitok.pabloferreiro.es"],
    [/(https?:\/\/)(www\.)?medium\.com/gi, "$1scribe.rip"],
    [/(https?:\/\/)(www\.)?pinterest\.com/gi, "$1pinboard.in"],
    [/(https?:\/\/)(www\.)?soundcloud\.com/gi, "$1sndcdn.com"],
];

const manualPatterns: PatternRule[] = [
    // Manual trigger: proxy e621 posts via fx.benjifox.gay
    [/(https?:\/\/)e621\.net\/posts\/(\d+)(\?[^\s]*)?/gi, "$1fx.benjifox.gay/$2"],
];

const markdownDetectors: RegExp[] = [
    /```/,
    /`[^`]*`/,
    /\[[^\]]+\]\([^\)]+\)/,
    /(^|\s)\*\*(?=\S)(.*?)(?<=\S)\*\*(?=\s|$)/,
    /(^|\s)\*(?=\S)(.*?)(?<=\S)\*(?=\s|$)/,
    /(^|\s)__(?=\S)(.*?)(?<=\S)__(?=\s|$)/,
    /(^|\s)_(?=\S)(.*?)(?<=\S)_(?=\s|$)/,
    /~~(?=\S)(.*?)(?<=\S)~~/,
    /\|\|(?=\S)(.*?)(?<=\S)\|\|/,
    /(^|\n)>\s/,
    /(^|\n)(?:-|\*|\d+\.)\s/,
    /<https?:\/\/[^>]+>/
];

function containsMarkdownSyntax(text: string): boolean {
    return markdownDetectors.some((detector) => detector.test(text));
}

function applyPatterns(text: string, patterns: PatternRule[]): string {
    let result = text;
    for (const [pattern, replacement] of patterns) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

function processEmbeds(text: string, patterns: PatternRule[], guardMarkdown: boolean): string {
    // Reference: transform_urls from telegramuserbot
    /**
     * Rewrite rules that normalize and proxy common social/media URLs prior to embedding.
     *
     * Each entry is a tuple of [pattern, replacement]:
     * - pattern: A global, case-insensitive RegExp that matches a specific URL shape.
     * - replacement: A string with backreferences that builds the normalized/proxied URL.
     *
     * Processing notes:
     * - Order matters. Apply the rules sequentially; later rules may overlap earlier ones.
     * - Protocol is preserved (http/https) in all mappings that capture it.
     * - Some mappings intentionally drop query parameters (e.g., e621), while others preserve them (e.g., Terabox).
     * - There are duplicated/overlapping rules (e.g., TikTok) pointing to different frontends; ensure the final order reflects your intended target.
     *
     * Examples:
     * - https://e621.net/posts/12345?utm=foo -> https://e621.net/posts/12345 (auto) / https://fx.benjifox.gay/12345 (manual)
     * - https://x.com/user/status/abc -> https://fixupx.com/user/status/abc
     * - https://www.youtube.com/shorts/XYZ -> https://www.youtube.com/watch?v=XYZ
     * - https://vrchat.com/home/launch?worldId=WRLD_123489384938943 -> https://vrchat.com/home/world/WRLD_123489384938943
     * - https://alist.benjifox.gay/d/Terabox/FILE_ID?dl=1 -> https://terabox.benjifox.gay/d/FILE_ID?dl=1
     */
    const originalText = text;
    // Protect escaped URLs (e.g. \https://example) so they bypass proxying while
    // also dropping the leading backslash in the final output.
    const escapedUrls: string[] = [];
    let working = text.replace(/\\(https?:\/\/\S+)/g, (_match, url: string) => {
        const placeholder = `__EMBEDFIXER_ESCAPED_${escapedUrls.length}__`;
        escapedUrls.push(url);
        return placeholder;
    });

    const shouldRewrite = guardMarkdown ? !containsMarkdownSyntax(originalText) : true;
    if (shouldRewrite) {
        working = applyPatterns(working, patterns);
    }

    for (let index = 0; index < escapedUrls.length; index++) {
        const placeholder = `__EMBEDFIXER_ESCAPED_${index}__`;
        const url = escapedUrls[index];
        working = working.split(placeholder).join(url);
    }
    return working;
}

function fixEmbeds(text: string): string {
    return processEmbeds(text, autoPatterns, true);
}

export function fixEmbedsManual(text: string): string {
    return processEmbeds(text, [...autoPatterns, ...manualPatterns], false);
}


export default definePlugin({
    name: "EmbedFixer",
    description: "Replaces various links in your messages with alternative domains for better embeds.",
    authors: [{ name: "BenjiThatFoxGuy", id: 263241553072488448n }],

    commands: [
        {
            name: "fixembeds",
            description: "Manually apply embed fixes to the current message",
            inputType: 1, // ApplicationCommandInputType.BUILT_IN_TEXT
            execute: (_args: any, ctx: any) => {
                const content = ctx.content;
                if (typeof content === "string") {
                    const fixed = fixEmbedsManual(content);
                    return {
                        content: fixed
                    };
                }
            }
        }
    ],

    onBeforeMessageSend(_channelId: string, msg: { content?: string }) {
        if (typeof msg.content === "string") {
            msg.content = fixEmbeds(msg.content);
        }
    }
});
