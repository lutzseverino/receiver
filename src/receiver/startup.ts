// Shared type; the head's recovery is deliberately independent of the loader.
export type Startup = {
  signal: AbortSignal;
  ready(): void;
  recover(): void;
};

declare global {
  interface Window {
    receiverStartup?: Startup;
  }
}

function gate() {
  try {
    if (localStorage.getItem("receiver.plain") === "on") return;
  } catch {
    // Unavailable storage keeps the unsaved display default.
  }
  try {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl");
    if (!context) return;
    context.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    return;
  }
  const root = document.documentElement;
  const controller = new AbortController();
  const deadline = performance.now() + 1500;
  let pending = true;
  const offer = () => {
    const button = document.querySelector<HTMLButtonElement>(
      '[data-control="display"]',
    );
    if (button) button.hidden = false;
  };
  const recover = () => {
    performance.mark("receiver:plain");
    pending = false;
    clearTimeout(timer);
    controller.abort();
    root.classList.remove("receiver-pending", "receiving");
    document
      .querySelectorAll(".display, .receiver-status")
      .forEach((el) => el.remove());
    offer();
    document.addEventListener("DOMContentLoaded", offer, { once: true });
  };
  const check = () => {
    if (pending && performance.now() >= deadline) recover();
  };
  // Establish independent recovery before the cover can become visible.
  const timer = setTimeout(recover, 1500);
  document.addEventListener("visibilitychange", check);
  document.addEventListener("focusin", () => {
    if (pending) recover();
  });
  window.receiverStartup = {
    signal: controller.signal,
    recover,
    ready() {
      check();
      if (!pending || controller.signal.aborted) return;
      performance.mark("receiver:first-frame");
      pending = false;
      clearTimeout(timer);
      root.classList.remove("receiver-pending");
    },
  };
  performance.mark("receiver:gate");
  root.classList.add("receiver-pending");
}

export const startupScript = `(${gate.toString()})()`;
