// Headless DOM driver: mounts the real App bundle in (multiple) jsdom windows
// and lets tests click / type / submit like a browser would.
//
// Because the app reads `localStorage` / `sessionStorage` off the global scope,
// every interaction first points the globals at the window being used, so each
// mounted window behaves like its own browser tab with its own storage.
import { JSDOM } from "jsdom";

let active = null;

function activate(win) {
  if (active === win) return;
  active = win;
  global.window = win;
  global.document = win.document;
  Object.defineProperty(global, "navigator", {
    value: win.navigator,
    configurable: true,
    writable: true,
  });
  global.localStorage = win.localStorage;
  global.sessionStorage = win.sessionStorage;
  for (const name of [
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLSelectElement",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "StorageEvent",
    "Node",
  ]) {
    global[name] = win[name];
  }
}

export function activateTab(t) {
  activate(t.window);
}

export async function mount(url = "http://localhost:5173/", opts = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // pre-populate storage before the app mounts == "reload this tab"
  for (const [k, v] of opts.local ?? []) window.localStorage.setItem(k, v);
  for (const [k, v] of opts.session ?? []) window.sessionStorage.setItem(k, v);

  activate(window);
  // Node ships its own BroadcastChannel which never closes; the app already
  // falls back to storage events, which is the path these tests drive.
  global.BroadcastChannel = undefined;
  global.IS_REACT_ACT_ENVIRONMENT = true;

  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { App } = await import("./../.tmp/entry.js");

  const container = window.document.getElementById("root");
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(App));
  });

  const t = {
    window,
    document: window.document,
    dom,
    React,
    act,
    root,
    activate: () => activate(window),
    q: (sel) => window.document.querySelector(sel),
    qa: (sel) => [...window.document.querySelectorAll(sel)],
    text: () => window.document.body.textContent.replace(/\s+/g, " ").trim(),
    html: () => window.document.body.innerHTML,
    errors: [],
    log: [],
  };

  window.alert = (m) => t.log.push(`alert: ${m}`);
  window.confirm = () => true;
  window.prompt = (m, d) => {
    t.log.push(`prompt: ${m}`);
    return d;
  };
  window.onerror = (m) => t.errors.push(String(m));

  return t;
}

/** Find a button (or any element) whose trimmed text matches exactly. */
export function byText(t, text, sel = "button") {
  const el = t.qa(sel).find((e) => e.textContent.replace(/\s+/g, " ").trim() === text);
  return el ?? null;
}

export function byLabel(t, label) {
  const fields = t.qa(".field");
  const field = fields.find((f) => {
    const l = f.querySelector("label");
    return l && l.textContent.replace(/\s+/g, " ").trim().toLowerCase() === label.toLowerCase();
  });
  if (!field) return null;
  return field.querySelector("input, select, textarea");
}

export function fieldError(t, label) {
  const handle = byLabel(t, label);
  if (!handle) return null;
  const field = handle.closest(".field");
  const fn = field.querySelector(".field-error");
  return fn ? fn.textContent.replace(/\s+/g, " ").trim() : null;
}

function ownerTab(el) {
  return (el.ownerDocument && el.ownerDocument.defaultView) || active;
}

export function setValue(t, el, value) {
  activate(ownerTab(el));
  const proto =
    el.tagName === "TEXTAREA"
      ? t.window.HTMLTextAreaElement.prototype
      : el.tagName === "SELECT"
        ? t.window.HTMLSelectElement.prototype
        : t.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new t.window.Event("input", { bubbles: true }));
  el.dispatchEvent(new t.window.Event("change", { bubbles: true }));
}

export async function click(t, el) {
  if (!el) throw new Error("click() called with nothing");
  activate(ownerTab(el));
  await t.act(async () => {
    el.dispatchEvent(new t.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

export async function type(t, label, value) {
  const el = byLabel(t, label);
  if (!el) throw new Error(`no field labelled "${label}"`);
  await t.act(async () => {
    setValue(t, el, value);
  });
  return el;
}

export async function submit(t, form) {
  activate(t.window);
  await t.act(async () => {
    form.dispatchEvent(new t.window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

/** [key, value] pairs of a jsdom Storage (it has no .entries()). */
export function dumpStorage(storage) {
  const out = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    out.push([k, storage.getItem(k)]);
  }
  return out;
}

/** The database as stored in a specific tab's localStorage. */
export function dbOf(t) {
  const raw = t.window.localStorage.getItem("splitide-db-v1");
  return raw ? JSON.parse(raw) : null;
}
