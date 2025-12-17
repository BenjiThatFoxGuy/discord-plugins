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
const UserProfileStore = findByPropsLazy("getUserProfile");

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

function sanitizeActivitiesDeep<T>(value: T, depth = 4): T {
  if (depth <= 0) return value;
  if (!value || typeof value !== "object") return value;

  // Arrays: sanitize each entry (copy-on-write)
  if (Array.isArray(value)) {
    let changed = false;
    const next = (value as any[]).map((v) => {
      const sv = sanitizeActivitiesDeep(v, depth - 1);
      changed ||= sv !== v;
      return sv;
    });
    return (changed ? next : value) as any as T;
  }

  const obj = value as any;

  // If this looks like a presence/profile node with activities, drop them.
  if (Array.isArray(obj.activities)) {
    if (obj.activities.length === 0) return value;
    return { ...obj, activities: [] } as T;
  }

  // Common alternative key names seen in experiments.
  if (Array.isArray(obj.activity)) {
    return { ...obj, activity: [] } as T;
  }

  // Generic object: walk a small subset of likely keys to avoid heavy cloning.
  const keysToVisit = [
    "presence",
    "userProfile",
    "profile",
    "profileUser",
    "user",
    "member",
    "data",
    "updates",
    "presences",
    "relationships",
  ];

  let changed = false;
  const next: any = { ...obj };
  for (const key of keysToVisit) {
    if (!(key in obj)) continue;
    const before = obj[key];
    const after = sanitizeActivitiesDeep(before, depth - 1);
    if (after !== before) {
      next[key] = after;
      changed = true;
    }
  }

  return (changed ? next : value) as T;
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

  // Keep this tight: only touch presence/activity/profile actions.
  const shouldTouch =
    type.includes("PRESENCE") ||
    type.includes("ACTIVITY") ||
    type.includes("PROFILE") ||
    type.includes("USER_PROFILE");
  if (!shouldTouch) return action;

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

  // Profile payloads can embed activities in deeper objects.
  const deepSanitized = sanitizeActivitiesDeep(next, 4);
  return deepSanitized !== next ? deepSanitized : (changed ? next : action);
}

type DispatchFn = typeof FluxDispatcher.dispatch;
let originalDispatch: DispatchFn | null = null;
let originalGetPresence: ((userId: string) => any) | null = null;
let originalGetUserProfile: ((userId: string) => any) | null = null;

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
      PresenceStore.getPresence = (userId: string) => sanitizeActivitiesDeep(originalGetPresence!(userId), 4);
    }

    // DM user sidebar / flyouts often read from a profile store rather than presence.
    if (UserProfileStore?.getUserProfile && !originalGetUserProfile) {
      originalGetUserProfile = UserProfileStore.getUserProfile.bind(UserProfileStore);
      UserProfileStore.getUserProfile = (userId: string) => sanitizeActivitiesDeep(originalGetUserProfile!(userId), 4);
    }

    // Patch dispatcher so presence updates never populate activities in the first place.
    if (!originalDispatch) {
      originalDispatch = FluxDispatcher.dispatch.bind(FluxDispatcher);
      FluxDispatcher.dispatch = (action: unknown) => originalDispatch!(sanitizePresenceAction(action) as any);
    }
  },

  stop(): void {
    removeStyle();

    if (originalDispatch) {
      FluxDispatcher.dispatch = originalDispatch;
      originalDispatch = null;
    }

    if (originalGetPresence && PresenceStore?.getPresence) {
      PresenceStore.getPresence = originalGetPresence;
      originalGetPresence = null;
    }

    if (originalGetUserProfile && UserProfileStore?.getUserProfile) {
      UserProfileStore.getUserProfile = originalGetUserProfile;
      originalGetUserProfile = null;
    }
  },
});
