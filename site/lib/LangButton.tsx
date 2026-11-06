"use client";
// The RU/EN button of a day page: a link to the same page in the other language that also remembers the choice
// (the home page shows its course list in the language chosen last).
import { LANG_KEY } from "./lang-key";

export default function LangButton({ href, lang, label }: { href: string; lang: "ru" | "en"; label: string }) {
  const remember = () => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
  };
  return (
    <a href={href} className="lang-btn" hrefLang={lang} lang={lang} onClick={remember}>
      {label}
    </a>
  );
}
