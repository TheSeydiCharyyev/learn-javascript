// The only layout: every page — the home page (slug []) and each day page — is its own HTML file in the repository.
// <html lang> and the <head> resources (title, CSS, scripts, the day colours) come from the file in the same order;
// <body> holds the file's top-level elements (page.tsx) next to Next.js's own nodes.
// lang.js changes <html lang> for the chosen language, so React must not compare it when it hydrates.
import { fromSlug, handlersScript, readPage, render } from "@/lib/source";

export default async function SiteLayout({ children, params }: LayoutProps<"/[[...slug]]">) {
  const page = readPage(fromSlug((await params).slug));
  const handlers = handlersScript(page.handlers);
  return (
    <html lang={page.lang} suppressHydrationWarning>
      <head>
        {page.head.map(render)}
        {handlers && <script dangerouslySetInnerHTML={{ __html: handlers }} />}
      </head>
      <body>{children}</body>
    </html>
  );
}
