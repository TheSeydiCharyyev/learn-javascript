// The only layout: every page — the home page (slug []) and each day page — is its own HTML file in the repository.
// <html lang> and the <head> of the file (title, scripts, the home page's own CSS) come from the file in the same
// order; css/common.css — the CSS every page shares — is imported here (copied by scripts/copy-assets.mjs). A day
// page carries the rest of its CSS itself (see page.tsx).
// lang.js changes <html lang> for the chosen language, so React must not compare it when it hydrates.
import "@/styles/course/common.css";
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
