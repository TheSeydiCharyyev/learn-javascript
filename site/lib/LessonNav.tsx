// The navigation bar of a day page: home, course and day, lecture / notes / tasks (the current one not a link),
// and the RU/EN button where the other language exists. The bar is a flex row, so the whitespace between its items
// is not drawn; it is kept ("\n    " before each item) only so that the DOM equals the HTML pages' one while they
// are the reference of compare-site — it can go when they are retired.
// Every link is a <Link>: the next page comes without a reload — "← Course" too since the home page is React
// (stage 3, 09.11.2026; it goes to the home page's route, "../../"). A page not written yet (day 21 of Advanced) is not
// prefetched: the router would ask for it, get 404 and log an error in the console (07.11.2026); the link is there as
// in the HTML page, dead in both.
import type { ReactNode } from "react";
import Link from "next/link";
import LangButton from "./LangButton";
import { decodeRefs, type NavModel } from "./nav";
import { route } from "./route";

export default function LessonNav({ nav }: { nav: NavModel }) {
  const items: ReactNode[] = [
    <Link key="home" href={route(nav.home.href)} className="nav-home">{decodeRefs(nav.home.label)}</Link>,
    <span key="sep1" className="nav-sep">|</span>,
    <span key="title" className="nav-title">{nav.title}</span>,
    <span key="sep2" className="nav-sep">|</span>,
    ...nav.items.map((i) =>
      i.active ? (
        <span key={i.file} className="nav-active">{decodeRefs(i.label)}</span>
      ) : (
        <Link key={i.file} href={route(i.file)} className="nav-link" prefetch={i.exists ? null : false}>
          {decodeRefs(i.label)}
        </Link>
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
