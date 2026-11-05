"use client";
// The <title> of a page. React manages <title> itself: when it hydrates, it writes the title's content again
// (seen 05.11.2026: react-dom set innerHTML after lang.js had switched the home page title to English). So on the
// client the title takes what the document shows at that moment — the file's text, or lang.js's English one —
// and React writes back the same; on the server it is the file's text.
export default function Title({ html, attrs }: { html: string; attrs: Record<string, string> }) {
  const shown = typeof document === "undefined" ? html : (document.querySelector("head > title")?.innerHTML ?? html);
  return <title {...attrs} dangerouslySetInnerHTML={{ __html: shown }} />;
}
