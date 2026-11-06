// Routes: one static page per HTML file of the course (see lib/source.ts). A page is the top-level elements of the
// file's <body> — on a day page the navigation bar (drawn by <LessonNav>) and the content, on the home page the
// header, menu and main part — the content with its inner HTML exactly as written.
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
      {page.nav && <LessonNav nav={page.nav} />}
      {page.body.map(render)}
    </>
  );
}
