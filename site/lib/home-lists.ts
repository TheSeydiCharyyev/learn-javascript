// The home page's lists, made at build time from the plans in tools/ (stage 3 of the move, 09.11.2026): the course
// cards, the menu and the module cards, once in Russian and once in English — what tools/build-index.mjs wrote into
// index.html (removed 11.11.2026), from the plans: plan-days.mjs, plan-modules.mjs, plan-en.mjs, home-data.mjs. A day is ready when
// its three pages are written (HTML or MDX); the English list links to a day's en/ pages when it has them, otherwise
// to the Russian ones, its title marked RU.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO } from "./source";
import { pageExists } from "./nav";

export type ListLang = "ru" | "en";

// The page's title; the English one while the page is shown in English (TM and TR show the Russian one).
export const HOME_TITLE = { ru: "Learn JavaScript — курсы по JavaScript", en: "Learn JavaScript — JavaScript courses" };

export type HomeDay = { day: number; title: string; ruNote: boolean; at: string | null }; // at: the pages' folder; null — not ready
export type HomeGroup = { name: string; icon: string; colour: string; count: string; days: HomeDay[] };
export type HomeCourse = { no: number; name: string; anchor: string; label: string; about: string; status: string; groups: HomeGroup[] };
export type HomeList = { courses: HomeCourse[]; words: { lecture: string; student: string; tasks: string; soon: string } };

// The tools' modules are plain Node ESM outside site/: imported as they are when the page is built.
const tool = (file: string) => import(/* turbopackIgnore: true */ pathToFileURL(path.join(REPO, "tools", file)).href);

// home-data.mjs is written as HTML (index.html takes it as is): its entities as text.
const NAMED: Record<string, string> = { bull: "•", middot: "·", ndash: "–", amp: "&", lt: "<", gt: ">", quot: '"' };
const text = (html: string) => {
  const out = html.replace(/&(#x[\dA-Fa-f]+|#\d+|\w+);/g, (ref, body: string) => {
    if (body[0] === "#") return String.fromCodePoint(body[1] === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1)));
    if (!(body in NAMED)) throw new Error(`tools/home-data.mjs: ${ref} — add it to NAMED in site/lib/home-lists.ts`);
    return NAMED[body];
  });
  if (/[<>]/.test(out)) throw new Error(`tools/home-data.mjs: markup in "${html}" — the home page takes its words as text`);
  return out;
};

type Course = { no: number; dir: string; name: string; about: Record<ListLang, string> };
type Words = { projects: string; lecture: string; student: string; tasks: string; soon: string; days: string; day: string; courseNo: string; course: (c: Course) => string; status: (n: number, all: number) => string };

let model: Promise<Record<ListLang, HomeList>> | null = null;

export function homeLists(): Promise<Record<ListLang, HomeList>> {
  model ??= build();
  return model;
}

async function build(): Promise<Record<ListLang, HomeList>> {
  const [{ PLAN }, { MODULES }, { DAY_TITLES_EN, MODULE_NAMES_EN }, { COURSES, LOOK, TEXT }] = await Promise.all(
    ["plan-days.mjs", "plan-modules.mjs", "plan-en.mjs", "home-data.mjs"].map(tool),
  );
  const moduleName: Record<ListLang, Record<string, string>> = {
    ru: Object.fromEntries((MODULES as [string, number, number, string][]).map(([id, , , name]) => [id, name])),
    en: MODULE_NAMES_EN,
  };
  const folderOf = (c: Course, day: number) => `${c.dir}/day-${String(day).padStart(2, "0")}`;
  const ready = (c: Course, day: number) => ["lecture", "student", "tasks"].every((p) => pageExists(REPO, `${folderOf(c, day)}/${p}.html`));
  const hasEn = (c: Course, day: number) => pageExists(REPO, `${folderOf(c, day)}/en/lecture.html`);

  const list = (lang: ListLang): HomeList => {
    const t: Words = TEXT[lang];
    const courses = (COURSES as Course[]).map((c) => {
      const days: [number, string | null, string][] = PLAN[c.no].days;
      // the days grouped by module; project days (no module) together in one group at their place
      const groups: { id: string; days: HomeDay[] }[] = [];
      for (const [day, module, title] of days) {
        const id = module ?? "PROJECTS";
        const en = lang === "en" && hasEn(c, day);
        const item: HomeDay = {
          day,
          title: lang === "ru" ? title : DAY_TITLES_EN[c.no][day],
          ruNote: lang === "en" && !hasEn(c, day),
          at: ready(c, day) ? (en ? `${folderOf(c, day)}/en` : folderOf(c, day)) : null,
        };
        const last = groups.at(-1);
        if (last && last.id === id) last.days.push(item);
        else groups.push({ id, days: [item] });
      }
      const done = days.filter(([d]) => ready(c, d)).length;
      return {
        no: c.no,
        name: c.name,
        anchor: `course-${c.no}-${lang}`,
        label: `${text(t.courseNo)} ${c.no}`,
        about: text(c.about[lang]),
        status: text(t.status(done, days.length)),
        groups: groups.map((g) => {
          const [colour, icon] = LOOK[g.id] as [string, string];
          const first = g.days[0].day, last = g.days.at(-1)!.day;
          const range = g.days.length > 1 ? `${t.days} ${first}&ndash;${last}` : `${t.day} ${first}`;
          return {
            name: text(g.id === "PROJECTS" ? t.projects : moduleName[lang][g.id]),
            icon: text(icon),
            colour,
            count: text(`${range} &bull; ${t.course(c)}`),
            days: g.days,
          };
        }),
      };
    });
    return { courses, words: { lecture: text(t.lecture), student: text(t.student), tasks: text(t.tasks), soon: text(t.soon) } };
  };
  return { ru: list("ru"), en: list("en") };
}
