// Every page's loader for the receiver. Unless the visitor chose PLAIN, it
// loads the receiver after the first paint, so the HTML layer is readable
// first; if the receiver can't start, as without WebGL, the plain page stays
// and nothing replaces it. In PLAIN mode the plain page offers the way back
// to the display, which the choice also remembers.
import { settings } from "./settings.ts";

const displayButton = () =>
  document.querySelector<HTMLButtonElement>('[data-control="display"]');

function offerDisplay() {
  const button = displayButton();
  if (button) button.hidden = false;
}

function load(intro: boolean) {
  import("./receiver.ts")
    .then(({ startReceiver }) =>
      startReceiver({ onPlain: offerDisplay, intro }),
    )
    // a receiver that fails to load or start leaves the plain page
    .catch(() => {});
}

document.addEventListener("click", (event) => {
  if (
    event.target instanceof Element &&
    event.target.closest('[data-control="display"]')
  ) {
    settings.setPlain(false);
    displayButton()!.hidden = true;
    // the display comes back as it was, without a page load's intro
    load(false);
  }
});

if (settings.plain()) offerDisplay();
else requestAnimationFrame(() => setTimeout(() => load(true)));
