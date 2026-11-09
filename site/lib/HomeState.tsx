"use client";
// The home page's state (stage 3 of the move, 09.11.2026): the language it is shown in and whether the menu is open on
// a phone — what js/lang.js and the inline script of index.html did with classes, kept as React state. The markup is
// the same: an element of one language has data-lang, an element of one list data-list ("en" in English, "ru" in the
// other three), and the hidden ones class lang-hidden; the language buttons are .lang-opt with .active and
// aria-pressed; the menu and its overlay get .open.
//
// The language is chosen before React starts, by a small script at the end of the page (HOME_LANG_SCRIPT,
// lib/home-lang.ts), as lang.js did when the page was parsed — so that a reader who chose EN does not see the page in
// Russian first. React then takes the language from localStorage too; the elements it changes say
// suppressHydrationWarning (the server drew them in Russian).
import { createContext, useContext, useEffect, useState, type ElementType, type ReactNode } from "react";
import { LANG_KEY } from "./lang-key";
import { HOME_LANGS } from "./home-lang";

const shownOf = (lang: string) => (HOME_LANGS.includes(lang) ? lang : "ru");
const listOf = (shown: string) => (shown === "en" ? "en" : "ru");

type State = { shown: string; choose: (lang: string) => void; menu: boolean; toggleMenu: () => void };
const HomeContext = createContext<State>({ shown: "ru", choose: () => {}, menu: false, toggleMenu: () => {} });

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ") || undefined;

export function HomeState({ titles, children }: { titles: { ru: string; en: string }; children: ReactNode }) {
  const [lang, setLang] = useState("ru");
  const [menu, setMenu] = useState(false);
  const shown = shownOf(lang);
  useEffect(() => {
    // as lang.js: the saved language, Russian if none — and it is saved back
    const saved = localStorage.getItem(LANG_KEY) || "ru";
    setLang(saved);
    localStorage.setItem(LANG_KEY, saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = shown;
  }, [shown]);
  const choose = (next: string) => {
    setLang(next);
    localStorage.setItem(LANG_KEY, next);
  };
  // The title is React's (it puts a <title> into <head>), not Next's metadata: Next set the metadata title after this
  // component had set the English one (09.11.2026, compare-site: EN saved, the title stayed Russian).
  return (
    <HomeContext.Provider value={{ shown, choose, menu, toggleMenu: () => setMenu((open) => !open) }}>
      <title>{shown === "en" ? titles.en : titles.ru}</title>
      {children}
    </HomeContext.Provider>
  );
}

type Shown = { as?: ElementType; className?: string; children: ReactNode };

// An element of one language (the menu's heading).
export function ForLang({ as: Tag = "span", lang, className, children }: Shown & { lang: string }) {
  const { shown } = useContext(HomeContext);
  return <Tag data-lang={lang} className={classes(className, shown !== lang && "lang-hidden")} suppressHydrationWarning>{children}</Tag>;
}

// An element of one list: the English one in English, the Russian one otherwise.
export function ForList({ as: Tag = "div", list, className, children }: Shown & { list: "ru" | "en" }) {
  const { shown } = useContext(HomeContext);
  return <Tag data-list={list} className={classes(className, list !== listOf(shown) && "lang-hidden")} suppressHydrationWarning>{children}</Tag>;
}

export function LangOpt({ lang, label }: { lang: string; label: string }) {
  const { shown, choose } = useContext(HomeContext);
  const active = shown === lang;
  return (
    <button type="button" className={classes("lang-opt", active && "active")} data-set-lang={lang} aria-pressed={active ? "true" : "false"} onClick={() => choose(lang)} suppressHydrationWarning>
      {label}
    </button>
  );
}

export function MenuButton({ label, children }: { label: string; children: ReactNode }) {
  const { toggleMenu } = useContext(HomeContext);
  return <button className="sidebar-toggle" onClick={toggleMenu} aria-label={label}>{children}</button>;
}

export function Overlay() {
  const { menu, toggleMenu } = useContext(HomeContext);
  return <div className={classes("sidebar-overlay", menu && "open")} id="overlay" onClick={toggleMenu} />;
}

export function Sidebar({ children }: { children: ReactNode }) {
  const { menu } = useContext(HomeContext);
  return <aside className={classes("sidebar", menu && "open")} id="sidebar">{children}</aside>;
}
