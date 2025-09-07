/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";

// FFmpeg removed; no related state is kept now.

export const cl = classNameFactory("vc-more-stickers-");
export const clPicker = (className: string, ...args: any[]) => cl("picker-" + className, ...args);

export class Mutex {
    current = Promise.resolve();
    lock() {
        let _resolve: () => void;
        const p = new Promise(resolve => {
            _resolve = () => resolve();
        }) as Promise<void>;
        // Caller gets a promise that resolves when the current outstanding
        // lock resolves
        const rv = this.current.then(() => _resolve);
        // Don't allow the next request until the new promise is done
        this.current = p;
        // Return the new promise
        return rv;
    }
}

// FFmpeg loader removed.
