import { NewtSkillStore } from "../newt-skills.js";

export function registerNewtSkillRoutes(app, dependencies) {
  const store = new NewtSkillStore(dependencies);
  const wrap = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (error) { res.status(error.status || 500).json({ error: error.message || "Could not load Newt skills." }); }
  };
  app.get("/api/my-newt/skills", wrap(() => store.publicList()));
  app.post("/api/my-newt/skills/:id", wrap(req => store.update(req.params.id, req.body)));
  app.post("/api/my-newt/skills/:id/reset", wrap(req => store.update(req.params.id, req.body, true)));
  return store;
}
