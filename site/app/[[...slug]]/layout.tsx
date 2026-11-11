// The only layout: <html lang> of every page — the home page (slug []) and each day page; css/common.css — the CSS
// every page shares — is imported here (copied by scripts/copy-assets.mjs). A page carries the rest of its CSS itself;
// a day page gives its title as metadata (see page.tsx), the home page draws its own (lib/HomeState.tsx).
// (Until stage 4 of the move to Next.js, 11.11.2026, a day still in HTML put the scripts of its <head> here.)
// Moving between pages by <Link> does not reload the document: this layout renders again for the new address,
// so <html lang> follows the page (checked 06.11.2026: ru -> en -> ru).
// The home page changes <html lang> for the chosen language before React starts (lib/home-lang.ts), so React must
// not compare it when it hydrates.
import "@/styles/course/common.css";
import { fromSlug, readPage } from "@/lib/source";

export default async function SiteLayout({ children, params }: LayoutProps<"/[[...slug]]">) {
  const page = readPage(fromSlug((await params).slug));
  return (
    <html lang={page.lang} suppressHydrationWarning>
      <head />
      <body>{children}</body>
    </html>
  );
}
