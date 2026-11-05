// Routes: one static page per HTML file of the course (see lib/source.ts). A page is the top-level elements of the
// file's <body> — on a day page the navigation and the content, on the home page the header, menu and main part —
// each with its inner HTML exactly as written.
import { fromSlug, pagePaths, readPage, render, toSlug } from "@/lib/source";

export const dynamicParams = false;

export function generateStaticParams() {
  return pagePaths().map((rel) => ({ slug: toSlug(rel) }));
}

export default async function Page({ params }: PageProps<"/[[...slug]]">) {
  return <>{readPage(fromSlug((await params).slug)).body.map(render)}</>;
}
