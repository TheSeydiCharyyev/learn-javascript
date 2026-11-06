// The navigation bar of a day page, as data. It follows from where the page lies: the course folder, the day, which
// of lecture/student/tasks it is, Russian or en/, and whether the other language exists. While the HTML pages are the
// source (until stage 2 of the move to MDX), the build checks that this model gives exactly the bar written in the
// file (navInnerHtml), so <LessonNav> draws the same bar as the page did.
import fs from "node:fs";
import path from "node:path";
import { LANG_KEY } from "./lang-key";

export type NavItem = { file: "lecture.html" | "student.html" | "tasks.html"; label: string; active: boolean };
export type NavModel = {
  home: { href: string; label: string };
  title: string;
  items: NavItem[];
  switchTo: { href: string; lang: "ru" | "en"; label: string } | null;
};

const COURSE_NAMES: Record<string, string> = {
  essentials: "Essentials",
  intermediate: "Intermediate",
  advanced: "Advanced",
  "web-apis": "Web APIs",
};

// Labels as the HTML pages write them (character references included); decodeRefs turns them into text.
const WORDS = {
  ru: { home: "&#8592; Курс", day: "день", lecture: "Лекция", student: "Конспект", tasks: "Задания" },
  en: { home: "&#8592; Course", day: "day", lecture: "Lecture", student: "Notes", tasks: "Tasks" },
};
const EMOJI = { lecture: "&#x1F468;&#x200D;&#x1F3EB;", student: "&#x1F468;&#x200D;&#x1F393;", tasks: "&#x1F4CB;" };
// Day 15 of Essentials is a theory day: its first page is called so.
const LECTURE_NAME: Record<string, { ru: string; en: string }> = {
  "essentials/day-15": { ru: "Теория", en: "Theory" },
};

export function navModel(rel: string, repo: string): NavModel | null {
  const m = /^([a-z-]+)\/(day-(\d+))\/(en\/)?(lecture|student|tasks)\.html$/.exec(rel);
  if (!m || !COURSE_NAMES[m[1]]) return null;
  const [, course, dayDir, dayNo, en, kind] = m;
  const lang = en ? "en" : "ru";
  const w = WORDS[lang];
  const lectureWord = LECTURE_NAME[`${course}/${dayDir}`]?.[lang] ?? w.lecture;
  const items: NavItem[] = (["lecture", "student", "tasks"] as const).map((k) => ({
    file: `${k}.html`,
    label: `${EMOJI[k]} ${k === "lecture" ? lectureWord : w[k]}`,
    active: k === kind,
  }));
  const other = en ? `${course}/${dayDir}/${kind}.html` : `${course}/${dayDir}/en/${kind}.html`;
  const switchTo = fs.existsSync(path.join(repo, other))
    ? en
      ? { href: `../${kind}.html`, lang: "ru" as const, label: "RU" }
      : { href: `en/${kind}.html`, lang: "en" as const, label: "EN" }
    : null;
  return {
    home: { href: en ? "../../../index.html" : "../../index.html", label: w.home },
    title: `${COURSE_NAMES[course]}, ${w.day} ${Number(dayNo)}`,
    items,
    switchTo,
  };
}

// The inside of <div class="lesson-nav"> exactly as the HTML pages write it.
export function navInnerHtml(n: NavModel): string {
  const lines = [
    `<a href="${n.home.href}" class="nav-home">${n.home.label}</a>`,
    `<span class="nav-sep">|</span>`,
    `<span class="nav-title">${n.title}</span>`,
    `<span class="nav-sep">|</span>`,
    ...n.items.map((i) => (i.active ? `<span class="nav-active">${i.label}</span>` : `<a href="${i.file}" class="nav-link">${i.label}</a>`)),
  ];
  if (n.switchTo) {
    const s = n.switchTo;
    lines.push(`<a href="${s.href}" class="lang-btn" hreflang="${s.lang}" lang="${s.lang}" onclick="try { localStorage.setItem('${LANG_KEY}', '${s.lang}'); } catch (e) {}">${s.label}</a>`);
  }
  return lines.map((l) => `\n    ${l}`).join("") + "\n";
}

// "&#8592; Курс" -> "← Курс": the numeric character references the labels use.
export function decodeRefs(s: string): string {
  return s.replace(/&#x([0-9a-f]+);|&#(\d+);/gi, (_, hex, dec) => String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec)));
}
