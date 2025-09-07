/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, UploadHandler } from "@webpack/common";
import { Sticker } from "./types";

const PendingReplyStore = findByPropsLazy("getPendingReply");
const MessageUtils = findByPropsLazy("sendMessage");
const DraftStore = findByPropsLazy("getDraft", "getState");

export async function sendSticker({
    channelId,
    sticker,
    sendAsLink,
    ctrlKey,
    shiftKey
}: { channelId: string; sticker: Sticker; sendAsLink?: boolean; ctrlKey: boolean; shiftKey: boolean; }) {

    let messageContent = "";
    if (DraftStore) {
        messageContent = DraftStore.getDraft(channelId, 0);
    }

    let messageOptions = {};
    if (PendingReplyStore) {
        const pendingReply = PendingReplyStore.getPendingReply(channelId);
        if (pendingReply) {
            messageOptions = MessageUtils.getSendMessageOptionsForReply(pendingReply);
        }
    }

    // Read setting to determine default behavior
    const SEND_AS_URL_KEY = "MoreStickers:SendAsUrlNoConfirm";
    const prefSendAsUrl = Boolean(await DataStore.get(SEND_AS_URL_KEY));

    // Effective flags: if pref is on, act as if Shift is held unless Ctrl is forcing upload
    const effectiveShift = shiftKey || (prefSendAsUrl && !ctrlKey);

    if ((ctrlKey || !sendAsLink) && !effectiveShift) {
        // Drag-and-drop equivalent: upload the original file as-is
        const response = await fetch(sticker.image);
        const blob = await response.blob();
        const fallbackName = (new URL(sticker.image)).pathname.split("/").pop() || "sticker";
        const filename = sticker.filename ?? fallbackName;
        const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

        UploadHandler.promptToUpload([file], ChannelStore.getChannel(channelId), 0);
        return;
    } else if (effectiveShift) {
        if (!messageContent.endsWith(" ") && !messageContent.endsWith("\n")) messageContent += " ";
        messageContent += sticker.image;
        MessageUtils._sendMessage(channelId, {
            content: sticker.image
        }, messageOptions || {});
    } else {
        MessageUtils._sendMessage(channelId, {
            content: `${messageContent} ${sticker.image}`.trim()
        }, messageOptions || {});
    }
}
