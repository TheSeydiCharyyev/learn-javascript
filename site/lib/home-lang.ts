// The languages of the home page and the script that puts the saved one on the page before React starts (see
// lib/HomeState.tsx). Shared by the server part (lib/Home.tsx renders the script) and the client part.
import { LANG_KEY } from "./lang-key";

// the languages the home page has text in: RU and EN all over, TM and TR only the menu's heading (their lists are the
// Russian ones); any other saved value shows Russian
export const HOME_LANGS = ["ru", "en", "tk", "tr"];

// what js/lang.js did when the page was parsed: the saved language on [data-lang], [data-list], the .lang-opt buttons
// and <html lang>
export const HOME_LANG_SCRIPT = `(function(){try{
var l=localStorage.getItem(${JSON.stringify(LANG_KEY)})||"ru",s=${JSON.stringify(HOME_LANGS)}.indexOf(l)<0?"ru":l,list=s==="en"?"en":"ru";
document.querySelectorAll("[data-lang]").forEach(function(e){e.classList.toggle("lang-hidden",e.dataset.lang!==s);});
document.querySelectorAll("[data-list]").forEach(function(e){e.classList.toggle("lang-hidden",e.dataset.list!==list);});
document.querySelectorAll(".lang-opt").forEach(function(b){var a=b.dataset.setLang===s;b.classList.toggle("active",a);b.setAttribute("aria-pressed",a?"true":"false");});
document.documentElement.lang=s;
}catch(e){}})();`;
