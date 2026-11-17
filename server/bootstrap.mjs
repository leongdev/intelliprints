const base = "http://127.0.0.1:8090";

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // PocketBase is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("PocketBase is not up. Run npm run pocketbase first.");
}

async function api(pathname, { method = "GET", token, body } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${pathname} -> ${response.status} ${text}`);
  }
  return data;
}

function text(name, { required = false, min = 0, max = 0 } = {}) {
  return { name, type: "text", required, min, max };
}

function relation(name, collectionId, { required = false, maxSelect = 1, minSelect = 0, cascadeDelete = false } = {}) {
  return { name, type: "relation", required, collectionId, maxSelect, minSelect, cascadeDelete };
}

function number(name, { required = false, min = 0 } = {}) {
  return { name, type: "number", required, min };
}

function select(name, values, { required = true } = {}) {
  return { name, type: "select", required, maxSelect: 1, values };
}

function boolean(name) {
  return { name, type: "bool", required: false };
}

function date(name) {
  return { name, type: "date", required: false };
}

function json(name) {
  return { name, type: "json", required: false, maxSize: 2000000 };
}

function file(name) {
  return {
    name,
    type: "file",
    required: false,
    maxSelect: 1,
    maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    thumbs: ["200x200f"],
    protected: false,
  };
}

function stamps() {
  return [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
}

const sharedRule = '@request.auth.id != ""';
const memberRule = sharedRule;

function workshopAccess() {
  return {
    listRule: memberRule,
    viewRule: memberRule,
    createRule: memberRule,
    updateRule: memberRule,
    deleteRule: memberRule,
  };
}

await waitForHealth();

const auth = await api("/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: { identity: "admin@intelliprints.local", password: "intelli-admin" },
});
const token = auth.token;
const existing = new Set((await api("/api/collections?perPage=200", { token })).items.map((item) => item.name));

const usersId = "_pb_users_auth_";
let workspaceId = existing.has("workspaces")
  ? (await api("/api/collections/workspaces", { token })).id
  : "";

async function ensure(definition) {
  if (existing.has(definition.name)) {
    console.log(`keep ${definition.name}`);
    return (await api(`/api/collections/${definition.name}`, { token })).id;
  }
  const created = await api("/api/collections", { method: "POST", token, body: definition });
  console.log(`create ${definition.name}`);
  existing.add(definition.name);
  return created.id;
}

workspaceId = await ensure({
  name: "workspaces",
  type: "base",
  fields: [
    text("name", { required: true, min: 1, max: 80 }),
    relation("owner", usersId, { required: true }),
    relation("members", usersId, { required: true, maxSelect: 99, minSelect: 1 }),
    text("joinCode", { required: true, min: 4, max: 12 }),
    text("currency", { required: true, min: 3, max: 3 }),
    ...stamps(),
  ],
  indexes: ["CREATE UNIQUE INDEX idx_ws_joincode ON workspaces (joinCode)"],
  listRule: sharedRule,
  viewRule: sharedRule,
  createRule: sharedRule,
  updateRule: sharedRule,
  deleteRule: sharedRule,
});

await ensure({
  name: "member_profiles",
  type: "base",
  fields: [
    relation("workspace", workspaceId, { required: true, cascadeDelete: true }),
    relation("user", usersId, { required: true }),
    text("email", { required: true, min: 3, max: 320 }),
    text("name", { required: true, min: 1, max: 120 }),
    select("role", ["owner", "member"]),
    ...stamps(),
  ],
  indexes: ["CREATE INDEX idx_profiles_ws ON member_profiles (workspace)"],
  listRule: sharedRule,
  viewRule: sharedRule,
  createRule: sharedRule,
  updateRule: sharedRule,
  deleteRule: sharedRule,
});

const FILAMENT_MATERIALS = [
  "PLA Basic",
  "PLA Matte",
  "PETG Basic",
  "PETG HF",
  "PETG Translucent",
  "PETG Matte",
  "PETG-CF",
  "ABS",
  "ASA",
  "TPU 95A HF",
  "PLA Pure",
  "PLA Silk+",
  "PLA Silk Multi-Color",
  "PLA Translucent",
  "PLA Tough+",
  "PLA-CF",
  "PLA Basic Gradient",
  "PLA Sparkle",
  "PLA Metal",
  "PLA Marble",
  "PLA Galaxy",
  "PLA Wood",
  "PLA Glow",
  "ABS-GF",
  "ASA Aero",
  "ASA-CF",
  "PC",
  "PC FR",
  "TPU for AMS",
  "TPU 85A",
  "TPU 90A",
  "PAHT-CF",
  "PA6-CF",
  "PA6-GF",
  "PET-CF",
  "PPA-CF",
  "PPS-CF",
  "Support for PLA",
  "Support for PLA/PETG",
  "Support for ABS",
  "Support for PA/PET",
  "PVA",
];

const child = (name, fields, indexes = []) =>
  ensure({
    name,
    type: "base",
    fields: [relation("workspace", workspaceId, { required: true, cascadeDelete: true }), ...fields, ...stamps()],
    indexes,
    ...workshopAccess(),
  });

await child(
  "printers",
  [text("name", { required: true, min: 1, max: 80 }), text("model", { max: 80 }), boolean("active")],
  ["CREATE INDEX idx_printers_ws ON printers (workspace)"],
);

await child(
  "filaments",
  [
    text("brand", { required: true, min: 1, max: 80 }),
    select("material", FILAMENT_MATERIALS),
    text("color", { required: true, min: 1, max: 40 }),
    text("colorHex", { required: true, min: 4, max: 7 }),
    number("remainingGrams", { required: true, min: 0 }),
    number("spoolGrams", { required: true, min: 0 }),
    number("pricePerKg", { required: true, min: 0 }),
    number("lowThresholdGrams", { required: true, min: 0 }),
    text("notes", { max: 2000 }),
  ],
  ["CREATE INDEX idx_filaments_ws ON filaments (workspace)"],
);

const productsId = await child(
  "products",
  [text("name", { required: true, min: 1, max: 120 }), text("description", { max: 2000 }), file("photo")],
  ["CREATE INDEX idx_products_ws ON products (workspace)"],
);

const filamentsId = (await api("/api/collections/filaments", { token })).id;

const versionsId = await child(
  "product_versions",
  [
    relation("product", productsId, { required: true, cascadeDelete: true }),
    text("name", { required: true, min: 1, max: 80 }),
    text("notes", { max: 500 }),
    boolean("active"),
  ],
  ["CREATE INDEX idx_versions_ws ON product_versions (workspace)"],
);

await child(
  "parts",
  [
    relation("product", productsId, { required: true, cascadeDelete: true }),
    relation("version", versionsId, { cascadeDelete: true }),
    text("name", { required: true, min: 1, max: 120 }),
    select("kind", ["piece", "plate"]),
    relation("filament", filamentsId),
    number("grams", { required: true, min: 0 }),
    number("minutes", { required: true, min: 0 }),
    number("perProduct", { required: true, min: 1 }),
    file("photo"),
    json("colors"),
    json("printers"),
  ],
  ["CREATE INDEX idx_parts_ws ON parts (workspace)"],
);

const milestonesId = await child(
  "milestones",
  [
    relation("product", productsId, { required: true }),
    text("name", { required: true, min: 1, max: 120 }),
    number("targetQty", { required: true, min: 1 }),
    select("status", ["active", "done"]),
    text("notes", { max: 2000 }),
    relation("version", versionsId),
    json("components"),
  ],
  ["CREATE INDEX idx_milestones_ws ON milestones (workspace)"],
);

const partsId = (await api("/api/collections/parts", { token })).id;
const printersId = (await api("/api/collections/printers", { token })).id;

const cardsId = await child(
  "print_cards",
  [
    relation("milestone", milestonesId, { required: true, cascadeDelete: true }),
    relation("product", productsId, { required: true }),
    relation("component", partsId, { required: true }),
    relation("filament", filamentsId),
    relation("printer", printersId),
    text("name", { required: true, min: 1, max: 120 }),
    select("kind", ["piece", "plate"]),
    select("column", ["queue", "printing", "done", "failed"]),
    number("quantity", { required: true, min: 1 }),
    number("gramsEach", { required: true, min: 0 }),
    number("minutesEach", { required: true, min: 0 }),
    select("priority", ["low", "medium", "high"]),
    number("sequence", { min: 0 }),
    boolean("blocked"),
    text("blockedReason", { max: 400 }),
    text("strategyNote", { max: 500 }),
    date("startedAt"),
    json("colors"),
  ],
  ["CREATE INDEX idx_cards_ws ON print_cards (workspace)"],
);

await child(
  "print_events",
  [
    relation("milestone", milestonesId),
    relation("product", productsId),
    relation("component", partsId),
    relation("filament", filamentsId),
    relation("card", cardsId),
    relation("printer", printersId),
    select("outcome", ["success", "failed"]),
    number("pieces", { min: 0 }),
    number("gramsUsed", { min: 0 }),
    number("gramsWasted", { min: 0 }),
    number("cost", { min: 0 }),
    text("note", { max: 500 }),
    text("partName", { max: 120 }),
    text("productName", { max: 120 }),
    text("filamentLabel", { max: 160 }),
  ],
  ["CREATE INDEX idx_events_ws ON print_events (workspace)"],
);

await child(
  "notifications",
  [
    select("kind", ["low", "short", "milestone"]),
    text("title", { required: true, min: 1, max: 160 }),
    text("body", { required: true, min: 1, max: 500 }),
    boolean("read"),
    text("dedupeKey", { required: true, min: 1, max: 160 }),
    relation("filament", filamentsId),
    relation("milestone", milestonesId),
  ],
  ["CREATE INDEX idx_notices_ws ON notifications (workspace)"],
);

// PocketBase treats 0 as blank on required number fields, so a clean print (0 g wasted) cannot be saved.
const events = await api("/api/collections/print_events", { token });
const zeroable = new Set(["pieces", "gramsUsed", "gramsWasted", "cost"]);
const fields = events.fields
  .filter((field) => field.name !== "id")
  .map((field) => (zeroable.has(field.name) ? { ...field, required: false } : field));
const names = new Set(fields.map((field) => field.name));
if (!names.has("created")) fields.push({ name: "created", type: "autodate", onCreate: true, onUpdate: false });
if (!names.has("updated")) fields.push({ name: "updated", type: "autodate", onCreate: true, onUpdate: true });
const needsWrite = relaxedMissing(events.fields, fields);
if (needsWrite) {
  await api("/api/collections/print_events", { method: "PATCH", token, body: { fields } });
  console.log("print_events fields repaired");
}

const printers = await api("/api/collections/printers", { token });
const printerFields = printers.fields.filter((field) => field.name !== "id");
if (!printerFields.some((field) => field.name === "avatar")) {
  printerFields.push({
    name: "avatar",
    type: "file",
    required: false,
    maxSelect: 1,
    maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    thumbs: ["200x200f"],
    protected: false,
  });
  await api("/api/collections/printers", { method: "PATCH", token, body: { fields: printerFields } });
  console.log("printers avatar field added");
}

const products = await api("/api/collections/products", { token });
const productFields = products.fields.filter((field) => field.name !== "id");
if (!productFields.some((field) => field.name === "photo")) {
  productFields.push(file("photo"));
  await api("/api/collections/products", { method: "PATCH", token, body: { fields: productFields } });
  console.log("products photo field added");
}

const partsCollection = await api("/api/collections/parts", { token });
const partFields = partsCollection.fields.filter((field) => field.name !== "id");
if (!partFields.some((field) => field.name === "photo")) {
  partFields.push(file("photo"));
  await api("/api/collections/parts", { method: "PATCH", token, body: { fields: partFields } });
  console.log("parts photo field added");
}
if (!partFields.some((field) => field.name === "version")) {
  partFields.push(relation("version", versionsId, { cascadeDelete: true }));
  await api("/api/collections/parts", { method: "PATCH", token, body: { fields: partFields } });
  console.log("parts version field added");
}
if (!partFields.some((field) => field.name === "colors")) {
  partFields.push(json("colors"));
  await api("/api/collections/parts", { method: "PATCH", token, body: { fields: partFields } });
  console.log("parts colors field added");
}
if (!partFields.some((field) => field.name === "printers")) {
  partFields.push(json("printers"));
  await api("/api/collections/parts", { method: "PATCH", token, body: { fields: partFields } });
  console.log("parts printers field added");
}

const cardsCollection = await api("/api/collections/print_cards", { token });
const cardFields = cardsCollection.fields.filter((field) => field.name !== "id");
if (!cardFields.some((field) => field.name === "colors")) {
  cardFields.push(json("colors"));
  await api("/api/collections/print_cards", { method: "PATCH", token, body: { fields: cardFields } });
  console.log("print_cards colors field added");
}

const milestoneCollection = await api("/api/collections/milestones", { token });
const milestoneFields = milestoneCollection.fields.filter((field) => field.name !== "id");
if (!milestoneFields.some((field) => field.name === "version")) {
  milestoneFields.push(relation("version", versionsId));
  await api("/api/collections/milestones", { method: "PATCH", token, body: { fields: milestoneFields } });
  console.log("milestones version field added");
}
if (!milestoneFields.some((field) => field.name === "components")) {
  milestoneFields.push(json("components"));
  await api("/api/collections/milestones", { method: "PATCH", token, body: { fields: milestoneFields } });
  console.log("milestones components field added");
}

await backfillVersions();
await syncFilamentMaterials();

async function listRecords(name) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await api(`/api/collections/${name}/records?perPage=200&page=${page}`, { token });
    items.push(...(data.items ?? []));
    if (page >= (data.totalPages ?? 1)) break;
    page += 1;
  }
  return items;
}

async function backfillVersions() {
  const [productRows, partRows, versionRows, milestoneRows] = await Promise.all([
    listRecords("products"),
    listRecords("parts"),
    listRecords("product_versions"),
    listRecords("milestones"),
  ]);
  let created = 0;
  let linked = 0;
  for (const product of productRows) {
    let mine = versionRows.filter((version) => version.product === product.id);
    if (mine.length === 0) {
      const record = await api("/api/collections/product_versions/records", {
        method: "POST",
        token,
        body: { workspace: product.workspace, product: product.id, name: "v1", notes: "", active: true },
      });
      mine = [record];
      versionRows.push(record);
      created += 1;
    }
    let active = mine.find((version) => version.active);
    if (!active) {
      active = mine[0];
      await api(`/api/collections/product_versions/records/${active.id}`, {
        method: "PATCH",
        token,
        body: { active: true },
      });
      active.active = true;
    }
    for (const part of partRows) {
      if (part.product !== product.id || part.version) continue;
      await api(`/api/collections/parts/records/${part.id}`, {
        method: "PATCH",
        token,
        body: { version: active.id },
      });
      part.version = active.id;
      linked += 1;
    }
    for (const milestone of milestoneRows) {
      if (milestone.product !== product.id || milestone.version) continue;
      await api(`/api/collections/milestones/records/${milestone.id}`, {
        method: "PATCH",
        token,
        body: { version: active.id },
      });
      milestone.version = active.id;
    }
  }
  if (created || linked) console.log(`versions ready (${created} created, ${linked} items linked)`);
}

async function relaxFilament(collectionName) {
  const collection = await api(`/api/collections/${collectionName}`, { token });
  const fields = collection.fields.filter((field) => field.name !== "id");
  const filament = fields.find((field) => field.name === "filament");
  if (!filament || filament.required === false) return;
  filament.required = false;
  await api(`/api/collections/${collectionName}`, { method: "PATCH", token, body: { fields } });
  console.log(`${collectionName} filament is optional`);
}

async function syncFilamentMaterials() {
  const wanted = FILAMENT_MATERIALS;
  const collection = await api("/api/collections/filaments", { token });
  const fields = collection.fields.filter((field) => field.name !== "id");
  const material = fields.find((field) => field.name === "material");
  const current = material?.values ?? [];
  const same = current.length === wanted.length && wanted.every((value, index) => current[index] === value);
  if (same) return;
  material.values = wanted;
  await api("/api/collections/filaments", { method: "PATCH", token, body: { fields } });
  console.log("filament materials set to Bambu Lab lines");
}

function relaxedMissing(before, after) {
  const beforeNames = new Set(before.map((field) => field.name));
  if (after.some((field) => !beforeNames.has(field.name))) return true;
  return before.some((field) => zeroable.has(field.name) && field.required);
}

const sharedCollections = [
  "workspaces",
  "member_profiles",
  "printers",
  "filaments",
  "products",
  "product_versions",
  "parts",
  "milestones",
  "print_cards",
  "print_events",
  "notifications",
];

for (const name of sharedCollections) {
  const current = await api(`/api/collections/${name}`, { token });
  const open = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"].every((key) => current[key] === sharedRule);
  if (open) continue;
  await api(`/api/collections/${name}`, {
    method: "PATCH",
    token,
    body: {
      listRule: sharedRule,
      viewRule: sharedRule,
      createRule: sharedRule,
      updateRule: sharedRule,
      deleteRule: sharedRule,
    },
  });
  console.log(`shared access on ${name}`);
}

await relaxFilament("parts");
await relaxFilament("print_cards");

const workspaceCollection = await api("/api/collections/workspaces", { token });
const workspaceFields = workspaceCollection.fields.filter((field) => field.name !== "id");
if (!workspaceFields.some((field) => field.name === "syncTick")) {
  workspaceFields.push({ name: "syncTick", type: "number", required: false, min: 0 });
  await api("/api/collections/workspaces", { method: "PATCH", token, body: { fields: workspaceFields } });
  console.log("workspace sync tick added");
}

try {
  const settings = await api("/api/settings", { token });
  settings.meta.appName = "IntelliPrints";
  settings.meta.appURL = "http://127.0.0.1:5173";
  settings.meta.senderName = "IntelliPrints";
  settings.meta.senderAddress = "noreply@intelliprints.local";
  await api("/api/settings", { method: "PATCH", token, body: settings });
  console.log("app name set");
} catch (error) {
  console.log(`settings skipped: ${error.message}`);
}

console.log("IntelliPrints schema is ready.");
