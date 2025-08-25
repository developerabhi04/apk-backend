import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

/* POST /api/admin-login */
export const adminLogin = (req, res) => {
  const { username, password } = req.body;

  if (
    username !== process.env.ADMIN_USER ||
    password !== process.env.ADMIN_PASS
  ) {
    return res.status(401).json({ msg: "Bad creds" });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "12h",          // short-lived token
  });
  res.json({ token });
};

/* POST /api/admin-refresh  (token already validated by auth middleware) */
export const adminRefresh = (req, res) => {
  const { username } = req.user;          // added by auth middleware
  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "12h",
  });
  res.json({ token });
};
