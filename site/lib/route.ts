// The address a <Link> goes to: the route, without ".html" ("student.html" -> "student", "../lecture.html" ->
// "../lecture"). Next.js moves between pages without a reload only by route addresses; a route ending in ".html"
// would be exported as a folder "student.html/" next to a file "student.html.html" (tried 06.11.2026). The files
// "….html" are still written, so the old addresses open the same pages.
// (A module of its own: LangButton runs in the browser, nav.ts reads the file system.)
export const route = (href: string) => href.replace(/\.html$/, "");
