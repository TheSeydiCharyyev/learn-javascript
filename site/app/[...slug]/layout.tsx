// Root layout of the course pages: <html lang> and the <head> resources (CSS, highlight.js, the day colours) come
// from the page's own HTML file, in the same order.
import { fromSlug, readPage, render } from "@/lib/source";

export default async function CourseLayout({ children, params }: LayoutProps<"/[...slug]">) {
  const page = readPage(fromSlug((await params).slug));
  return (
    <html lang={page.lang}>
      <head>{page.head.map(render)}</head>
      <body>{children}</body>
    </html>
  );
}
