// Routes: one static page per HTML file of the course (see lib/source.ts). A page is the top-level elements of the
// file's <body> — on a day page the navigation bar (drawn by <LessonNav>) and the content, on the home page the
// header, menu and main part — the content with its inner HTML exactly as written.
// A day page starts with its own CSS (its kind's CSS, book.css, the colours of the day — after common.css in the
// cascade, as the file had it); the CSS leaves with the page when the reader goes to another one.
import LessonNav from "@/lib/LessonNav";
import { fromSlug, pagePaths, readPage, render, toSlug } from "@/lib/source";

export const dynamicParams = false;

export function generateStaticParams() {
  return pagePaths().map((rel) => ({ slug: toSlug(rel) }));
}

export default async function Page({ params }: PageProps<"/[[...slug]]">) {
  const page = readPage(fromSlug((await params).slug));
  return (
    <>
      {page.pageCss.map((css, i) => <style key={`css${i}`} dangerouslySetInnerHTML={{ __html: css }} />)}
      {page.nav && <LessonNav nav={page.nav} />}
      {page.body.map(render)}
    </>
  );
}
