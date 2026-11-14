// The settings page: one column. The lock at the top; the black zone (add
// a site, the sites added, the passes running); then one card per
// supported site.

import { send } from "./api.js";
import { button, h, iconButton, text, uid } from "./components.js";
import {
  createPage,
  customSwitches,
  failureNotice,
  feedback,
  lockPanel,
  passRow,
  siteSwitches,
} from "./page.js";

const page = createPage({
  root: document.getElementById("app"),
  load: () => send("getView"),
  build,
});
page.start();

function build(page) {
  const head = h(
    "header",
    { class: "section-head" },
    text("display", "Site Blocker"),
    text("small", "Close whole sites, or hide only the parts that pull you in.", { tone: "muted" }),
  );
  if (!page.view) return [head, failureNotice(page)];
  return [head, failureNotice(page), lockPanel(page), blackZone(page), supportedSites(page)];
}

function blackZone(page) {
  const { custom, passes } = page.view;
  return h(
    "section",
    { class: "section", "aria-labelledby": "black-zone" },
    h(
      "div",
      { class: "section-head" },
      text("title", "Black zone", { id: "black-zone" }),
      text("small", "A site in the black zone cannot be opened at all.", { tone: "muted" }),
    ),
    passes.length > 0 && passesCard(page),
    addCard(page),
    custom.length > 0 && h("ul", { class: "section" }, custom.map((item) => customCard(page, item))),
  );
}

/** Passes running now, each with "End now". */
function passesCard(page) {
  const now = Date.now();
  return h(
    "section",
    { class: "card", "aria-labelledby": "passes" },
    text("heading", "Open for now", { id: "passes" }),
    h(
      "ul",
      { class: "rows" },
      page.view.passes.map((pass) => h("li", {}, passRow(page, pass, { now, after: "add" }))),
    ),
  );
}

/** Adds a site by its domain or a pasted address. Adding is tightening,
 * so it is free; the site starts in the black zone. */
function addCard(page) {
  const key = "add";
  const inputId = uid("add");
  const submit = () => {
    const input = (page.drafts.add ?? "").trim();
    if (!input) {
      page.focus(key);
      page.render();
      return;
    }
    page.act(key, () => send("addCustom", { input }), {
      focus: key,
      done: () => {
        page.drafts.add = "";
      },
    });
  };
  return h(
    "form",
    {
      class: "card",
      novalidate: true,
      on: {
        submit: (event) => {
          event.preventDefault();
          submit();
        },
      },
    },
    h(
      "div",
      { class: "field" },
      text("small", "Add a site", { as: "label", for: inputId }),
      h(
        "div",
        { class: "field-row" },
        h("input", {
          id: inputId,
          key,
          class: "input",
          type: "text",
          inputmode: "url",
          value: page.drafts.add ?? "",
          placeholder: "reddit.com, or paste an address",
          autocomplete: "off",
          autocapitalize: "off",
          spellcheck: "false",
          "aria-invalid": page.errors.add ? "true" : null,
          on: {
            input: (event) => {
              page.drafts.add = event.target.value;
            },
            keydown: (event) => {
              if (event.key !== "Escape" || !event.target.value) return;
              event.preventDefault();
              event.target.value = "";
              page.drafts.add = "";
            },
          },
        }),
        button({ type: "submit", label: "Add", icon: "plus", key: "add:submit" }),
      ),
    ),
    feedback(page, key),
  );
}

/** A site the owner added: its domain, a remove control, its switches. */
function customCard(page, custom) {
  const { domain } = custom;
  const removeKey = `custom:${domain}:remove`;
  return h(
    "li",
    { class: "card" },
    h(
      "div",
      { class: "item-head" },
      text("heading", domain),
      iconButton({
        icon: "trash",
        danger: true,
        label: `Remove ${domain}`,
        key: removeKey,
        onClick: () =>
          page.act(removeKey, () => send("removeCustom", { domain }), {
            reason: `Removing ${domain} needs the password.`,
            focus: "add",
          }),
      }),
    ),
    feedback(page, removeKey),
    customSwitches(page, custom),
  );
}

/** One card per supported site, in registry order. */
function supportedSites(page) {
  const { sites } = page.view;
  if (sites.length === 0) return null;
  return h(
    "section",
    { class: "section", "aria-labelledby": "sites" },
    h(
      "div",
      { class: "section-head" },
      text("title", "Sites", { id: "sites" }),
      text("small", "Block a whole site, or hide only the parts you lose time to.", { tone: "muted" }),
    ),
    sites.map((site) => {
      const id = uid("site");
      return h(
        "section",
        { class: "card", "aria-labelledby": id },
        text("heading", site.name, { id }),
        siteSwitches(page, site),
      );
    }),
  );
}
