// Routes: one static page per page of the course (see lib/source.ts). A day page is its navigation bar (drawn by
// <LessonNav>) and its content: from an MDX file, the course's components inside <div class="container"> (the head of
// a lecture from its frontmatter); from an HTML file, the top-level elements of its <body> with their inner HTML
// exactly as written (on the home page: the header, menu and main part).
// A day page starts with its own CSS (its kind's CSS, book.css, the colours of the day — after common.css in the
// cascade, as the file had it); the CSS leaves with the page when the reader goes to another one. Its title is
// metadata, so it changes with the page too.
import type { Metadata } from "next";
import LessonNav from "@/lib/LessonNav";
import { courseComponents, DayHead } from "@/lib/course";
import { mdxContent } from "@/lib/mdx";
import { fromSlug, pagePaths, readPage, render, toSlug } from "@/lib/source";

export const dynamicParams = false;

export function generateStaticParams() {
  return pagePaths().map((rel) => ({ slug: toSlug(rel) }));
}

export async function generateMetadata({ params }: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const page = readPage(fromSlug((await params).slug));
  return page.title === null ? {} : { title: page.title };
}

export default async function Page({ params }: PageProps<"/[[...slug]]">) {
  const rel = fromSlug((await params).slug);
  const page = readPage(rel);
  let content;
  if (page.mdx) {
    const { front, body, dir, up } = page.mdx;
    const Content = await mdxContent(rel, body);
    content = (
      <div className="container">
        {front.day && <DayHead day={front.day} heading={front.heading!} lead={front.lead!} />}
        <Content components={courseComponents({ lang: page.lang as "ru" | "en", dir, up })} />
      </div>
    );
  } else {
    content = page.body.map(render);
  }
  return (
    <>
      {page.pageCss.map((css, i) => <style key={`css${i}`} dangerouslySetInnerHTML={{ __html: css }} />)}
      {page.nav && <LessonNav nav={page.nav} />}
      {content}
    </>
  );
}
