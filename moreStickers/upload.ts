/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

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
    const { textEditor } = Vencord.Plugins.plugins.MoreStickers as any;
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

    if ((ctrlKey || !sendAsLink) && !shiftKey) {
        // Drag-and-drop equivalent: upload the original file as-is
        const response = await fetch(sticker.image);
        const blob = await response.blob();
        const fallbackName = (new URL(sticker.image)).pathname.split("/").pop() || "sticker";
        const filename = sticker.filename ?? fallbackName;
        const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

        UploadHandler.promptToUpload([file], ChannelStore.getChannel(channelId), 0);
        return;
    } else if (shiftKey) {
        if (!messageContent.endsWith(" ") || !messageContent.endsWith("\n")) messageContent += " ";
        messageContent += sticker.image;

        if (ctrlKey && textEditor && textEditor.insertText && typeof textEditor.insertText === "function") {
            textEditor.insertText(messageContent);
        } else {
            MessageUtils._sendMessage(channelId, {
                content: sticker.image
            }, messageOptions || {});
        }
    } else {
        MessageUtils._sendMessage(channelId, {
            content: `${messageContent} ${sticker.image}`.trim()
        }, messageOptions || {});
    }
}
