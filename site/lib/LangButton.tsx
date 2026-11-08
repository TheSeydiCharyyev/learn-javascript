"use client";
// The RU/EN button of a day page: a link to the same page in the other language that also remembers the choice
// (the home page shows its course list in the language chosen last). A <Link>: the other language comes without a
// reload, <html lang> and the title change with the page.
import Link from "next/link";
import { LANG_KEY } from "./lang-key";
import { route } from "./route";

export default function LangButton({ href, lang, label }: { href: string; lang: "ru" | "en"; label: string }) {
  const remember = () => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {}
  };
  return (
    <Link href={route(href)} className="lang-btn" hrefLang={lang} lang={lang} onClick={remember}>
      {label}
    </Link>
  );
}
