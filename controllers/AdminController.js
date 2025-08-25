import jwt from "jsonwebtoken";

export const adminLogin = (req, res) => {
  const { username, password } = req.body || {};
  console.log(req.body)
  console.log("⇢ DEBUG-LOGIN:", { username, password });   // ← add this

  if (
    username !== process.env.ADMIN_USER ||
    password !== process.env.ADMIN_PASS
  ) return res.status(401).json({ msg: "Bad creds" });

  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "15d",
  });
  res.json({ token });
};


/* POST /api/admin-refresh  (validates token first) */
export const refresh = (req, res) => {
  const { username } = req.user;      // set by auth middleware
  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "15d",
  });
  res.json({ token });
};
