// The data of the home page that is not in the plans: the courses (number, folder, name, a line about each), the
// colour and icon of each module, and the words of the page in Russian and English. Written as HTML (entities, from
// the time tools/build-index.mjs put it into index.html — removed 11.11.2026, the home page is the site's): the site
// (site/lib/home-lists.ts) decodes it into text.
import { MODULE_NAMES_EN } from './plan-en.mjs';

// the courses on the home page, in order; a course needs a day plan in plan-days.mjs and English titles in plan-en.mjs
export const COURSES = [
  {
    no: 1, dir: 'essentials', name: 'Essentials',
    about: {
      ru: 'Основы языка для тех, кто программирует впервые, и работа со страницей: DOM, события, таймеры, fetch, хранилище.',
      en: 'The basics of the language for first-time programmers, and working with the page: DOM, events, timers, fetch, storage.',
    },
  },
  {
    no: 2, dir: 'intermediate', name: 'Intermediate',
    about: {
      ru: 'Как устроен язык: замыкания и this, прототипы и классы, итераторы, коллекции, регулярные выражения, Temporal и Intl, асинхронность, модули.',
      en: 'How the language works: closures and this, prototypes and classes, iterators, collections, regular expressions, Temporal and Intl, async code, modules.',
    },
  },
  {
    no: 3, dir: 'advanced', name: 'Advanced',
    about: {
      ru: 'Язык по спецификации: как читать ECMA-262, типы и абстрактные операции, контексты выполнения, Proxy и Reflect, двоичные данные и память, Intl целиком, наследие языка.',
      en: 'The language by its specification: reading ECMA-262, types and abstract operations, execution contexts, Proxy and Reflect, binary data and memory, all of Intl, legacy features.',
    },
  },
];

// colour and icon per module, in the order of MODULES
export const LOOK = {
  E1: ['#3b82f6, #06b6d4', '&#x1F4DC;'],
  E2: ['#8b5cf6, #d946ef', '&#x1F524;'],
  E3: ['#f59e0b, #ef4444', '&#x1F500;'],
  E4: ['#10b981, #059669', '&#x2699;&#xFE0F;'],
  E5: ['#0ea5e9, #6366f1', '&#x1F522;'],
  E6: ['#ec4899, #f43f5e', '&#x1F4E6;'],
  E7: ['#22c55e, #84cc16', '&#x1F5B1;&#xFE0F;'],
  E8: ['#6366f1, #8b5cf6', '&#x23F1;&#xFE0F;'],
  I1: ['#0ea5e9, #2563eb', '&#x1F512;'],
  I2: ['#a855f7, #6366f1', '&#x1F9E9;'],
  I3: ['#f97316, #ef4444', '&#x1F3DB;&#xFE0F;'],
  I4: ['#14b8a6, #0d9488', '&#x1F501;'],
  I5: ['#84cc16, #16a34a', '&#x1F5C2;&#xFE0F;'],
  I6: ['#f43f5e, #db2777', '&#x1F50D;'],
  I7: ['#06b6d4, #3b82f6', '&#x1F4C5;'],
  I8: ['#f59e0b, #dc2626', '&#x26A1;'],
  I9: ['#64748b, #334155', '&#x1F9F1;'],
  A1: ['#6366f1, #4338ca', '&#x1F4D6;'],
  A2: ['#8b5cf6, #7c3aed', '&#x1F9EE;'],
  A3: ['#0ea5e9, #0369a1', '&#x1F3C3;'],
  A4: ['#ec4899, #be185d', '&#x1FA9E;'],
  A5: ['#10b981, #047857', '&#x1F4BE;'],
  A6: ['#f97316, #c2410c', '&#x267B;&#xFE0F;'],
  A7: ['#0891b2, #4f46e5', '&#x1F310;'],
  A8: ['#78716c, #44403c', '&#x1F3FA;'],
  PROJECTS: ['#eab308, #f97316', '&#x1F3C6;'],
};

export const TEXT = {
  ru: {
    projects: 'Проекты и защита', lecture: 'Лекция', student: 'Конспект', tasks: 'Задания', soon: 'материал готовится',
    days: 'Дни', day: 'День', courseNo: 'Курс', course: (c) => `курс ${c.name}`,
    status: (n, all) => (n === all ? `${all} занятий &bull; готов` : n ? `${all} занятий &bull; готово ${n} из ${all}` : `${all} занятий &bull; материал готовится`),
  },
  en: {
    projects: MODULE_NAMES_EN.PROJECTS, lecture: 'Lecture', student: 'Notes', tasks: 'Tasks', soon: 'coming soon',
    days: 'Days', day: 'Day', courseNo: 'Course', course: (c) => `${c.name} course`,
    status: (n, all) => (n === all ? `${all} lessons &bull; ready` : n ? `${all} lessons &bull; ${n} of ${all} ready` : `${all} lessons &bull; coming soon`),
  },
};
