// A course page: the top-level elements of the file's <body> (navigation and content), as written.
import type { Metadata } from "next";
import { fromSlug, pagePaths, readPage, render, toSlug } from "@/lib/source";

export const dynamicParams = false;

export function generateStaticParams() {
  return pagePaths().map((rel) => ({ slug: toSlug(rel) }));
}

export async function generateMetadata({ params }: PageProps<"/[...slug]">): Promise<Metadata> {
  return { title: readPage(fromSlug((await params).slug)).title };
}

export default async function CoursePage({ params }: PageProps<"/[...slug]">) {
  return <>{readPage(fromSlug((await params).slug)).body.map(render)}</>;
}
