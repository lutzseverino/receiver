// The receiver's remembered settings: sound, PLAIN and the language. Sound and
// PLAIN live in `localStorage`; where it is absent or refuses, sound is off
// and the display is shown, and a choice made then lasts only the page. The
// language is the head script's choice (`i18n/choice.ts`): a saved choice
// wins, `sessionStorage` holds it when `localStorage` fails, and with both
// blocked the switcher's `?locale=` keeps the chosen page.
import { localeChoice } from "../i18n/choice.ts";
import { LOCALES } from "../i18n/locales.ts";

const SOUND = "receiver.sound";
const PLAIN = "receiver.plain";

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, on: boolean) => {
  try {
    if (on) window.localStorage.setItem(key, "on");
    else window.localStorage.removeItem(key);
  } catch {
    // unavailable storage keeps nothing: the defaults return on the next page
  }
};

export const settings = {
  sound: () => read(SOUND) === "on",
  setSound: (on: boolean) => write(SOUND, on),
  plain: () => read(PLAIN) === "on",
  setPlain: (on: boolean) => write(PLAIN, on),
  language: localeChoice(LOCALES),
};
