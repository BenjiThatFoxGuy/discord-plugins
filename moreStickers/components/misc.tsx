/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { CheckedTextInput } from "@components/CheckedTextInput";
import { Flex } from "@components/Flex";
import { Button, Forms, React, TabBar, Text, TextArea, Toasts } from "@webpack/common";
import { JSX } from "react";

import { convert as convertLineEP, getIdFromUrl as getLineEmojiPackIdFromUrl, getStickerPackById as getLineEmojiPackById, isLineEmojiPackHtml, parseHtml as getLineEPFromHtml } from "../lineEmojis";
import { convert as convertLineSP, getIdFromUrl as getLineStickerPackIdFromUrl, getStickerPackById as getLineStickerPackById, isLineStickerPackHtml, parseHtml as getLineSPFromHtml } from "../lineStickers";
import { isV1, migrate } from "../migrate-v1";
import { deleteStickerPack, getStickerPack, getStickerPackMetas, saveStickerPack } from "../stickers";
import { SettingsTabsKey, Sticker, StickerPack, StickerPackMeta } from "../types";
import { cl, clPicker, Mutex, corsFetch } from "../utils";
import { startRemoteRefresh, stopRemoteRefresh } from "../remote";

const mutex = new Mutex();

// The ID of recent sticker and recent sticker pack
export const RECENT_STICKERS_ID = "recent";
export const RECENT_STICKERS_TITLE = "Recently Used";

const KEY = "MoreStickers:RecentStickers";

const noDrag = {
    onMouseDown: e => { e.preventDefault(); return false; },
    onDragStart: e => { e.preventDefault(); return false; }
};

const StickerPackMetadata = ({ meta, hoveredStickerPackId, setHoveredStickerPackId, refreshStickerPackMetas }:
    { meta: StickerPackMeta, [key: string]: any; }
) => {
    return (
        <div className="sticker-pack"
            onMouseEnter={() => setHoveredStickerPackId(meta.id)}
            onMouseLeave={() => setHoveredStickerPackId(null)}
        >
            <div className={
                [
                    clPicker("content-row-grid-inspected-indicator"),
                    hoveredStickerPackId === meta.id ? "inspected" : ""
                ].join(" ")
            } style={{
                top: "unset",
                left: "unset",
                height: "96px",
                width: "96px",
            }}></div>
            {meta.logo?.image ? <img src={meta.logo.image} width="96" {...noDrag} /> : null}
            <button
                className={hoveredStickerPackId === meta.id ? "show" : ""}
                onClick={async () => {
                    try {
                        await deleteStickerPack(meta.id);
                        Toasts.show({
                            message: "Sticker Pack deleted",
                            type: Toasts.Type.SUCCESS,
                            id: Toasts.genId(),
                            options: {
                                duration: 1000
                            }
                        });
                        await refreshStickerPackMetas();
                    } catch (e: any) {
                        Toasts.show({
                            message: e.message,
                            type: Toasts.Type.FAILURE,
                            id: Toasts.genId(),
                            options: {
                                duration: 1000
                            }
                        });
                    }
                }}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" style={{ fill: "var(--status-danger)" }}>
                    <title>Delete</title>
                    <path d="M15 3.999V2H9V3.999H3V5.999H21V3.999H15Z" />
                    <path d="M5 6.99902V18.999C5 20.101 5.897 20.999 7 20.999H17C18.103 20.999 19 20.101 19 18.999V6.99902H5ZM11 17H9V11H11V17ZM15 17H13V11H15V17Z" />
                </svg>
            </button>
            <Text className={cl("pack-title")} tag="span">{meta.title}</Text>
        </div>
    );
};

export const Settings = () => {
    const [stickerPackMetas, setstickerPackMetas] = React.useState<StickerPackMeta[]>([]);
    const [addStickerUrl, setAddStickerUrl] = React.useState<string>("");
    const [addStickerHtml, setAddStickerHtml] = React.useState<string>("");
    const [tab, setTab] = React.useState<SettingsTabsKey>(SettingsTabsKey.ADD_STICKER_PACK_URL);
    const [hoveredStickerPackId, setHoveredStickerPackId] = React.useState<string | null>(null);
    const [_isV1, setV1] = React.useState<boolean>(false);
    const [remoteUrls, setRemoteUrls] = React.useState<string>("");
    const [remoteIntervalMins, setRemoteIntervalMins] = React.useState<number>(720);
    const [lastRemoteRefresh, setLastRemoteRefresh] = React.useState<number | null>(null);
    const REMOTE_URLS_KEY = "MoreStickers:RemoteUrls";
    const REMOTE_LAST_REFRESH_KEY = "MoreStickers:RemoteLastRefresh";

    async function refreshStickerPackMetas() {
        setstickerPackMetas(await getStickerPackMetas());
    }
    React.useEffect(() => {
        refreshStickerPackMetas();
    }, []);
    React.useEffect(() => {
        isV1().then(setV1);
    }, []);

    // Load remote URLs and interval from storage
    React.useEffect(() => {
        (async () => {
            const urls = (await DataStore.get(REMOTE_URLS_KEY)) as string | undefined;
            const interval = (await DataStore.get(`${REMOTE_URLS_KEY}:interval`)) as number | undefined;
            const last = (await DataStore.get(REMOTE_LAST_REFRESH_KEY)) as number | undefined;
            setRemoteUrls(urls ?? "");
            setRemoteIntervalMins(typeof interval === "number" && interval > 0 ? interval : 720);
            setLastRemoteRefresh(typeof last === "number" ? last : null);
        })();
    }, []);

    async function fetchRemotePacksOnce() {
        const urls = remoteUrls.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (!urls.length) return;

        const packs: StickerPack[] = [];
        for (const url of urls) {
            try {
                const res = await corsFetch(url);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const json = await res.json();
                if (Array.isArray(json)) packs.push(...json);
                else packs.push(json);
            } catch (e) {
                console.error("MoreStickers: failed remote fetch", url, e);
            }
        }

        for (const sp of packs) {
            try {
                await saveStickerPack(sp);
            } catch (e) {
                console.error("MoreStickers: failed saving pack", sp?.id, e);
            }
        }

    const ts = Date.now();
    await DataStore.set(REMOTE_LAST_REFRESH_KEY, ts);
    setLastRemoteRefresh(ts);
        await refreshStickerPackMetas();
    }

    return (
        <div className={cl("settings")}>
            <TabBar
                type="top"
                look="brand"
                selectedItem={tab}
                onItemSelect={setTab}
                className="tab-bar"
            >
                {
                    Object.values(SettingsTabsKey).map(k => (
                        <TabBar.Item key={k} id={k} className="tab-bar-item">
                            {k}
                        </TabBar.Item>
                    ))
                }
            </TabBar>

            {tab === SettingsTabsKey.ADD_STICKER_PACK_URL &&
                <div className="section">
                    <Forms.FormTitle tag="h5">Add Sticker Pack from URL</Forms.FormTitle>
                    <Forms.FormText>
                        <p>
                            Currently LINE stickers/emojis supported only. <br />

                            Get Telegram stickers with <a href="#" onClick={() => VencordNative.native.openExternal("https://github.com/lekoOwO/MoreStickersConverter")}> MoreStickersConverter</a>.
                        </p>
                    </Forms.FormText>
                    <Flex flexDirection="row" style={{
                        alignItems: "center",
                        justifyContent: "center"
                    }} >
                        <span style={{
                            flexGrow: 1
                        }}>
                            <CheckedTextInput
                                value={addStickerUrl}
                                onChange={setAddStickerUrl}
                                validate={(v: string) => {
                                    try {
                                        getLineStickerPackIdFromUrl(v);
                                        return true;
                                    } catch (e: any) { }
                                    try {
                                        getLineEmojiPackIdFromUrl(v);
                                        return true;
                                    } catch (e: any) { }

                                    return "Invalid URL";
                                }}
                                placeholder="Sticker Pack URL"
                            />
                        </span>
                        <Button
                            size={Button.Sizes.SMALL}
                            onClick={async e => {
                                e.preventDefault();

                                let type: string = "";
                                try {
                                    getLineStickerPackIdFromUrl(addStickerUrl);
                                    type = "LineStickerPack";
                                } catch (e: any) { }

                                try {
                                    getLineEmojiPackIdFromUrl(addStickerUrl);
                                    type = "LineEmojiPack";
                                } catch (e: any) { }

                                let errorMessage = "";
                                switch (type) {
                                    case "LineStickerPack": {
                                        try {
                                            const id = getLineStickerPackIdFromUrl(addStickerUrl);
                                            const lineSP = await getLineStickerPackById(id);
                                            const stickerPack = convertLineSP(lineSP);
                                            await saveStickerPack(stickerPack);
                                        } catch (e: any) {
                                            console.error(e);
                                            errorMessage = e.message;
                                        }
                                        break;
                                    }
                                    case "LineEmojiPack": {
                                        try {
                                            const id = getLineEmojiPackIdFromUrl(addStickerUrl);
                                            const lineEP = await getLineEmojiPackById(id);
                                            const stickerPack = convertLineEP(lineEP);
                                            await saveStickerPack(stickerPack);

                                        } catch (e: any) {
                                            console.error(e);
                                            errorMessage = e.message;
                                        }
                                        break;
                                    }
                                }

                                setAddStickerUrl("");
                                refreshStickerPackMetas();

                                if (errorMessage) {
                                    Toasts.show({
                                        message: errorMessage,
                                        type: Toasts.Type.FAILURE,
                                        id: Toasts.genId(),
                                        options: {
                                            duration: 1000
                                        }
                                    });
                                } else {
                                    Toasts.show({
                                        message: "Sticker Pack added",
                                        type: Toasts.Type.SUCCESS,
                                        id: Toasts.genId(),
                                        options: {
                                            duration: 1000
                                        }
                                    });
                                }

                            }}
                        >Insert</Button>
                    </Flex>
                </div>
            }
            {tab === SettingsTabsKey.ADD_STICKER_PACK_HTML &&
                <div className="section">
                    <Forms.FormTitle tag="h5">Add Sticker Pack from HTML</Forms.FormTitle>
                    <Forms.FormText>
                        <p>
                            When encountering errors while adding a sticker pack, you can try to add it using the HTML source code of the sticker pack page.<br />
                            This applies to stickers which are region locked / OS locked / etc.<br />
                            The region LINE recognized may vary from the region you are in due to the CORS proxy we're using.
                        </p>
                    </Forms.FormText>
                    <Flex flexDirection="row" style={{
                        alignItems: "center",
                        justifyContent: "center"
                    }} >
                        <span style={{
                            flexGrow: 1
                        }}>
                            <TextArea
                                value={addStickerHtml}
                                onChange={setAddStickerHtml}
                                placeholder="Paste HTML here"
                                rows={1}
                            />
                        </span>
                        <Button
                            size={Button.Sizes.SMALL}
                            onClick={async e => {
                                e.preventDefault();

                                let errorMessage = "";
                                if (isLineEmojiPackHtml(addStickerHtml)) {
                                    try {
                                        const lineEP = getLineEPFromHtml(addStickerHtml);
                                        const stickerPack = convertLineEP(lineEP);
                                        await saveStickerPack(stickerPack);
                                    } catch (e: any) {
                                        console.error(e);
                                        errorMessage = e.message;
                                    }
                                } else if (isLineStickerPackHtml(addStickerHtml)) {
                                    try {
                                        const lineSP = getLineSPFromHtml(addStickerHtml);
                                        const stickerPack = convertLineSP(lineSP);
                                        await saveStickerPack(stickerPack);
                                    } catch (e: any) {
                                        console.error(e);
                                        errorMessage = e.message;
                                    }
                                }

                                setAddStickerHtml("");
                                refreshStickerPackMetas();

                                if (errorMessage) {
                                    Toasts.show({
                                        message: errorMessage,
                                        type: Toasts.Type.FAILURE,
                                        id: Toasts.genId(),
                                        options: {
                                            duration: 1000
                                        }
                                    });
                                } else {
                                    Toasts.show({
                                        message: "Sticker Pack added",
                                        type: Toasts.Type.SUCCESS,
                                        id: Toasts.genId(),
                                        options: {
                                            duration: 1000
                                        }
                                    });
                                }
                            }}
                        >Insert from HTML</Button>
                    </Flex>
                </div>
            }
            {
                tab === SettingsTabsKey.ADD_STICKER_PACK_FILE &&
                <div className="section">
                    <Forms.FormTitle tag="h5">Add Sticker Pack from File</Forms.FormTitle>

                    <Button
                        size={Button.Sizes.SMALL}
                        onClick={async e => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = ".stickerpack,.stickerpacks,.json";
                            input.onchange = async e => {
                                try {
                                    const file = input.files?.[0];
                                    if (!file) return;

                                    const fileText = await file.text();
                                    const fileJson = JSON.parse(fileText);
                                    let stickerPacks: StickerPack[] = [];
                                    if (Array.isArray(fileJson)) {
                                        stickerPacks = fileJson;
                                    } else {
                                        stickerPacks = [fileJson];
                                    }

                                    for (const stickerPack of stickerPacks) {
                                        await saveStickerPack(stickerPack);
                                    }

                                    Toasts.show({
                                        message: "Sticker Packs added",
                                        type: Toasts.Type.SUCCESS,
                                        id: Toasts.genId(),
                                        options: {
                                            duration: 1000
                                        }
                                    });
                                } catch (e: any) {
                                    console.error(e);
                                    Toasts.show({
                                        message: e.message,
                                        type: Toasts.Type.FAILURE,
                                        id: Toasts.genId(),
                                        options: {
                                            duration: 1000
                                        }
                                    });
                                }
                            };
                            input.click();
                        }}
                    >
                        Open Sticker Pack File
                    </Button>
                </div>
            }
            {tab === SettingsTabsKey.REMOTE_URLS &&
                <div className="section">
                    <Forms.FormTitle tag="h5">Remote Sticker Pack URLs</Forms.FormTitle>
                    <Forms.FormText>
                        Enter one URL per line. Each URL should point to a .stickerpack, .stickerpacks, or JSON file.
                    </Forms.FormText>
                    <Flex flexDirection="column" style={{ gap: 8 }}>
                        <TextArea
                            value={remoteUrls}
                            onChange={setRemoteUrls}
                            placeholder={"https://example.com/pack.stickerpack\nhttps://example.com/packs.stickerpacks"}
                            rows={4}
                        />
                        <Flex flexDirection="row" style={{ alignItems: "center", gap: 8 }}>
                            <Forms.FormText>Refresh interval (minutes)</Forms.FormText>
                            <input
                                type="number"
                                min={1}
                                value={remoteIntervalMins}
                                onChange={e => setRemoteIntervalMins(Math.max(1, Number(e.currentTarget.value) || 0))}
                                placeholder="720"
                                style={{ width: 96 }}
                            />
                            {lastRemoteRefresh && (
                                <Forms.FormText>
                                    Last: {new Date(lastRemoteRefresh).toLocaleString()}
                                </Forms.FormText>
                            )}
                            <Button
                                size={Button.Sizes.SMALL}
                                onClick={async () => {
                                    await DataStore.set(REMOTE_URLS_KEY, remoteUrls);
                                    await DataStore.set(`${REMOTE_URLS_KEY}:interval`, remoteIntervalMins);
                                    try {
                                        stopRemoteRefresh();
                                        await startRemoteRefresh();
                                    } catch (e) {
                                        console.error(e);
                                    }
                                    Toasts.show({
                                        message: "Saved remote URL settings",
                                        type: Toasts.Type.SUCCESS,
                                        id: Toasts.genId(),
                                        options: { duration: 1000 }
                                    });
                                }}
                            >Save</Button>
                            <Button
                                size={Button.Sizes.SMALL}
                                onClick={fetchRemotePacksOnce}
                            >Refresh Now</Button>
                        </Flex>
                    </Flex>
                </div>
            }
            {
                tab === SettingsTabsKey.MISC &&
                <div className="section">
                    <Forms.FormTitle tag="h5">Misc tools</Forms.FormTitle>

                    <Flex flexDirection="row" style={{
                        alignItems: "center",
                        justifyContent: "start"
                    }} >
                        <Button
                            size={Button.Sizes.SMALL}
                            onClick={async e => {
                                const result: StickerPack[] = [];
                                const stickerPacks = await getStickerPackMetas();
                                for (const stickerPack of stickerPacks) {
                                    const sp = await getStickerPack(stickerPack.id);
                                    if (sp) {
                                        result.push(sp);
                                    }
                                }

                                const a = document.createElement("a");
                                a.href = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: "application/json" }));
                                a.download = "MoreStickers.stickerpacks";
                                a.click();

                                Toasts.show({
                                    message: "Sticker Packs exported",
                                    type: Toasts.Type.SUCCESS,
                                    id: Toasts.genId(),
                                    options: {
                                        duration: 1000
                                    }
                                });
                            }}
                        >Export Sticker Packs</Button>
                        <Button
                            size={Button.Sizes.SMALL}
                            onClick={async e => {
                                await migrate();
                            }}
                            style={{
                                display: _isV1 ? "unset" : "none"
                            }}
                        >Migrate from v1</Button>
                    </Flex>
                </div>
            }
            <Forms.FormDivider style={{
                marginTop: "8px",
                marginBottom: "8px"
            }} />
            <Forms.FormTitle tag="h5">Stickers Management</Forms.FormTitle>

            <div className="section">
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                    gap: "8px"
                }}>
                    {
                        stickerPackMetas.map(meta => (
                            <StickerPackMetadata
                                key={meta.id}
                                meta={meta}
                                hoveredStickerPackId={hoveredStickerPackId}
                                setHoveredStickerPackId={setHoveredStickerPackId}
                                refreshStickerPackMetas={refreshStickerPackMetas}
                            />
                        ))
                    }
                </div>
            </div>

        </div>
    );
};


export function Header(props: { children: JSX.Element | JSX.Element[]; }) {
    return (
        <div className={cl("header")}>
            {props.children}
        </div>
    );
}

export function Wrapper(props: { children: JSX.Element | JSX.Element[]; }) {
    return (
        <div style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "48px auto",
            gridTemplateRows: "auto 1fr auto",
        }}>
            {props.children}
        </div>
    );
}

export async function getRecentStickers(key: string = KEY): Promise<Sticker[]> {
    return (await DataStore.get(key)) ?? [];
}

export async function setRecentStickers(stickers: Sticker[], key: string = KEY): Promise<void> {
    const unlock = await mutex.lock();
    try {
        await DataStore.set(key, stickers);
    } finally {
        unlock();
    }
}

export async function addRecentSticker(sticker: Sticker): Promise<void> {
    const stickers = await getRecentStickers();
    const index = stickers.findIndex(s => s.id === sticker.id);
    if (index !== -1) {
        stickers.splice(index, 1);
    }
    stickers.unshift(sticker);
    while (stickers.length > 16) {
        stickers.pop();
    }
    await setRecentStickers(stickers);
}

export async function removeRecentStickerByPackId(packId: string): Promise<void> {
    const stickers = await getRecentStickers();
    await setRecentStickers(stickers.filter(s => s.stickerPackId !== packId));
}
