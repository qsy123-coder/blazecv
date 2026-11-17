"use client";

import { create } from "zustand";
import type {
  ResumeDoc,
  Section,
  SectionType,
  TemplateId,
  TemplatePreset,
} from "@/lib/types";
import { DEFAULT_SECTION_TITLE } from "@/lib/schema";
import { uid } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface ResumeState {
  doc: ResumeDoc | null;
  past: ResumeDoc[];
  future: ResumeDoc[];
  hydrated: boolean;
  saveState: SaveState;
  storageError: string | null;
  overflowPx: number;
  overflowSection: string | null;
  setOverflow: (value: number, section: string | null) => void;
  setStorageError: (message: string | null) => void;
  hydrate: (doc: ResumeDoc, storageError?: string | null) => void;
  update: (mutator: (draft: ResumeDoc) => void, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  setTemplate: (id: TemplateId) => void;
  setTemplatePreset: (preset: TemplatePreset) => void;
  addSection: (type: SectionType) => void;
  removeSection: (id: string) => void;
  moveSection: (from: number, to: number) => void;
  toggleSection: (id: string) => void;
  addItem: (sectionId: string) => void;
  removeItem: (sectionId: string, itemId: string) => void;
  reset: (doc: ResumeDoc) => void;
  setSaveState: (state: SaveState) => void;
}

let lastKey = "";
let lastAt = 0;
const COALESCE_MS = 1200;
const HISTORY_LIMIT = 50;

function createSection(type: SectionType): Section {
  const base = {
    id: uid("sec"),
    title: DEFAULT_SECTION_TITLE[type],
    visible: true,
  };
  switch (type) {
    case "summary":
      return { ...base, type, content: "" };
    case "education":
      return {
        ...base,
        type,
        items: [
          {
            id: uid("edu"),
            school: "",
            major: "",
            degree: "",
            start: "",
            end: "",
            detail: "",
          },
        ],
      };
    case "experience":
    case "projects":
      return {
        ...base,
        type,
        items: [
          {
            id: uid("exp"),
            org: "",
            role: "",
            start: "",
            end: "",
            location: "",
            bullets: [""],
          },
        ],
      };
    case "skills":
      return {
        ...base,
        type,
        items: [{ id: uid("skill"), name: "", detail: "", level: 3 }],
      };
    case "certificates":
    case "custom":
      return { ...base, type, items: [{ id: uid("text"), text: "" }] };
  }
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  doc: null,
  past: [],
  future: [],
  hydrated: false,
  saveState: "idle",
  storageError: null,
  overflowPx: 0,
  overflowSection: null,

  setOverflow: (value, section) => {
    const state = get();
    if (state.overflowPx === value && state.overflowSection === section) return;
    set({ overflowPx: value, overflowSection: section });
  },

  setStorageError: (message) => {
    if (get().storageError !== message) set({ storageError: message });
  },

  hydrate: (doc, storageError = null) =>
    set({
      doc,
      past: [],
      future: [],
      hydrated: true,
      storageError,
      saveState: "idle",
      overflowPx: 0,
      overflowSection: null,
    }),

  update: (mutator, coalesceKey) => {
    const state = get();
    if (!state.doc) return;
    const prev = state.doc;
    const next = structuredClone(prev);
    mutator(next);
    if (JSON.stringify(prev.basics) !== JSON.stringify(next.basics)) {
      next.basicsEdited = true;
    }
    next.updatedAt = Date.now();
    const now = Date.now();
    const coalesce =
      Boolean(coalesceKey) && coalesceKey === lastKey && now - lastAt < COALESCE_MS;
    set({
      doc: next,
      past: coalesce ? state.past : [...state.past.slice(-(HISTORY_LIMIT - 1)), prev],
      future: coalesce ? state.future : [],
      saveState: "saving",
    });
    lastKey = coalesceKey ?? "";
    lastAt = now;
  },

  undo: () => {
    const { past, future, doc } = get();
    if (!doc || past.length === 0) return;
    const previous = past[past.length - 1];
    lastKey = "";
    set({
      doc: previous,
      past: past.slice(0, -1),
      future: [doc, ...future].slice(0, HISTORY_LIMIT),
      saveState: "saving",
    });
  },

  redo: () => {
    const { past, future, doc } = get();
    if (!doc || future.length === 0) return;
    const next = future[0];
    lastKey = "";
    set({
      doc: next,
      past: [...past.slice(-(HISTORY_LIMIT - 1)), doc],
      future: future.slice(1),
      saveState: "saving",
    });
  },

  setTemplate: (id) => {
    get().update((draft) => {
      draft.templateId = id;
      delete draft.templatePreset;
      draft.theme.fitScale = undefined;
      draft.theme.dense = undefined;
    });
  },

  setTemplatePreset: (preset) => {
    get().update((draft) => {
      draft.templateId = preset.id;
      draft.templatePreset = preset;
      draft.theme.fitScale = undefined;
      draft.theme.dense = undefined;
      if (preset.source?.token) {
        // Captured template: start from the neutral 1:1 baseline.
        draft.theme.lineHeight = 1.2;
        draft.theme.margin = 10;
        draft.theme.fontScale = "md";
      }
    });
  },

  addSection: (type) => {
    get().update((draft) => {
      draft.sections.push(createSection(type));
      draft.orderEdited = true;
    });
  },

  removeSection: (id) => {
    get().update((draft) => {
      draft.sections = draft.sections.filter((s) => s.id !== id);
      draft.orderEdited = true;
    });
  },

  moveSection: (from, to) => {
    get().update((draft) => {
      if (
        from < 0 ||
        to < 0 ||
        from >= draft.sections.length ||
        to >= draft.sections.length ||
        from === to
      ) {
        return;
      }
      const [moved] = draft.sections.splice(from, 1);
      draft.sections.splice(to, 0, moved);
      draft.orderEdited = true;
    });
  },

  toggleSection: (id) => {
    get().update((draft) => {
      const section = draft.sections.find((s) => s.id === id);
      if (section) section.visible = !section.visible;
    });
  },

  addItem: (sectionId) => {
    get().update((draft) => {
      const section = draft.sections.find((s) => s.id === sectionId);
      if (!section || !("items" in section)) return;
      switch (section.type) {
        case "education":
          section.items.push({
            id: uid("edu"),
            school: "",
            major: "",
            degree: "",
            start: "",
            end: "",
            detail: "",
          });
          break;
        case "experience":
        case "projects":
          section.items.push({
            id: uid("exp"),
            org: "",
            role: "",
            start: "",
            end: "",
            location: "",
            bullets: [""],
          });
          break;
        case "skills":
          section.items.push({ id: uid("skill"), name: "", detail: "", level: 3 });
          break;
        case "certificates":
        case "custom":
          section.items.push({ id: uid("text"), text: "" });
          break;
      }
    });
  },

  removeItem: (sectionId, itemId) => {
    get().update((draft) => {
      const section = draft.sections.find((s) => s.id === sectionId);
      if (!section || !("items" in section)) return;
      (section as { items: Array<{ id: string }> }).items = (
        section as { items: Array<{ id: string }> }
      ).items.filter((item) => item.id !== itemId);
    });
  },

  reset: (doc) => {
    lastKey = "";
    set({
      doc,
      past: [],
      future: [],
      hydrated: true,
      saveState: "saving",
      overflowPx: 0,
      overflowSection: null,
    });
  },

  setSaveState: (state) => set({ saveState: state }),
}));

export function findSection(doc: ResumeDoc, id: string): Section | undefined {
  return doc.sections.find((s) => s.id === id);
}
