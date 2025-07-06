/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

function fixEmbeds(text: string): string {
    // Reference: transform_urls from telegramuserbot
    const patterns: [RegExp, string][] = [
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
        text = text.replace(pattern, replacement);
    }
    return text;
}


export default definePlugin({
    name: "EmbedFixer",
    description: "Replaces various links in your messages with alternative domains for better embeds.",
    authors: [{ name: "BenjiThatFoxGuy", id: 263241553072488448n }],

    onBeforeMessageSend(_, msg) {
        if (typeof msg.content === "string") {
            msg.content = fixEmbeds(msg.content);
        }
    },

    onBeforeMessageEdit(_cid, _mid, msg) {
        if (typeof msg.content === "string") {
            msg.content = fixEmbeds(msg.content);
        }
    }
});
