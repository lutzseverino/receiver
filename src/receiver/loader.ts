// Every page's loader for the receiver. Unless the visitor chose PLAIN, it
// loads the receiver after the wait surface paints. If startup fails,
// the head gate restores the plain page independently of this module
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
  const startup = intro ? window.receiverStartup : undefined;
  if (intro && !startup) return;
  if (startup?.signal.aborted) return;
  import("./receiver.ts")
    .then(async ({ startReceiver }) => {
      if (startup?.signal.aborted) return;
      const receiver = await startReceiver({
        onPlain: () => {
          startup?.recover();
          offerDisplay();
        },
        intro,
        signal: startup?.signal,
        onFrame: () => startup?.ready(),
      });
      if (!receiver) {
        startup?.recover();
        offerDisplay();
      } else if (startup?.signal.aborted) receiver.stop();
    })
    .catch(() => {
      startup?.recover();
      offerDisplay();
    });
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
