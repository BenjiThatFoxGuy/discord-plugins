/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

function isEscaped(input: string, startIndex: number): boolean {
    let backslashCount = 0;
    for (let idx = startIndex - 1; idx >= 0 && input[idx] === "\\"; idx--) {
        backslashCount++;
    }
    return (backslashCount & 1) === 1;
}

function applyReplacementTemplate(
    template: string,
    match: string,
    captures: Array<string | undefined>,
    offset: number,
    input: string
): string {
    return template.replace(/\$(\$|&|`|'|\d{1,2})/g, (_, token: string) => {
        switch (token) {
            case "$":
                return "$";
            case "&":
                return match;
            case "`":
                return input.slice(0, offset);
            case "'":
                return input.slice(offset + match.length);
            default: {
                const groupIndex = Number(token) - 1;
                if (Number.isNaN(groupIndex) || groupIndex < 0) {
                    return "";
                }
                return captures[groupIndex] ?? "";
            }
        }
    });
}

function createReplacement(replacement: string) {
    return (
        match: string,
        ...rest: Array<string | number | Record<string, string> | undefined>
    ): string => {
        let input = "";
        let offset = 0;
        if (
            rest.length > 0 &&
            typeof rest[rest.length - 1] === "object" &&
            rest[rest.length - 1] !== null &&
            !Array.isArray(rest[rest.length - 1])
        ) {
            rest.pop();
        }
        if (rest.length > 0) {
            input = String(rest.pop());
        }
        if (rest.length > 0) {
            offset = Number(rest.pop());
        }
        const captures = rest as Array<string | undefined>;
        if (isEscaped(input, offset)) {
            return match;
        }
        return applyReplacementTemplate(replacement, match, captures, offset, input);
    };
}

function fixEmbeds(text: string): string {
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
     * Rules overview:
     * - e621 posts: e621.net/posts/{id}[?...] -> fx.benjifox.gay/{id} (query removed).
     * - FurAffinity posts: furaffinity.net/view/{id} (with/without www, alt path forms) -> fxraffinity.net/view/{id}.
     * - X/Twitter: fxtwitter.com, twitter.com, or x.com -> fixupx.com.
     * - VRChat instances: Turns instance links into world links /home/launch?worldId={id} -> /home/world/{id}.
     * - TikTok: tiktok.com -> vxtiktok.com and/or proxitok.pabloferreiro.es (overlapping rules; last applied wins).
     * - Terabox normalization: terabox.benjifox.gay/d/Terabox/{id}[?q...] or alist.benjifox.gay/d/Terabox/{id}[?q...] -> terabox.benjifox.gay/d/{id}[?q...] (query preserved).
     * - Bluesky: bsky.app -> fxbsky.app.
     * - YouTube Shorts to normal videos: /shorts/{id} -> /watch?v={id}.
     * - Instagram: instagram.com -> kkinstagram.com.
     * - Medium: medium.com -> scribe.rip.
     * - Pinterest: pinterest.com -> pinboard.in.
     * - SoundCloud: soundcloud.com -> sndcdn.com.
     *
     * Examples:
     * - https://e621.net/posts/12345?utm=foo -> https://fx.benjifox.gay/12345
     * - https://x.com/user/status/abc -> https://fixupx.com/user/status/abc
     * - https://www.youtube.com/shorts/XYZ -> https://www.youtube.com/watch?v=XYZ
     * - https://vrchat.com/home/launch?worldId=WRLD_123489384938943 -> https://vrchat.com/home/world/WRLD_123489384938943
     * - https://alist.benjifox.gay/d/Terabox/FILE_ID?dl=1 -> https://terabox.benjifox.gay/d/FILE_ID?dl=1
     */
    const patterns: [RegExp, string][] = [
        // Remove query parameters and transform e621 /posts/ links to fx.benjifox.gay
        [/(https?:\/\/)e621\.net\/posts\/(\d+)(\?[^\s]*)?/gi, "$1fx.benjifox.gay/$2"],
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
    for (const [pattern, replacement] of patterns) {
        // Respect Discord-style escaping: \https://example stays untouched.
        text = text.replace(pattern, createReplacement(replacement));
    }
    return text;
}


export default definePlugin({
    name: "EmbedFixer",
    description: "Replaces various links in your messages with alternative domains for better embeds.",
    authors: [{ name: "BenjiThatFoxGuy", id: 263241553072488448n }],

    onBeforeMessageSend(_channelId: string, msg: { content?: string }) {
        if (typeof msg.content === "string") {
            msg.content = fixEmbeds(msg.content);
        }
    },

    onBeforeMessageEdit(_cid: string, _mid: string, msg: { content?: string }) {
        if (typeof msg.content === "string") {
            msg.content = fixEmbeds(msg.content);
        }
    }
});
