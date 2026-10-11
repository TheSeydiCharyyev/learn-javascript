/**
 * Language switcher for JavaScript Essentials course
 * Supports: Russian (ru), English (en) and Turkmen (tk) on pages that have it
 * Pages without the chosen language fall back to Russian
 * Saves preference to localStorage
 */

function pageHasLang(lang) {
    return lang === 'ru' || lang === 'en' || document.querySelector('[data-lang="' + lang + '"]') !== null;
}

function setLang(lang) {
    var shown = pageHasLang(lang) ? lang : 'ru';

    document.querySelectorAll('[data-lang]').forEach(function(el) {
        if (el.dataset.lang === shown) {
            el.classList.remove('lang-hidden');
        } else {
            el.classList.add('lang-hidden');
        }
    });

    // the day list on the home page exists in Russian and English; TM and TR show the Russian one
    var list = shown === 'en' ? 'en' : 'ru';
    document.querySelectorAll('[data-list]').forEach(function(el) {
        el.classList.toggle('lang-hidden', el.dataset.list !== list);
    });

    document.documentElement.lang = shown;
    localStorage.setItem('javascript-essentials-lang', lang);

    // the tab title: a page keeps its English title in data-en; every other language shows the Russian one
    var title = document.querySelector('title[data-en]');
    if (title) {
        if (!title.dataset.ru) title.dataset.ru = title.textContent;
        document.title = shown === 'en' ? title.dataset.en : title.dataset.ru;
    }

    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        btn.textContent = shown === 'ru' ? 'EN' : 'RU';
    });

    document.querySelectorAll('.lang-opt').forEach(function(btn) {
        var active = btn.dataset.setLang === shown;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function toggleLang() {
    setLang(document.documentElement.lang === 'ru' ? 'en' : 'ru');
}

document.addEventListener('DOMContentLoaded', function() {
    var lang = localStorage.getItem('javascript-essentials-lang') || 'ru';
    setLang(lang);
});
