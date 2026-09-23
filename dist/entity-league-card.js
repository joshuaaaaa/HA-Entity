/*
 * Entity League Card
 * Karta pro Home Assistant ve vzhledu ligové tabulky (pořadí, logo, název),
 * kde místo sportovních statistik zobrazuje vaše entity.
 *
 *   type: custom:entity-league-card
 */

const CARD_VERSION = "1.0.0";

const COLUMN_ORDER = ["temperature", "humidity", "light", "window", "motion", "flood", "switch"];

const COLUMN_TYPES = {
  temperature: {
    label: "Teplota",
    header: "Tepl.",
    kind: "numeric",
    unit: "°C",
    decimals: 1,
    filter: [{ domain: "sensor", device_class: "temperature" }, { domain: "input_number" }],
  },
  humidity: {
    label: "Vlhkost",
    header: "Vlhk.",
    kind: "numeric",
    unit: "%",
    decimals: 0,
    filter: [{ domain: "sensor", device_class: "humidity" }, { domain: "input_number" }],
  },
  light: {
    label: "Osvětlení",
    header: "Světlo",
    kind: "binary",
    on_text: "Zap",
    off_text: "Vyp",
    icon_on: "mdi:lightbulb-on",
    icon_off: "mdi:lightbulb-outline",
    color: "#f9a825",
    toggle: true,
    filter: [{ domain: "light" }, { domain: "switch" }],
  },
  window: {
    label: "Okno",
    header: "Okno",
    kind: "binary",
    on_text: "Otevřeno",
    off_text: "Zavřeno",
    icon_on: "mdi:window-open-variant",
    icon_off: "mdi:window-closed-variant",
    color: "#fb8c00",
    filter: [{ domain: "binary_sensor", device_class: ["window", "door", "opening", "garage_door"] }],
  },
  motion: {
    label: "Pohyb",
    header: "Pohyb",
    kind: "binary",
    on_text: "Pohyb",
    off_text: "Klid",
    icon_on: "mdi:motion-sensor",
    icon_off: "mdi:motion-sensor-off",
    color: "#1e88e5",
    filter: [{ domain: "binary_sensor", device_class: ["motion", "occupancy", "presence"] }],
  },
  flood: {
    label: "Zaplavení",
    header: "Voda",
    kind: "binary",
    on_text: "Voda!",
    off_text: "Sucho",
    icon_on: "mdi:water-alert",
    icon_off: "mdi:water-off-outline",
    color: "#e53935",
    filter: [{ domain: "binary_sensor", device_class: "moisture" }],
  },
  switch: {
    label: "Spínač / senzor on-off",
    header: "Spínač",
    kind: "binary",
    on_text: "Zap",
    off_text: "Vyp",
    icon_on: "mdi:toggle-switch",
    icon_off: "mdi:toggle-switch-off-outline",
    color: "#43a047",
    toggle: true,
    filter: [{ domain: "switch" }, { domain: "input_boolean" }, { domain: "binary_sensor" }],
  },
};

const ON_STATES = ["on", "open", "opening", "true", "home", "detected", "wet", "unlocked"];
const UNAVAILABLE = ["unavailable", "unknown", "none", ""];

const DEFAULT_GROUPS = [
  { name: "Přízemí", color: "#43a047" },
  { name: "Patro", color: "#1e88e5" },
];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const colCfg = (config, key) => ({ ...COLUMN_TYPES[key], ...((config.columns || {})[key] || {}) });

function renderPicture(image, icon, cls) {
  if (image) return `<img class="${cls}" src="${esc(image)}" alt="">`;
  if (icon) return `<ha-icon class="${cls}" icon="${esc(icon)}"></ha-icon>`;
  return "";
}

/* ------------------------------------------------------------------ */
/*  Karta                                                             */
/* ------------------------------------------------------------------ */

class EntityLeagueCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("entity-league-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Můj dům",
      icon: "mdi:home",
      groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
      rows: [
        { name: "Obývák", icon: "mdi:sofa", group: 0 },
        { name: "Kuchyně", icon: "mdi:silverware-fork-knife", group: 0 },
        { name: "Ložnice", icon: "mdi:bed", group: 1 },
      ],
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._lastStates = null;
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
  }

  setConfig(config) {
    if (!config) throw new Error("Chybí konfigurace");
    if (config.rows && !Array.isArray(config.rows)) throw new Error("'rows' musí být seznam");
    this._config = config;
    this._lastStates = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Překreslit jen pokud se změnila některá z použitých entit
    const ids = this._entityIds();
    const states = ids.map((id) => hass.states[id]);
    if (this._lastStates && states.every((s, i) => s === this._lastStates[i])) return;
    this._lastStates = states;
    this._render();
  }

  getCardSize() {
    return (this._config?.rows?.length || 0) + 2;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  _entityIds() {
    const ids = [];
    for (const row of this._config?.rows || []) {
      for (const key of COLUMN_ORDER) if (row[key]) ids.push(row[key]);
    }
    return ids;
  }

  _visibleColumns() {
    const rows = this._config.rows || [];
    return COLUMN_ORDER.filter((key) => colCfg(this._config, key).show !== false && rows.some((r) => r[key]));
  }

  _cell(key, entityId, bold) {
    if (!entityId) return `<td class="val"></td>`;
    const col = colCfg(this._config, key);
    const st = this._hass?.states?.[entityId];
    const cls = `val clickable${bold ? " bold" : ""}`;
    if (!st || UNAVAILABLE.includes(String(st.state).toLowerCase())) {
      return `<td class="${cls} na" data-entity="${esc(entityId)}" data-col="${key}">–</td>`;
    }

    if (col.kind === "numeric") {
      const num = parseFloat(st.state);
      let text = st.state;
      if (!isNaN(num)) {
        const dec = Number.isInteger(col.decimals) ? col.decimals : 1;
        const unit = col.unit ?? st.attributes.unit_of_measurement ?? "";
        text = num.toFixed(dec) + (unit ? (unit === "%" ? " " : "") + unit : "");
      }
      return `<td class="${cls}" data-entity="${esc(entityId)}" data-col="${key}">${esc(text)}</td>`;
    }

    const on = ON_STATES.includes(String(st.state).toLowerCase());
    const display = col.display || "text";
    const color = on ? col.color : "";
    const style = color ? ` style="color:${esc(color)}"` : "";
    let inner = "";
    if (display === "icon" || display === "both") {
      inner += `<ha-icon class="st-icon${on ? " on" : ""}"${style} icon="${esc(on ? col.icon_on : col.icon_off)}"></ha-icon>`;
    }
    if (display === "text" || display === "both") {
      inner += `<span class="st-text${on ? " on" : ""}"${style}>${esc(on ? col.on_text : col.off_text)}</span>`;
    }
    return `<td class="${cls}" data-entity="${esc(entityId)}" data-col="${key}"><span class="st">${inner}</span></td>`;
  }

  _render() {
    if (!this._config) return;
    const cfg = this._config;
    const rows = cfg.rows || [];
    const groups = cfg.groups || [];
    const cols = this._visibleColumns();
    const showPos = cfg.show_position !== false;
    const lastCol = cols[cols.length - 1];

    const head = `
      <tr>
        ${showPos ? `<th class="pos-h">${esc(cfg.position_header ?? "#")}</th>` : ""}
        <th class="name-h">${esc(cfg.name_header ?? "Název")}</th>
        ${cols.map((k) => `<th>${esc(colCfg(cfg, k).header)}</th>`).join("")}
      </tr>`;

    const body = rows
      .map((row, i) => {
        const group = groups[row.group];
        const color = row.color || group?.color || "var(--secondary-text-color)";
        return `
        <tr>
          ${showPos ? `<td class="pos-c"><span class="pos" style="background:${esc(color)}">${i + 1}</span></td>` : ""}
          <td class="name-c"><div class="team">${renderPicture(row.image, row.icon, "team-pic")}<span class="team-name">${esc(row.name ?? "")}</span></div></td>
          ${cols
            .map((k) => {
              const c = colCfg(cfg, k);
              const bold = c.bold ?? k === lastCol;
              return this._cell(k, row[k], bold);
            })
            .join("")}
        </tr>`;
      })
      .join("");

    const usedGroups = groups.filter((g, i) => g?.name && (cfg.legend_all || rows.some((r) => r.group === i)));
    const legend =
      cfg.show_legend !== false && usedGroups.length
        ? `<div class="legend">${usedGroups
            .map((g) => `<span class="lg"><span class="sw" style="background:${esc(g.color)}"></span>${esc(g.name)}</span>`)
            .join("")}</div>`
        : "";

    const titlePic = renderPicture(cfg.image, cfg.icon, "logo");
    const header =
      cfg.title || titlePic ? `<div class="header">${titlePic}<span class="title">${esc(cfg.title ?? "")}</span></div>` : "";

    this.shadowRoot.innerHTML = `
      <style>${EntityLeagueCard.styles}</style>
      <ha-card>
        ${header}
        <div class="wrap">
          <table>
            <thead>${head}</thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${legend}
      </ha-card>`;
  }

  _onClick(ev) {
    const td = ev.target.closest("td[data-entity]");
    if (!td || !this._hass) return;
    const entityId = td.dataset.entity;
    const col = colCfg(this._config, td.dataset.col);
    const domain = entityId.split(".")[0];
    const tap = col.tap_action || (col.toggle ? "toggle" : "more-info");
    if (tap === "toggle" && ["light", "switch", "input_boolean", "fan"].includes(domain)) {
      this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
    } else if (tap !== "none") {
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
    }
  }

  static get styles() {
    return `
      :host { display: block; }
      ha-card { padding: 16px 16px 14px; box-sizing: border-box; }
      .header { display: flex; align-items: center; gap: 10px; margin: 0 0 14px 2px; }
      .header .logo { width: 30px; height: 30px; object-fit: contain; --mdc-icon-size: 28px; color: var(--primary-color); flex: none; }
      .header .title { font-size: 18px; font-weight: 500; color: var(--primary-text-color); line-height: 1.2; }
      .wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; color: var(--primary-text-color); }
      th {
        font-size: 11px; font-weight: 500; color: var(--secondary-text-color);
        padding: 6px 6px 8px; text-align: center; white-space: nowrap;
        border-bottom: 1px solid var(--divider-color);
      }
      th.name-h { text-align: left; }
      th.pos-h, td.pos-c { width: 30px; }
      td {
        padding: 5px 6px; height: 23px; text-align: center; white-space: nowrap;
        border-bottom: 1px solid var(--divider-color);
      }
      tbody tr:last-child td { border-bottom: none; }
      .pos {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 3px;
        color: #fff; font-weight: 700; font-size: 12px;
      }
      td.name-c { text-align: left; width: 100%; }
      .team { display: flex; align-items: center; gap: 9px; }
      .team-pic { width: 20px; height: 20px; object-fit: contain; --mdc-icon-size: 20px; flex: none; color: var(--secondary-text-color); }
      .team-name { overflow: hidden; text-overflow: ellipsis; }
      td.val { min-width: 34px; }
      td.bold { font-weight: 700; }
      td.na { color: var(--disabled-text-color, #999); }
      td.clickable { cursor: pointer; }
      td.clickable:hover { background: var(--secondary-background-color); }
      .st { display: inline-flex; align-items: center; gap: 4px; }
      .st-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
      .st-text.on { font-weight: 600; }
      .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 12px 0 0 2px; font-size: 11px; color: var(--secondary-text-color); }
      .lg { display: inline-flex; align-items: center; gap: 5px; }
      .sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    `;
  }
}

/* ------------------------------------------------------------------ */
/*  Nahrání obrázku                                                   */
/* ------------------------------------------------------------------ */

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function resizedDataUrl(file, max = 96) {
  const src = await fileToDataUrl(file);
  if (file.type === "image/svg+xml") return src;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Nahraje obrázek do HA (image_upload). Když to nejde, uloží ho zmenšený přímo do konfigurace. */
async function uploadImage(hass, file) {
  if (file.type !== "image/svg+xml" && hass?.fetchWithAuth) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await hass.fetchWithAuth("/api/image/upload", { method: "POST", body: fd });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.id) return `/api/image/serve/${data.id}/256x256`;
      }
    } catch (e) {
      /* fallback níže */
    }
  }
  return resizedDataUrl(file);
}

/* ------------------------------------------------------------------ */
/*  Vizuální editor                                                   */
/* ------------------------------------------------------------------ */

class EntityLeagueCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._selectors = [];
    this._open = new Set(["general"]);
    this._skipRender = false;
  }

  setConfig(config) {
    // Po vlastní změně si ponecháme pracovní kopii (na ni odkazují pole editoru)
    if (this._skipRender && this._rendered) {
      this._skipRender = false;
      return;
    }
    this._skipRender = false;
    this._config = JSON.parse(JSON.stringify(config || {}));
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    for (const s of this._selectors) s.hass = hass;
    if (first) this._loadComponents();
  }

  async _loadComponents() {
    // Zajistí, že HA načte ha-selector / entity picker i v editoru
    if (customElements.get("ha-selector") && customElements.get("ha-entity-picker")) return;
    try {
      const helpers = await window.loadCardHelpers?.();
      const c = await helpers?.createCardElement({ type: "entities", entities: [] });
      await c?.constructor?.getConfigElement?.();
    } catch (e) {
      /* ignore */
    }
    await customElements.whenDefined("ha-selector");
    this._render();
  }

  _commit(rerender = false) {
    const cols = this._config.columns;
    if (cols) {
      for (const k of Object.keys(cols)) if (!cols[k] || !Object.keys(cols[k]).length) delete cols[k];
      if (!Object.keys(cols).length) delete this._config.columns;
    }
    if (!rerender) this._skipRender = true;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: JSON.parse(JSON.stringify(this._config)) }, bubbles: true, composed: true }));
    if (rerender) this._render();
  }

  _set(obj, key, value, rerender = false) {
    if (value === undefined || value === null || value === "") delete obj[key];
    else obj[key] = value;
    this._commit(rerender);
  }

  /* --- stavební prvky --- */

  _sel(label, selector, value, onChange) {
    const el = document.createElement("ha-selector");
    el.hass = this._hass;
    el.selector = selector;
    el.label = label;
    el.value = value;
    el.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      onChange(ev.detail.value);
    });
    this._selectors.push(el);
    return el;
  }

  _text(label, obj, key, placeholder, rerender = false) {
    const el = this._sel(label, { text: {} }, obj[key] ?? "", (v) => this._set(obj, key, v, rerender));
    if (placeholder) el.placeholder = placeholder;
    el.helper = placeholder ? `Výchozí: ${placeholder}` : undefined;
    return el;
  }

  _section(id, title, content) {
    const d = document.createElement("details");
    d.className = "section";
    d.open = this._open.has(id);
    d.addEventListener("toggle", () => (d.open ? this._open.add(id) : this._open.delete(id)));
    const s = document.createElement("summary");
    s.textContent = title;
    d.append(s, content);
    return d;
  }

  _box(...children) {
    const div = document.createElement("div");
    div.className = "box";
    div.append(...children.filter(Boolean));
    return div;
  }

  _grid(...children) {
    const div = document.createElement("div");
    div.className = "grid";
    div.append(...children.filter(Boolean));
    return div;
  }

  _imageField(obj, label) {
    const wrap = document.createElement("div");
    wrap.className = "image-field";

    const preview = document.createElement("div");
    preview.className = "preview";
    if (obj.image) preview.innerHTML = `<img src="${esc(obj.image)}" alt="">`;
    else if (obj.icon) preview.innerHTML = `<ha-icon icon="${esc(obj.icon)}"></ha-icon>`;
    else preview.innerHTML = `<span class="none">—</span>`;

    const fields = document.createElement("div");
    fields.className = "image-inputs";

    const icon = this._sel(`${label} – ikona (mdi)`, { icon: {} }, obj.icon ?? "", (v) => {
      this._set(obj, "icon", v);
      if (!obj.image) preview.innerHTML = v ? `<ha-icon icon="${esc(v)}"></ha-icon>` : `<span class="none">—</span>`;
    });

    const isData = String(obj.image || "").startsWith("data:");
    const url = this._sel(
      `${label} – obrázek (URL, např. /local/logo.png)`,
      { text: {} },
      isData ? "" : obj.image ?? "",
      (v) => this._set(obj, "image", v, true)
    );
    if (isData) url.helper = "Nahraný obrázek je uložen přímo v konfiguraci.";

    const actions = document.createElement("div");
    actions.className = "actions";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "Nahrát obrázek…";
    up.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      up.disabled = true;
      up.textContent = "Nahrávám…";
      try {
        const src = await uploadImage(this._hass, file);
        this._set(obj, "image", src, true);
      } catch (e) {
        up.disabled = false;
        up.textContent = "Chyba – zkusit znovu";
      }
    });
    actions.append(up, input);
    if (obj.image) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "secondary";
      rm.textContent = "Odebrat obrázek";
      rm.addEventListener("click", () => this._set(obj, "image", null, true));
      actions.append(rm);
    }

    fields.append(icon, url, actions);
    wrap.append(preview, fields);
    return wrap;
  }

  _groupOptions() {
    return [
      { value: "-1", label: "— bez barvy —" },
      ...(this._config.groups || []).map((g, i) => ({ value: String(i), label: g.name || `Skupina ${i + 1}` })),
    ];
  }

  /* --- sekce --- */

  _generalSection() {
    const c = this._config;
    const rowCount = this._sel("Počet řádků", { number: { min: 1, max: 50, mode: "box" } }, (c.rows || []).length, (v) => {
      const n = Math.max(0, Math.min(50, parseInt(v, 10) || 0));
      const rows = c.rows || [];
      while (rows.length < n) rows.push({ name: `Řádek ${rows.length + 1}`, group: 0 });
      rows.length = n;
      c.rows = rows;
      this._commit(true);
    });

    const bool = (label, key) =>
      this._sel(label, { boolean: {} }, c[key] !== false, (v) => this._set(c, key, v ? null : false));

    return this._box(
      this._text("Nadpis", c, "title"),
      this._imageField(c, "Logo"),
      rowCount,
      this._grid(
        this._text("Záhlaví sloupce pořadí", c, "position_header", "#"),
        this._text("Záhlaví sloupce názvu", c, "name_header", "Název")
      ),
      this._grid(bool("Zobrazit pořadí", "show_position"), bool("Zobrazit legendu", "show_legend"))
    );
  }

  _columnsSection() {
    const c = this._config;
    const box = this._box();
    const note = document.createElement("p");
    note.className = "note";
    note.textContent =
      "Sloupec se zobrazí jen tehdy, když je aspoň v jednom řádku vybraná entita. Záhlaví i texty stavů můžete přejmenovat.";
    box.append(note);

    for (const key of COLUMN_ORDER) {
      const def = COLUMN_TYPES[key];
      const col = (c.columns?.[key]) || {};
      const clean = () => {
        c.columns = c.columns || {};
        c.columns[key] = col;
      };
      const text = (label, k, ph) =>
        this._sel(label, { text: {} }, col[k] ?? "", (v) => {
          clean();
          this._set(col, k, v);
        });

      const inner = this._box();
      const header = text("Název sloupce (záhlaví)", "header", def.header);
      header.helper = `Výchozí: ${def.header}`;
      inner.append(header);

      if (def.kind === "numeric") {
        const unit = text("Jednotka", "unit", def.unit);
        unit.helper = `Výchozí: ${def.unit}`;
        const dec = this._sel("Desetinná místa", { number: { min: 0, max: 3, mode: "box" } }, col.decimals ?? def.decimals, (v) => {
          clean();
          this._set(col, "decimals", v === def.decimals ? null : v);
        });
        inner.append(this._grid(unit, dec));
      } else {
        const on = text("Text při zapnuto / otevřeno", "on_text", def.on_text);
        on.helper = `Výchozí: ${def.on_text}`;
        const off = text("Text při vypnuto / zavřeno", "off_text", def.off_text);
        off.helper = `Výchozí: ${def.off_text}`;
        const display = this._sel(
          "Zobrazení",
          {
            select: {
              mode: "dropdown",
              options: [
                { value: "text", label: "Text" },
                { value: "icon", label: "Ikona" },
                { value: "both", label: "Ikona + text" },
              ],
            },
          },
          col.display || "text",
          (v) => {
            clean();
            this._set(col, "display", v === "text" ? null : v);
          }
        );
        const color = document.createElement("label");
        color.className = "color";
        color.innerHTML = `<span>Barva aktivního stavu</span>`;
        const ci = document.createElement("input");
        ci.type = "color";
        ci.value = col.color || def.color;
        ci.addEventListener("change", () => {
          clean();
          this._set(col, "color", ci.value === def.color ? null : ci.value);
        });
        color.append(ci);
        inner.append(this._grid(on, off), this._grid(display, color));
      }

      const bold = this._sel(
        "Tučně (výchozí: poslední sloupec)",
        { select: { mode: "dropdown", options: [{ value: "auto", label: "Automaticky" }, { value: "yes", label: "Ano" }, { value: "no", label: "Ne" }] } },
        col.bold === true ? "yes" : col.bold === false ? "no" : "auto",
        (v) => {
          clean();
          this._set(col, "bold", v === "yes" ? true : v === "no" ? false : null);
        }
      );
      const show = this._sel("Zobrazit sloupec", { boolean: {} }, col.show !== false, (v) => {
        clean();
        this._set(col, "show", v ? null : false);
      });
      inner.append(this._grid(bold, show));

      box.append(this._section(`col-${key}`, def.label, inner));
    }
    return box;
  }

  _groupsSection() {
    const c = this._config;
    c.groups = c.groups || [];
    const box = this._box();
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Skupiny určují barvu čtverečku s pořadím a položky legendy pod tabulkou.";
    box.append(note);

    c.groups.forEach((g, i) => {
      const line = document.createElement("div");
      line.className = "group-line";
      const ci = document.createElement("input");
      ci.type = "color";
      ci.value = g.color || "#43a047";
      ci.addEventListener("change", () => this._set(g, "color", ci.value));
      const name = this._sel(`Skupina ${i + 1} – název`, { text: {} }, g.name ?? "", (v) => {
        this._set(g, "name", v);
        const sel = { select: { mode: "dropdown", options: this._groupOptions() } };
        for (const s of this._groupSelectors) s.selector = sel;
      });
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "secondary";
      rm.textContent = "✕";
      rm.title = "Odebrat skupinu";
      rm.addEventListener("click", () => {
        c.groups.splice(i, 1);
        for (const r of c.rows || []) {
          if (r.group === i) delete r.group;
          else if (r.group > i) r.group -= 1;
        }
        this._commit(true);
      });
      line.append(ci, name, rm);
      box.append(line);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "+ Přidat skupinu";
    add.addEventListener("click", () => {
      c.groups.push({ name: `Skupina ${c.groups.length + 1}`, color: "#9e9e9e" });
      this._commit(true);
    });
    box.append(add);
    return box;
  }

  _rowsSection() {
    const c = this._config;
    c.rows = c.rows || [];
    const box = this._box();

    c.rows.forEach((row, i) => {
      const inner = this._box();

      inner.append(this._text("Název", row, "name"));
      inner.append(this._imageField(row, "Ikona řádku"));

      const group = this._sel(
        "Skupina (barva pořadí)",
        { select: { mode: "dropdown", options: this._groupOptions() } },
        String(Number.isInteger(row.group) ? row.group : -1),
        (v) => this._set(row, "group", v === "-1" ? null : parseInt(v, 10))
      );
      this._groupSelectors.push(group);
      inner.append(group);

      const ents = document.createElement("div");
      ents.className = "entities";
      for (const key of COLUMN_ORDER) {
        const def = COLUMN_TYPES[key];
        ents.append(
          this._sel(def.label, { entity: { filter: def.filter } }, row[key] ?? "", (v) => this._set(row, key, v || null))
        );
      }
      inner.append(ents);

      const actions = document.createElement("div");
      actions.className = "actions";
      const mk = (label, fn, disabled, cls) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.disabled = disabled;
        if (cls) b.className = cls;
        b.addEventListener("click", fn);
        actions.append(b);
      };
      const move = (d) => {
        const [r] = c.rows.splice(i, 1);
        c.rows.splice(i + d, 0, r);
        this._open.delete(`row-${i}`);
        this._open.add(`row-${i + d}`);
        this._commit(true);
      };
      mk("▲ Nahoru", () => move(-1), i === 0);
      mk("▼ Dolů", () => move(1), i === c.rows.length - 1);
      mk("Odebrat řádek", () => {
        c.rows.splice(i, 1);
        this._commit(true);
      }, false, "secondary");
      inner.append(actions);

      box.append(this._section(`row-${i}`, `${i + 1}. ${row.name || "(bez názvu)"}`, inner));
    });

    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "+ Přidat řádek";
    add.addEventListener("click", () => {
      c.rows.push({ name: `Řádek ${c.rows.length + 1}`, group: 0 });
      this._open.add(`row-${c.rows.length - 1}`);
      this._commit(true);
    });
    box.append(add);
    return box;
  }

  _render() {
    if (!this._config || !this._hass || !customElements.get("ha-selector")) return;
    this._rendered = true;
    this._selectors = [];
    this._groupSelectors = [];

    const root = this.shadowRoot;
    root.innerHTML = `<style>${EntityLeagueCardEditor.styles}</style>`;
    const container = document.createElement("div");
    container.className = "editor";
    container.append(
      this._section("general", "Obecné", this._generalSection()),
      this._section("rows", `Řádky (${(this._config.rows || []).length})`, this._rowsSection()),
      this._section("columns", "Sloupce entit", this._columnsSection()),
      this._section("groups", "Skupiny a legenda", this._groupsSection())
    );
    root.append(container);
  }

  static get styles() {
    return `
      .editor { display: flex; flex-direction: column; gap: 8px; }
      details.section { border: 1px solid var(--divider-color); border-radius: 8px; }
      details.section > summary {
        cursor: pointer; padding: 10px 12px; font-weight: 500; user-select: none;
      }
      details.section[open] > summary { border-bottom: 1px solid var(--divider-color); }
      .box { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; }
      .box .box { padding: 10px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: center; }
      .entities { display: flex; flex-direction: column; gap: 8px; }
      .note { margin: 0; font-size: 12px; color: var(--secondary-text-color); }
      .image-field { display: flex; gap: 12px; align-items: flex-start; }
      .image-field .preview {
        width: 48px; height: 48px; flex: none; border-radius: 6px; display: flex;
        align-items: center; justify-content: center; background: var(--secondary-background-color);
        --mdc-icon-size: 30px; margin-top: 6px;
      }
      .image-field .preview img { max-width: 40px; max-height: 40px; object-fit: contain; }
      .image-field .none { color: var(--secondary-text-color); }
      .image-inputs { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      button {
        font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 6px; cursor: pointer;
        border: 1px solid var(--primary-color); background: var(--primary-color);
        color: var(--text-primary-color, #fff); align-self: flex-start;
      }
      button.secondary { background: transparent; color: var(--primary-color); }
      button:disabled { opacity: .4; cursor: default; }
      .group-line { display: flex; gap: 10px; align-items: center; }
      .group-line ha-selector { flex: 1; }
      input[type=color] { width: 40px; height: 32px; border: none; padding: 0; background: none; cursor: pointer; }
      label.color { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 14px; }
      @media (max-width: 450px) { .grid { grid-template-columns: 1fr; } }
    `;
  }
}

customElements.define("entity-league-card", EntityLeagueCard);
customElements.define("entity-league-card-editor", EntityLeagueCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "entity-league-card",
  name: "Entity League Card",
  description: "Tabulka ve stylu ligové tabulky s vlastními názvy, ikonami a entitami (teplota, vlhkost, světla, okna, pohyb, zaplavení, spínače).",
  preview: true,
  documentationURL: "https://github.com/joshuaaaaa/HA-Entity",
});

console.info(`%c ENTITY-LEAGUE-CARD %c v${CARD_VERSION} `, "color:#fff;background:#43a047;font-weight:700", "color:#43a047;background:#fff");
