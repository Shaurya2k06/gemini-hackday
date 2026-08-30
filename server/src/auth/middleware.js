export function requireAuth(req, res, next) {
  if (req.session?.userId) {
    next();
    return;
  }
  res.status(401).json({ error: "Authentication required" });
}

export function attachUser(req, _res, next) {
  req.userId = req.session?.userId ?? null;
  req.username = req.session?.username ?? null;
  next();
}
