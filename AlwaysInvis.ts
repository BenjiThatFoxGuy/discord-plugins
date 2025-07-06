/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getUserSettingLazy } from "@api/UserSettings";
import definePlugin from "@utils/types";

let unpatch: (() => void) | undefined;
export default definePlugin({
    name: "AlwaysInvis",
    description: "Forces your client status to always be Invisible.",
    authors: [{ name: "BenjiThatFoxGuy", id: 263241553072488448n }],
    patches: [
        {
            // Patch all presence updates to force invisible
            find: 'type:"PRESENCE_UPDATE",presence',
            replacement: {
                match: /presence:\w+/,
                replace: 'presence:"invisible"'
            }
        }
    ],
    start() {
        // Simulate setting status to invisible via the user settings API
        const statusSettings = getUserSettingLazy("status", "status");
        if (statusSettings && typeof statusSettings.updateSetting === "function") {
            statusSettings.updateSetting("invisible");
            // Patch updateSetting to always force invisible
            const origUpdateSetting = statusSettings.updateSetting;
            statusSettings.updateSetting = function () {
                // Always force invisible, ignore user input
                return origUpdateSetting.call(this, () => "invisible");
            };
            // Provide a way to unpatch
            unpatch = () => {
                statusSettings.updateSetting = origUpdateSetting;
            };
        }
    },
    stop() {
        if (unpatch) unpatch();
        unpatch = undefined;
    }
});
