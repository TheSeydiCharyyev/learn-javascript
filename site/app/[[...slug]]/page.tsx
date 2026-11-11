// Routes: one static page per page of the course (see lib/source.ts). The home page is drawn by <Home> from the plans
// (lib/Home.tsx). A day page is its navigation bar (drawn by <LessonNav>) and its MDX: the course's components inside
// <div class="container"> (the head of a lecture from its frontmatter).
// A day page starts with its own CSS (its kind's CSS, book.css, the colours of the day — after common.css in the
// cascade, as the HTML files had it); the CSS leaves with the page when the reader goes to another one. Its title is
// metadata, so it changes with the page too.
import type { Metadata } from "next";
import LessonNav from "@/lib/LessonNav";
import { courseComponents, DayHead } from "@/lib/course";
import Home from "@/lib/Home";
import { mdxContent } from "@/lib/mdx";
import { fromSlug, pagePaths, readPage, toSlug } from "@/lib/source";

export const dynamicParams = false;

export function generateStaticParams() {
  return pagePaths().map((rel) => ({ slug: toSlug(rel) }));
}

export async function generateMetadata({ params }: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const rel = fromSlug((await params).slug);
  if (rel === "index.html") return {}; // the home page's title is drawn by lib/HomeState.tsx (it follows the language)
  const page = readPage(rel);
  return page.title === null ? {} : { title: page.title };
}

export default async function Page({ params }: PageProps<"/[[...slug]]">) {
  const rel = fromSlug((await params).slug);
  const page = readPage(rel);
  let content;
  if (!page.mdx) {
    content = <Home />;
  } else {
    const { front, body, firstLine, dir, up } = page.mdx;
    const Content = await mdxContent(rel, body, firstLine);
    content = (
      <div className="container">
        {front.day && <DayHead day={front.day} heading={front.heading!} lead={front.lead!} />}
        <Content components={courseComponents({ lang: page.lang as "ru" | "en", dir, up })} />
      </div>
    );
  }
  return (
    <>
      {page.pageCss.map((css, i) => <style key={`css${i}`} dangerouslySetInnerHTML={{ __html: css }} />)}
      {page.nav && <LessonNav nav={page.nav} />}
      {content}
    </>
  );
}
