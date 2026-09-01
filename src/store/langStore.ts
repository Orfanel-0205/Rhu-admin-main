import { create } from "zustand";

export type Lang = "en" | "tag" | "pag";

type LangState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
};

const STORAGE_KEY = "ka_agapay_admin_lang";

function getInitialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved === "en" || saved === "tag" || saved === "pag") {
    return saved;
  }

  return "en";
}

export const useLangStore = create<LangState>((set) => ({
  lang: getInitialLang(),
  setLang: (lang) => {
    localStorage.setItem(STORAGE_KEY, lang);
    set({ lang });
  },
}));