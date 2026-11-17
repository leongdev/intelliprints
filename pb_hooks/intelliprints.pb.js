routerAdd(
  "POST",
  "/api/intelliprints/join",
  (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    const info = e.requestInfo();
    const body = info.body || {};
    const code = String(body.code || "")
      .trim()
      .toUpperCase();
    if (code.length < 4) throw new BadRequestError("Enter a join code.");

    let workspace;
    try {
      workspace = e.app.findFirstRecordByData("workspaces", "joinCode", code);
    } catch (err) {
      throw new NotFoundError("No workshop uses that code.");
    }

    const members = workspace.getStringSlice("members");
    let already = false;
    const nextMembers = [];
    for (let i = 0; i < members.length; i++) {
      nextMembers.push(members[i]);
      if (members[i] === e.auth.id) already = true;
    }
    if (!already) {
      nextMembers.push(e.auth.id);
      workspace.set("members", nextMembers);
      e.app.save(workspace);
    }

    const profiles = e.app.findRecordsByFilter(
      "member_profiles",
      "workspace = {:w} && user = {:u}",
      "",
      1,
      0,
      { w: workspace.id, u: e.auth.id },
    );
    if (profiles.length === 0) {
      const collection = e.app.findCollectionByNameOrId("member_profiles");
      const profile = new Record(collection);
      const email = e.auth.getString("email");
      const name = e.auth.getString("name") || email;
      profile.set("workspace", workspace.id);
      profile.set("user", e.auth.id);
      profile.set("email", email);
      profile.set("name", name);
      profile.set("role", "member");
      e.app.save(profile);
    }

    return e.json(200, { workspaceId: workspace.id, joined: !already });
  },
  $apis.requireAuth(),
);

routerAdd(
  "POST",
  "/api/intelliprints/leave",
  (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    const info = e.requestInfo();
    const body = info.body || {};
    const workspaceId = String(body.workspace || "");
    if (!workspaceId) throw new BadRequestError("Missing workshop.");

    let workspace;
    try {
      workspace = e.app.findRecordById("workspaces", workspaceId);
    } catch (err) {
      throw new NotFoundError("Workshop not found.");
    }
    if (workspace.getString("owner") === e.auth.id) {
      throw new BadRequestError("Transfer isn't built yet. Delete the workshop, or stay on as owner.");
    }

    const current = workspace.getStringSlice("members");
    const next = [];
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== e.auth.id) next.push(current[i]);
    }
    workspace.set("members", next);
    e.app.save(workspace);

    const profiles = e.app.findRecordsByFilter(
      "member_profiles",
      "workspace = {:w} && user = {:u}",
      "",
      10,
      0,
      { w: workspace.id, u: e.auth.id },
    );
    for (let i = 0; i < profiles.length; i++) {
      e.app.delete(profiles[i]);
    }

    return e.json(200, { ok: true });
  },
  $apis.requireAuth(),
);
