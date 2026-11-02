// The reply page's script: it assembles the email address from the page's
// encoded mail target, links it, enables COPY, and makes SEND, or Ctrl or
// Cmd with Enter in the message, open the visitor's mail app (D9).
import { decodeMailTarget, mailUrl } from "../lib/email.ts";

const form = document.querySelector<HTMLFormElement>("form[data-mail]");
if (form) {
  const target = decodeMailTarget(form.dataset.mail!);
  const status = document.querySelector<HTMLElement>("[data-status]")!;
  const message = form.querySelector("textarea")!;

  const spelled = document.querySelector<HTMLElement>("[data-email]");
  const address = document.createElement("a");
  address.href = `mailto:${target.to}`;
  address.textContent = target.to;
  spelled?.replaceChildren(address);

  const copy = document.querySelector<HTMLButtonElement>("[data-copy]");
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener("click", () => {
      navigator.clipboard.writeText(target.to).then(
        () => (status.textContent = copy.dataset.copied ?? ""),
        // a refused clipboard leaves the address selected to copy by hand
        () => getSelection()?.selectAllChildren(address),
      );
    });
  }

  form.querySelector<HTMLElement>(".hint")!.hidden = false;
  const send = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  send.disabled = false;
  send.removeAttribute("data-disabled");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.location.href = mailUrl(target, message.value);
    status.textContent = form.dataset.sent ?? "";
  });
  message.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
}
