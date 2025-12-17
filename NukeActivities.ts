/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

import { findByPropsLazy } from "@webpack";
import { ComponentDispatch, FluxDispatcher } from "@webpack/common";

// Lazily resolved; will be available once Discord's modules are loaded.
const PresenceStore = findByPropsLazy("getPresence");

const STYLE_ID = "vc-nuke-activities";

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

    /* Optional UX hard-disable: if the sidebars still get opened, hide them entirely */
    aside[aria-label="Members"],
    aside[aria-label="User Profile"],
    aside[aria-label="Profile"],
    aside[aria-label="User profile"] {
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

function shouldBlockSidebarToggle(actionType: string): boolean {
  // Keep this narrow: only block the obvious member list / user profile toggles.
  // Avoid matching generic "SIDEBAR" actions (thread sidebar, search, etc.).
  return /(\b|_)(MEMBERS?_?LIST|MEMBERS?_SECTION)(\b|_)/i.test(actionType)
    || /(\b|_)(CHANNEL_)?TOGGLE_MEMBERS_SECTION(\b|_)/i.test(actionType)
    || /(\b|_)(USER_?PROFILE|PROFILE_?PANEL)(\b|_)/i.test(actionType);
}

function shouldBlockComponentDispatch(eventName: unknown): boolean {
  if (typeof eventName !== "string") return false;
  return shouldBlockSidebarToggle(eventName);
}

type DispatchFn = typeof FluxDispatcher.dispatch;
let originalDispatch: DispatchFn | null = null;
let originalGetPresence: ((userId: string) => any) | null = null;

type ComponentDispatchFn = typeof ComponentDispatch.dispatchToLastSubscribed;
let originalComponentDispatchToLast: ComponentDispatchFn | null = null;
let originalComponentDispatchDispatch: ((...args: any[]) => any) | null = null;

let enforceInterval: number | null = null;
let enforceUntil = 0;

function dispatchRaw(action: any): void {
  // Use the unpatched dispatcher if we have it, so we can dispatch
  // "close" actions even though we block user toggles.
  (originalDispatch ?? FluxDispatcher.dispatch).call(FluxDispatcher, action);
}

function isMembersSidebarOpen(): boolean {
  return !!document.querySelector('aside[aria-label="Members"]');
}

function enforceMembersSidebarHidden(): void {
  if (isMembersSidebarOpen()) {
    dispatchRaw({ type: "CHANNEL_TOGGLE_MEMBERS_SECTION" });
  }
}

function startEnforcingHidden(durationMs = 2000): void {
  enforceUntil = Math.max(enforceUntil, Date.now() + durationMs);

  if (enforceInterval != null) return;

  enforceInterval = window.setInterval(() => {
    if (Date.now() > enforceUntil) {
      if (enforceInterval != null) {
        clearInterval(enforceInterval);
        enforceInterval = null;
      }
      return;
    }

    enforceMembersSidebarHidden();
  }, 200);
}

export default definePlugin({
  name: "NukeActivities",
  description: "Removes user activities (Playing/Streaming/etc.) everywhere by sanitizing presence data client-side.",
  authors: [
    { name: "Benji", id: 263241553072488448n },
    { name: "Pegashis", id: 244875811272916993n },
  ],

  start(): void {
    ensureStyle();

    // Patch store getter so any UI reading presence gets a sanitized copy.
    if (PresenceStore?.getPresence && !originalGetPresence) {
      originalGetPresence = PresenceStore.getPresence.bind(PresenceStore);
      PresenceStore.getPresence = (userId: string) => sanitizePresenceLike(originalGetPresence!(userId));
    }

    // Patch dispatcher so presence updates never populate activities in the first place.
    if (!originalDispatch) {
      originalDispatch = FluxDispatcher.dispatch.bind(FluxDispatcher);
      FluxDispatcher.dispatch = (action: unknown) => {
        const type = String((action as any)?.type ?? "");
        if (type && shouldBlockSidebarToggle(type)) return;
        return originalDispatch!(sanitizePresenceAction(action) as any);
      };
    }

    // Force-close (and keep closing briefly) in case the sidebar was already open
    // or gets opened by other code shortly after channel navigation.
    enforceMembersSidebarHidden();
    startEnforcingHidden(3000);

    // Re-run enforcement on channel switches.
    FluxDispatcher.subscribe("CHANNEL_SELECT", startEnforcingHidden);

    // Many header bar buttons dispatch via ComponentDispatch rather than Flux actions.
    if (ComponentDispatch?.dispatchToLastSubscribed && !originalComponentDispatchToLast) {
      originalComponentDispatchToLast = ComponentDispatch.dispatchToLastSubscribed.bind(ComponentDispatch);
      ComponentDispatch.dispatchToLastSubscribed = (...args: any[]) => {
        if (shouldBlockComponentDispatch(args[0])) return;
        return originalComponentDispatchToLast!(...args);
      };
    }

    if (ComponentDispatch?.dispatch && !originalComponentDispatchDispatch) {
      originalComponentDispatchDispatch = ComponentDispatch.dispatch.bind(ComponentDispatch);
      ComponentDispatch.dispatch = (...args: any[]) => {
        if (shouldBlockComponentDispatch(args[0])) return;
        return originalComponentDispatchDispatch!(...args);
      };
    }
  },

  stop(): void {
    removeStyle();

    FluxDispatcher.unsubscribe("CHANNEL_SELECT", startEnforcingHidden);

    if (enforceInterval != null) {
      clearInterval(enforceInterval);
      enforceInterval = null;
    }
    enforceUntil = 0;

    if (originalDispatch) {
      FluxDispatcher.dispatch = originalDispatch;
      originalDispatch = null;
    }

    if (originalComponentDispatchToLast && ComponentDispatch?.dispatchToLastSubscribed) {
      ComponentDispatch.dispatchToLastSubscribed = originalComponentDispatchToLast;
      originalComponentDispatchToLast = null;
    }

    if (originalComponentDispatchDispatch && ComponentDispatch?.dispatch) {
      ComponentDispatch.dispatch = originalComponentDispatchDispatch;
      originalComponentDispatchDispatch = null;
    }

    if (originalGetPresence && PresenceStore?.getPresence) {
      PresenceStore.getPresence = originalGetPresence;
      originalGetPresence = null;
    }
  },
});
