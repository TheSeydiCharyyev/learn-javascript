// The only layout: for every page — the home page (slug []) and each day page — <html lang>, and for a day page still
// in HTML the <head> of its file (its scripts) in the same order; css/common.css — the CSS every page shares — is
// imported here (copied by scripts/copy-assets.mjs). A page carries the rest of its CSS itself; a day page gives its
// title as metadata (see page.tsx), the home page draws its own (lib/HomeState.tsx).
// Moving between day pages by <Link> does not reload the document: this layout renders again for the new address,
// so <html lang> follows the page (checked 06.11.2026: ru -> en -> ru).
// The home page changes <html lang> for the chosen language before React starts (lib/home-lang.ts), so React must
// not compare it when it hydrates.
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
