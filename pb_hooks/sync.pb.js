// One writer at a time per workshop, plus atomic stock and job updates.
// SQLite serializes each statement. Lost updates come from read-modify-write
// in the browser, so grams are applied as SQL deltas and a job only moves
// when its column is still the one the client saw.

function ensureLockTable(app) {
  app
    .db()
    .newQuery(
      "CREATE TABLE IF NOT EXISTS ip_write_lock (workspace TEXT PRIMARY KEY, holder TEXT NOT NULL, until TEXT NOT NULL)",
    )
    .execute();
}

function pulse(app, workspaceId) {
  try {
    const ws = app.findRecordById("workspaces", workspaceId);
    ws.set("syncTick", ws.getFloat("syncTick") + 1);
    app.save(ws);
  } catch (err) {
    // The caller reloads either way. A missing tick must not undo the save.
  }
}

const CARD_FIELDS = {
  column: true,
  printer: true,
  startedAt: true,
  quantity: true,
  blocked: true,
  blockedReason: true,
  name: true,
  minutesEach: true,
  gramsEach: true,
  priority: true,
  filament: true,
  sequence: true,
  strategyNote: true,
};

const CREATE_COLLECTIONS = {
  print_cards: true,
  print_events: true,
  notifications: true,
};

function rowsOf(result) {
  if (!result || !result.rowsAffected) return 0;
  return result.rowsAffected();
}

function sqlValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value == null) return "";
  return value;
}

function expectSql(expect, bind) {
  if (Array.isArray(expect)) {
    if (expect.length === 0) throw new BadRequestError("Missing the expected state.");
    const parts = [];
    for (let i = 0; i < expect.length; i++) {
      const key = "expect" + i;
      bind[key] = String(expect[i]);
      parts.push("{:" + key + "}");
    }
    return "column IN (" + parts.join(", ") + ")";
  }
  bind.expect = String(expect || "");
  if (!bind.expect) throw new BadRequestError("Missing the expected state.");
  return "column = {:expect}";
}

function applyStep(tx, workspace, step, state) {
  const op = String((step && step.op) || "");
  if (op === "addGrams") {
    const id = String(step.filament || "");
    const remaining = Number(step.remaining);
    const spool = Number(step.spool);
    if (!id || !isFinite(remaining) || !isFinite(spool)) throw new BadRequestError("Missing spool or grams.");
    const row = new DynamicModel({ grams: 0.5 });
    try {
      tx
        .db()
        .newQuery("SELECT remainingGrams AS grams FROM filaments WHERE id = {:id} AND workspace = {:ws}")
        .bind({ id: id, ws: workspace })
        .one(row);
    } catch (err) {
      throw new BadRequestError("That spool is gone.");
    }
    const before = Number(row.grams);
    const applied = before + remaining;
    if (applied < -0.05) state.overdraw += -applied;
    const updated = tx
      .db()
      .newQuery(
        "UPDATE filaments SET remainingGrams = MAX(0, remainingGrams + {:remaining}), spoolGrams = MAX(0, spoolGrams + {:spool}) WHERE id = {:id} AND workspace = {:ws}",
      )
      .bind({ remaining: remaining, spool: spool, id: id, ws: workspace })
      .execute();
    if (rowsOf(updated) !== 1) throw new BadRequestError("That spool is gone.");
    return;
  }

  if (op === "claim" || op === "patch") {
    const id = String(step.id || "");
    const set = step.set || {};
    if (!id) throw new BadRequestError("Missing the job.");
    const bind = { id: id, ws: workspace };
    const sets = [];
    const keys = Object.keys(set);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!CARD_FIELDS[key]) continue;
      sets.push('"' + key + '" = {:' + key + "}");
      bind[key] = sqlValue(set[key]);
    }
    if (sets.length === 0) throw new BadRequestError("Nothing to update on that job.");
    if (set.column === "printing" && set.printer) {
      const busy = new DynamicModel({ n: 0 });
      tx
        .db()
        .newQuery(
          "SELECT COUNT(*) AS n FROM print_cards WHERE workspace = {:ws} AND printer = {:printer} AND column = 'printing' AND id != {:id}",
        )
        .bind({ ws: workspace, printer: String(set.printer), id: id })
        .one(busy);
      if (Number(busy.n) > 0) throw new BadRequestError("That printer already has a job.");
    }
    let sql =
      "UPDATE print_cards SET " +
      sets.join(", ") +
      " WHERE id = {:id} AND workspace = {:ws} AND " +
      expectSql(step.expect, bind);
    if (set.column === "printing" && set.printer) {
      sql +=
        " AND NOT EXISTS (SELECT 1 FROM print_cards AS busy WHERE busy.workspace = {:ws} AND busy.printer = {:printer} AND busy.column = 'printing' AND busy.id != {:id})";
    }
    const updated = tx.db().newQuery(sql).bind(bind).execute();
    if (rowsOf(updated) !== 1) throw new BadRequestError("That job changed on another screen.");
    return;
  }

  if (op === "take") {
    const id = String(step.id || "");
    const take = Math.round(Number(step.take));
    const expect = String(step.expect || "");
    if (!id || !expect || !isFinite(take) || take < 1) throw new BadRequestError("Can't split that job.");
    const updated = tx
      .db()
      .newQuery(
        "UPDATE print_cards SET quantity = quantity - {:take} WHERE id = {:id} AND workspace = {:ws} AND column = {:expect} AND quantity > {:take}",
      )
      .bind({ take: take, id: id, ws: workspace, expect: expect })
      .execute();
    if (rowsOf(updated) !== 1) throw new BadRequestError("That job changed on another screen.");
    return;
  }

  if (op === "create") {
    const name = String(step.collection || "");
    if (!CREATE_COLLECTIONS[name]) throw new BadRequestError("That save isn't allowed.");
    const fields = step.fields || {};
    const collection = tx.findCollectionByNameOrId(name);
    const rec = new Record(collection);
    rec.set("workspace", workspace);
    const keys = Object.keys(fields);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === "id" || key === "workspace" || key === "collectionId" || key === "expand") continue;
      const value = fields[key];
      if (value == null || value === "") continue;
      rec.set(key, value);
    }
    tx.save(rec);
    return;
  }

  throw new BadRequestError("Unknown save.");
}

$app.store().set("ipSync", {
  ensureLockTable: ensureLockTable,
  pulse: pulse,
  applyStep: applyStep,
  rowsOf: rowsOf,
});

routerAdd(
  "POST",
  "/api/intelliprints/lock",
  (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    try {
      const sync = e.app.store().get("ipSync");
      sync.ensureLockTable(e.app);
      const body = e.requestInfo().body || {};
      const workspace = String(body.workspace || "");
      const holder = String(body.holder || "");
      if (!workspace || !holder) throw new BadRequestError("Missing the workshop lock.");
      const now = new Date().toISOString();
      const until = new Date(Date.now() + 45000).toISOString();
      const result = e.app
        .db()
        .newQuery(
          "INSERT INTO ip_write_lock (workspace, holder, until) VALUES ({:workspace}, {:holder}, {:until}) ON CONFLICT(workspace) DO UPDATE SET holder = {:holder}, until = {:until} WHERE ip_write_lock.until <= {:now} OR ip_write_lock.holder = {:holder}",
        )
        .bind({ workspace: workspace, holder: holder, until: until, now: now })
        .execute();
      if (sync.rowsOf(result) !== 1) throw new ApiError(409, "Another screen is saving.", {});
      return e.json(200, { ok: true });
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err);
      if (err && err.status === 409) throw err;
      throw new BadRequestError(message || "Couldn't lock the workshop.");
    }
  },
  $apis.requireAuth(),
);

routerAdd(
  "POST",
  "/api/intelliprints/unlock",
  (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    const sync = e.app.store().get("ipSync");
    sync.ensureLockTable(e.app);
    const body = e.requestInfo().body || {};
    const workspace = String(body.workspace || "");
    const holder = String(body.holder || "");
    if (!workspace || !holder) throw new BadRequestError("Missing the workshop lock.");
    e.app
      .db()
      .newQuery("DELETE FROM ip_write_lock WHERE workspace = {:workspace} AND holder = {:holder}")
      .bind({ workspace: workspace, holder: holder })
      .execute();
    return e.json(200, { ok: true });
  },
  $apis.requireAuth(),
);

routerAdd(
  "POST",
  "/api/intelliprints/commit",
  (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    const body = e.requestInfo().body || {};
    const workspace = String(body.workspace || "");
    const steps = body.steps;
    if (!workspace) throw new BadRequestError("Missing the workshop.");
    if (!Array.isArray(steps) || steps.length === 0) throw new BadRequestError("Nothing to save.");
    if (steps.length > 40) throw new BadRequestError("That save is too large.");
    try {
      e.app.findRecordById("workspaces", workspace);
    } catch (err) {
      throw new NotFoundError("Workshop not found.");
    }

    const state = { overdraw: 0 };
    let failed = "";
    try {
      e.app.runInTransaction((tx) => {
        for (let i = 0; i < steps.length; i++) {
          try {
            e.app.store().get("ipSync").applyStep(tx, workspace, steps[i], state);
          } catch (err) {
            failed = (err && err.message) || "Couldn't save.";
            throw err;
          }
        }
      });
    } catch (err) {
      throw new BadRequestError(failed || (err && err.message) || "Couldn't save.");
    }

    e.app.store().get("ipSync").pulse(e.app, workspace);
    return e.json(200, { ok: true, overdraw: state.overdraw });
  },
  $apis.requireAuth(),
);
