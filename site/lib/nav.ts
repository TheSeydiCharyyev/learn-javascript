// The navigation bar of a day page, as data. It follows from where the page lies: the course folder, the day, which
// of lecture/student/tasks it is, Russian or en/, and whether the other language exists. (While the HTML pages were
// the source, the build checked that this model gave exactly the bar written in each file; they went at stage 4 of
// the move to Next.js, 11.11.2026, and the check with them.)
import fs from "node:fs";
import path from "node:path";

// exists: whether the page is written (day 21 of Advanced has only its lecture yet) — the bar links it either way.
export type NavItem = { file: "lecture.html" | "student.html" | "tasks.html"; label: string; active: boolean; exists: boolean };
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

// Labels as the HTML pages wrote them (character references included); decodeRefs turns them into text.
const WORDS = {
  ru: { home: "&#8592; Курс", day: "день", lecture: "Лекция", student: "Конспект", tasks: "Задания" },
  en: { home: "&#8592; Course", day: "day", lecture: "Lecture", student: "Notes", tasks: "Tasks" },
};
const EMOJI = { lecture: "&#x1F468;&#x200D;&#x1F3EB;", student: "&#x1F468;&#x200D;&#x1F393;", tasks: "&#x1F4CB;" };
// Day 15 of Essentials is a theory day: its first page is called so.
const LECTURE_NAME: Record<string, { ru: string; en: string }> = {
  "essentials/day-15": { ru: "Теория", en: "Theory" },
};

// A page exists when its MDX file does (rel is the page's .html path — its address). Also used by the home page
// (lib/home-lists.ts).
export const pageExists = (repo: string, rel: string) => fs.existsSync(path.join(repo, rel.replace(/\.html$/, ".mdx")));

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
    exists: pageExists(repo, `${course}/${dayDir}/${en ?? ""}${k}.html`),
  }));
  const other = en ? `${course}/${dayDir}/${kind}.html` : `${course}/${dayDir}/en/${kind}.html`;
  const switchTo = pageExists(repo, other)
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

// "&#8592; Курс" -> "← Курс": the numeric character references the labels use.
export function decodeRefs(s: string): string {
  return s.replace(/&#x([0-9a-f]+);|&#(\d+);/gi, (_, hex, dec) => String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec)));
}
