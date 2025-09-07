/*
 * Remote sticker pack loader and scheduler for MoreStickers
 */

import * as DataStore from "@api/DataStore";

import { saveStickerPack } from "./stickers";
import { StickerPack } from "./types";

export const REMOTE_URLS_KEY = "MoreStickers:RemoteUrls";
export const REMOTE_LAST_REFRESH_KEY = "MoreStickers:RemoteLastRefresh";
const REMOTE_INTERVAL_KEY = `${REMOTE_URLS_KEY}:interval`;

let timer: any = null;

function parseUrls(urlsText?: string): string[] {
    return (urlsText ?? "")
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
}

async function fetchOne(url: string): Promise<StickerPack[]> {
    try {
    const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        if (Array.isArray(json)) return json as StickerPack[];
        return [json as StickerPack];
    } catch (e) {
        console.error("MoreStickers remote: fetch failed", url, e);
        return [];
    }
}

export async function fetchRemotePacksOnce(urlsText?: string): Promise<number> {
    const urls = parseUrls(urlsText ?? (await DataStore.get(REMOTE_URLS_KEY) as string | undefined));
    if (!urls.length) return 0;

    let count = 0;
    for (const url of urls) {
        const packs = await fetchOne(url);
        for (const sp of packs) {
            try {
                await saveStickerPack(sp);
                count++;
            } catch (e) {
                console.error("MoreStickers remote: save failed", sp?.id, e);
            }
        }
    }

    await DataStore.set(REMOTE_LAST_REFRESH_KEY, Date.now());
    return count;
}

export async function startRemoteRefresh(): Promise<void> {
    const urlsText = await DataStore.get(REMOTE_URLS_KEY) as string | undefined;
    const urls = parseUrls(urlsText);
    if (!urls.length) return;

    const intervalMins = await DataStore.get(REMOTE_INTERVAL_KEY) as number | undefined;
    const mins = Math.max(1, Number(intervalMins) || 720);

    const last = await DataStore.get(REMOTE_LAST_REFRESH_KEY) as number | undefined;
    const now = Date.now();
    if (!last || (now - last) > mins * 60_000) {
        await fetchRemotePacksOnce(urlsText);
    }

    stopRemoteRefresh();
    timer = setInterval(() => {
        fetchRemotePacksOnce().catch(console.error);
    }, mins * 60_000);
}

export function stopRemoteRefresh(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
