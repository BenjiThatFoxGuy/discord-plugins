/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

import { findByPropsLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

// Lazily resolved; will be available once Discord's modules are loaded.
const PresenceStore = findByPropsLazy("getPresence");

const STYLE_ID = "vc-nuke-activities";

const CHANNEL_SECTION_STORAGE_KEYS = ["ChannelSectionStore2"] as const;

function sanitizeChannelSectionStoreString(raw: string | null): string | null {
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw) as any;
    const state = parsed?._state;
    if (!state || typeof state !== "object") return raw;

    // Force these to be disabled.
    const nextState = {
      ...state,
      isMembersOpen: false,
      isProfileOpen: false,
    };

    // Only rewrite if something actually changes.
    if (state.isMembersOpen === nextState.isMembersOpen && state.isProfileOpen === nextState.isProfileOpen) {
      console.log("[NukeActivities] ChannelSection already clean:", { isMembersOpen: state.isMembersOpen, isProfileOpen: state.isProfileOpen });
      return raw;
    }

    console.log("[NukeActivities] Sanitizing ChannelSection:", { 
      before: { isMembersOpen: state.isMembersOpen, isProfileOpen: state.isProfileOpen },
      after: { isMembersOpen: false, isProfileOpen: false }
    });

    return JSON.stringify({
      ...parsed,
      _state: nextState,
    });
  } catch (e) {
    console.error("[NukeActivities] Failed to sanitize ChannelSection:", e);
    return raw;
  }
}

function enforceChannelSectionStore(): void {
  console.log("[NukeActivities] Enforcing ChannelSection store...");
  for (const key of CHANNEL_SECTION_STORAGE_KEYS) {
    const current = localStorage.getItem(key);
    console.log(`[NukeActivities] Current ${key}:`, current);
    const sanitized = sanitizeChannelSectionStoreString(current);
    if (sanitized && sanitized !== current) {
      console.log(`[NukeActivities] Writing sanitized ${key} to localStorage`);
      localStorage.setItem(key, sanitized);
    }
  }
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  // CSS fallback: If any activity badges/pills slip through, hide them by accessible label.
  // This is intentionally narrow to avoid breaking Settings UI.
  style.textContent = `
    [aria-label^="Playing "] ,
    [aria-label^="Streaming "] ,
    [aria-label^="Listening to "] ,
    [aria-label^="Watching "] ,
    [aria-label^="Competing "] {
      display: none !important;
    }
  `;

  (document.head ?? document.documentElement).appendChild(style);
}

function removeStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function sanitizePresenceLike<T extends Record<string, any> | null | undefined>(presence: T): T {
  if (!presence || typeof presence !== "object") return presence;
  if (Array.isArray((presence as any).activities)) {
    // Return a shallow copy to avoid mutating store state.
    return { ...(presence as any), activities: [] } as T;
  }
  return presence;
}

function sanitizePresenceUpdateEntry<T>(entry: T): T {
  if (!entry || typeof entry !== "object") return entry;
  const obj = entry as any;

  if (Array.isArray(obj.activities)) {
    if (obj.activities.length === 0) return entry;
    return { ...obj, activities: [] } as T;
  }

  // Some shapes use a nested presence.
  if (obj.presence && typeof obj.presence === "object") {
    const sanitized = sanitizePresenceLike(obj.presence);
    if (sanitized !== obj.presence) return { ...obj, presence: sanitized } as T;
  }

  return entry;
}

function sanitizePresenceAction(action: unknown): unknown {
  if (!action || typeof action !== "object") return action;
  const act = action as any;
  const type = String(act.type ?? "");

  // Keep this tight: we only touch presence/activity actions.
  if (!type.includes("PRESENCE") && !type.includes("ACTIVITY")) return action;

  let changed = false;
  const next: any = { ...act };

  if (Array.isArray(act.updates)) {
    const updates = act.updates.map(sanitizePresenceUpdateEntry);
    if (updates !== act.updates) {
      next.updates = updates;
      changed = true;
    }
  }

  if (Array.isArray(act.presences)) {
    const presences = act.presences.map(sanitizePresenceUpdateEntry);
    if (presences !== act.presences) {
      next.presences = presences;
      changed = true;
    }
  }

  if (act.presence && typeof act.presence === "object") {
    const sanitized = sanitizePresenceLike(act.presence);
    if (sanitized !== act.presence) {
      next.presence = sanitized;
      changed = true;
    }
  }

  return changed ? next : action;
}

type DispatchFn = typeof FluxDispatcher.dispatch;
let originalDispatch: DispatchFn | null = null;
let originalGetPresence: ((userId: string) => any) | null = null;

let originalStorageSetItem: Storage["setItem"] | null = null;
let originalStorageGetItem: Storage["getItem"] | null = null;
let originalPushState: History["pushState"] | null = null;
let originalReplaceState: History["replaceState"] | null = null;

function onNavigation(): void {
  console.log("[NukeActivities] Navigation detected, enforcing in 0ms...");
  // Defer to allow Discord to update its state first, then clamp it.
  setTimeout(() => {
    try {
      enforceChannelSectionStore();
    } catch (e) {
      console.error("[NukeActivities] Error in onNavigation:", e);
    }
  }, 0);
}

export default definePlugin({
  name: "NukeActivities",
  description: "Removes user activities (Playing/Streaming/etc.) everywhere by sanitizing presence data client-side.",
  authors: [
    { name: "Benji", id: 263241553072488448n },
    { name: "Pegashis", id: 244875811272916993n },
  ],

  start(): void {
    console.log("[NukeActivities] Plugin starting...");
    ensureStyle();

    // Clamp any existing stored UI state immediately.
    enforceChannelSectionStore();

    // Intercept localStorage reads/writes for the specific key and force toggles off.
    if (!originalStorageSetItem) {
      originalStorageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string): void {
        if ((CHANNEL_SECTION_STORAGE_KEYS as readonly string[]).includes(key)) {
          console.log(`[NukeActivities] Intercepting setItem(${key})`, value);
          const sanitized = sanitizeChannelSectionStoreString(value);
          console.log(`[NukeActivities] Sanitized result:`, sanitized);
          return originalStorageSetItem!.call(this, key, sanitized ?? value);
        }
        return originalStorageSetItem!.call(this, key, value);
      };
    }

    if (!originalStorageGetItem) {
      originalStorageGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string): string | null {
        const value = originalStorageGetItem!.call(this, key);
        if ((CHANNEL_SECTION_STORAGE_KEYS as readonly string[]).includes(key)) {
          console.log(`[NukeActivities] Intercepting getItem(${key})`, value);
          const sanitized = sanitizeChannelSectionStoreString(value);
          console.log(`[NukeActivities] Returning sanitized:`, sanitized);
          return sanitized;
        }
        return value;
      };
    }

    // Re-apply on navigation (Discord uses history API heavily).
    if (!originalPushState) {
      originalPushState = history.pushState;
      history.pushState = function (...args: Parameters<History["pushState"]>): void {
        originalPushState!.apply(this, args);
        onNavigation();
      };
    }
    if (!originalReplaceState) {
      originalReplaceState = history.replaceState;
      history.replaceState = function (...args: Parameters<History["replaceState"]>): void {
        originalReplaceState!.apply(this, args);
        onNavigation();
      };
    }
    window.addEventListener("popstate", onNavigation);

    // Patch store getter so any UI reading presence gets a sanitized copy.
    if (PresenceStore?.getPresence && !originalGetPresence) {
      originalGetPresence = PresenceStore.getPresence.bind(PresenceStore);
      PresenceStore.getPresence = (userId: string) => sanitizePresenceLike(originalGetPresence!(userId));
    }

    // Patch dispatcher so presence updates never populate activities in the first place.
    if (!originalDispatch) {
      originalDispatch = FluxDispatcher.dispatch.bind(FluxDispatcher);
      FluxDispatcher.dispatch = (action: unknown) => originalDispatch!(sanitizePresenceAction(action) as any);
    }
  },

  stop(): void {
    removeStyle();

    window.removeEventListener("popstate", onNavigation);
    if (originalPushState) {
      history.pushState = originalPushState;
      originalPushState = null;
    }
    if (originalReplaceState) {
      history.replaceState = originalReplaceState;
      originalReplaceState = null;
    }

    if (originalStorageSetItem) {
      Storage.prototype.setItem = originalStorageSetItem;
      originalStorageSetItem = null;
    }
    if (originalStorageGetItem) {
      Storage.prototype.getItem = originalStorageGetItem;
      originalStorageGetItem = null;
    }

    if (originalDispatch) {
      FluxDispatcher.dispatch = originalDispatch;
      originalDispatch = null;
    }

    if (originalGetPresence && PresenceStore?.getPresence) {
      PresenceStore.getPresence = originalGetPresence;
      originalGetPresence = null;
    }
  },
});
