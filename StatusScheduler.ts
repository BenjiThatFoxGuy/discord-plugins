/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getUserSettingLazy } from "@api/UserSettings";
import definePlugin from "@utils/types";

type StatusType = "online" | "idle" | "dnd" | "invisible";

interface StatusScheduleEntry {
    time: string; // "HH:MM" in 24h format
    status: StatusType;
}

// const defaultSchedule: StatusScheduleEntry[] = [
//     { time: "09:00", status: "online" },
//     { time: "12:00", status: "idle" },
//     { time: "18:00", status: "dnd" },
//     { time: "23:00", status: "invisible" }
// ];

const defaultSchedule: StatusScheduleEntry[] = [
    { time: "10:00", status: "online" },
    { time: "00:00", status: "invisible" }
];

let intervalId: NodeJS.Timeout | undefined;


function setStatus(status: StatusType) {
    // Use the same method as AlwaysInvis: patch user setting
    const statusSettings = getUserSettingLazy("status", "status");
    if (statusSettings && typeof statusSettings.updateSetting === "function") {
        statusSettings.updateSetting(status);
    }
}

function checkAndUpdateStatus(schedule: StatusScheduleEntry[]) {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
    const entry = schedule.find(e => e.time === currentTime);
    if (entry) setStatus(entry.status);
}

export default definePlugin({
    name: "StatusScheduler",
    description: "Lets you schedule your Discord status to change at set times. Hardcoded for my own use: 10:00 - online, 00:00 - invisible.",
    authors: [{ name: "BenjiThatFoxGuy", id: 263241553072488448n }],
    start() {
        if (intervalId) clearInterval(intervalId!);
        intervalId = setInterval(() => {
            checkAndUpdateStatus(defaultSchedule);
        }, 60 * 1000);
        // Run immediately on start
        checkAndUpdateStatus(defaultSchedule);
    },
    stop() {
        if (intervalId) clearInterval(intervalId!);
        intervalId = undefined;
    }
});
