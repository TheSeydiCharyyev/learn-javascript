// The home page (stage 3 of the move, 09.11.2026), drawn from the plans (lib/home-lists.ts) with the markup of index.html:
// the header with the language buttons, the menu (the days of every course), the hero with the course cards, and the
// module cards of every course; the lists twice, in Russian and in English. Its CSS is css/home.css (lib/source.ts
// puts it before the page); the language and the menu are kept by lib/HomeState.tsx.
// The links to the days are <Link>s to their routes (step 3.2, 09.11.2026): a day opens without a reload. They are
// not prefetched: the page has hundreds of them, and every one in view would be fetched as the page opens — the day
// comes when its link is clicked.
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { route } from "./route";
import { homeLists, HOME_TITLE, type HomeDay, type HomeList } from "./home-lists";
import { HOME_LANG_SCRIPT } from "./home-lang";
import { ForLang, ForList, HomeState, LangOpt, MenuButton, Overlay, Sidebar } from "./HomeState";

const SCROLL = "\u{1F4DC}"; // the course's sign, in the header and the hero
const PAGE_ICONS = { lecture: "\u{1F468}‍\u{1F3EB}", student: "\u{1F468}‍\u{1F393}", tasks: "\u{1F4CB}" };
const gradient = (colour: string) => ({ background: `linear-gradient(135deg, ${colour})` });

// a day's title; in the English list a day without en/ pages is marked RU
const dayTitle = (d: HomeDay, before = "") =>
  d.ruNote ? <>{`${before}${d.title} `}<span className="lang-note">RU</span></> : `${before}${d.title}`;

const menu = (l: HomeList) =>
  l.courses.map((c) => (
    <Fragment key={c.no}>
      <div className="sidebar-course">{`${c.label} · ${c.name}`}</div>
      {c.groups.map((g, i) => (
        <div className="sidebar-group" key={i}>
          <div className="sidebar-group-title">{`${g.icon} ${g.name}`}</div>
          {g.days.map((d) =>
            d.at ? (
              <Link key={d.day} href={route(`${d.at}/lecture.html`)} className="sidebar-link" prefetch={false}><span className="sidebar-num">{d.day}</span>{dayTitle(d, " ")}</Link>
            ) : (
              <span key={d.day} className="sidebar-link sidebar-soon"><span className="sidebar-num">{d.day}</span>{dayTitle(d, " ")}</span>
            ),
          )}
        </div>
      ))}
    </Fragment>
  ));

const cards = (l: HomeList) => (
  <div className="course-cards">
    {l.courses.map((c) => (
      <a key={c.no} className="course-card" href={`#${c.anchor}`}>
        <div className="course-card-label">{c.label}</div>
        <div className="course-card-name">{c.name}</div>
        <div className="course-card-about">{c.about}</div>
        <div className="course-card-status">{c.status}</div>
      </a>
    ))}
  </div>
);

const modules = (l: HomeList) =>
  l.courses.map((c) => (
    <Fragment key={c.no}>
      <div className="course-head" id={c.anchor}>
        <div className="course-label">{c.label}</div>
        <h2 className="course-title">{c.name}</h2>
        <p className="course-about">{c.about}</p>
      </div>
      {c.groups.map((g, i) => (
        <div className="module" key={i}>
          <div className="module-header">
            <div className="module-icon" style={gradient(g.colour)}>{g.icon}</div>
            <div>
              <div className="module-title">{g.name}</div>
              <div className="module-count">{g.count}</div>
            </div>
          </div>
          <div className="card-grid">
            {g.days.map((d) => (
              <div key={d.day} className={d.at ? "lesson-card" : "lesson-card lesson-card-soon"}>
                <div className="card-number" style={gradient(g.colour)}>{String(d.day).padStart(2, "0")}</div>
                <div className="card-title">{dayTitle(d)}</div>
                {d.at ? (
                  <div className="card-links">
                    {(["lecture", "student", "tasks"] as const).map((p) => (
                      <Link key={p} href={route(`${d.at}/${p}.html`)} className={`card-link ${p}`} prefetch={false}>{`${PAGE_ICONS[p]} ${l.words[p]}`}</Link>
                    ))}
                  </div>
                ) : (
                  <div className="card-soon">{l.words.soon}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </Fragment>
  ));

export default async function Home() {
  const lists = await homeLists();
  // a part of the page in both lists: the Russian one, then the English one
  const both = (part: (l: HomeList) => ReactNode) => (
    <>
      <ForList list="ru">{part(lists.ru)}</ForList>
      <ForList list="en">{part(lists.en)}</ForList>
    </>
  );
  return (
    <HomeState titles={HOME_TITLE}>
      <header className="header">
        <MenuButton label="Меню">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </MenuButton>
        <a href="index.html" className="header-logo">{`${SCROLL} `}<span>Learn JavaScript</span></a>
        <ForList list="ru" className="header-info">{"по 36 занятий • 12 недель"}</ForList>
        <ForList list="en" className="header-info">{"36 lessons each • 12 weeks"}</ForList>
        <div className="lang-switch" role="group" aria-label="Language">
          <LangOpt lang="ru" label="RU" />
          <LangOpt lang="en" label="EN" />
          <LangOpt lang="tk" label="TM" />
          <LangOpt lang="tr" label="TR" />
        </div>
      </header>

      <Overlay />

      <Sidebar>
        <div className="sidebar-header">
          <ForLang lang="ru">Навигация</ForLang>
          <ForLang lang="en">Navigation</ForLang>
          <ForLang lang="tk">Nawigasiýa</ForLang>
          <ForLang lang="tr">Gezinme</ForLang>
          <ForList as="span" list="ru" className="sidebar-badge">3 курса</ForList>
          <ForList as="span" list="en" className="sidebar-badge">3 courses</ForList>
        </div>
        {both(menu)}
      </Sidebar>

      <div className="main">
        <div className="hero">
          <div className="hero-title">
            <span className="icon">{SCROLL}</span>
            <h1>Learn JavaScript</h1>
          </div>
          <ForList as="p" list="ru" className="hero-sub">Курсы по JavaScript на основе MDN: от первой программы до того, как устроен язык. В каждом курсе <b>36 занятий</b>.</ForList>
          <ForList as="p" list="en" className="hero-sub">JavaScript courses based on MDN: from the first program to how the language works. Each course has <b>36 lessons</b>.</ForList>
          {both(cards)}
        </div>
        {both(modules)}
      </div>

      <script dangerouslySetInnerHTML={{ __html: HOME_LANG_SCRIPT }} />
    </HomeState>
  );
}
