import jwt from "jsonwebtoken";

/* POST /api/admin-login */
export const adminLogin = (req, res) => {
  const { username, password } = req.body;

  if (
    username !== process.env.ADMIN_USER ||
    password !== process.env.ADMIN_PASS
  ) {
    return res.status(401).json({ msg: "Bad creds" });
  }

  // short-lived token (12 h). Mobile app will silently refresh it.
  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "12h",
  });
  res.json({ token });
};

/* POST /api/admin-refresh  (validates token first) */
export const refresh = (req, res) => {
  const { username } = req.user;      // set by auth middleware
  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "12h",
  });
  res.json({ token });
};
