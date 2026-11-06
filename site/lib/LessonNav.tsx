// The navigation bar of a day page: home, course and day, lecture / notes / tasks (the current one not a link),
// and the RU/EN button where the other language exists. The bar is a flex row, so the whitespace between its items
// is not drawn; it is kept ("\n    " before each item) only so that the DOM equals the HTML pages' one while they
// are the reference of compare-site — it can go when they are retired.
import type { ReactNode } from "react";
import LangButton from "./LangButton";
import { decodeRefs, type NavModel } from "./nav";

export default function LessonNav({ nav }: { nav: NavModel }) {
  const items: ReactNode[] = [
    <a key="home" href={nav.home.href} className="nav-home">{decodeRefs(nav.home.label)}</a>,
    <span key="sep1" className="nav-sep">|</span>,
    <span key="title" className="nav-title">{nav.title}</span>,
    <span key="sep2" className="nav-sep">|</span>,
    ...nav.items.map((i) =>
      i.active ? (
        <span key={i.file} className="nav-active">{decodeRefs(i.label)}</span>
      ) : (
        <a key={i.file} href={i.file} className="nav-link">{decodeRefs(i.label)}</a>
      ),
    ),
  ];
  if (nav.switchTo) items.push(<LangButton key="lang" {...nav.switchTo} />);
  return (
    <div className="lesson-nav">
      {items.flatMap((item) => ["\n    ", item])}
      {"\n"}
    </div>
  );
}
