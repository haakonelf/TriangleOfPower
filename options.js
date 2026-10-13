const api = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = {
  style: "graphic",
  nested: "drawing",
  plainLog: "none",
  enable: { log: true, ln: true, sqrt: true, root: true, power: true }
};
const KEYS = ["log", "ln", "sqrt", "root", "power"];
const $ = (id) => document.getElementById(id);
const status = $("status");

function say(msg, isErr) {
  status.textContent = msg;
  status.className = isErr ? "err" : "";
  setTimeout(() => (status.textContent = ""), 2500);
}

function show(s) {
  s = { ...DEFAULTS, ...(s || {}), enable: { ...DEFAULTS.enable, ...((s || {}).enable || {}) } };
  $("style").value = s.style;
  $("nested").value = s.nested;
  $("plainLog").value = s.plainLog;
  KEYS.forEach((k) => ($("en-" + k).checked = !!s.enable[k]));
}

async function load() {
  const { settings } = await api.storage.sync.get("settings");
  show(settings);
}

$("save").addEventListener("click", async () => {
  const settings = {
    style: $("style").value,
    nested: $("nested").value,
    plainLog: $("plainLog").value,
    enable: Object.fromEntries(KEYS.map((k) => [k, $("en-" + k).checked]))
  };
  await api.storage.sync.set({ settings });
  say("Saved");
});

$("reset").addEventListener("click", async () => {
  await api.storage.sync.set({ settings: DEFAULTS });
  show(DEFAULTS);
  say("Reset");
});

load();
