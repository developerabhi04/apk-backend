
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

/* Hard-coded admin for demo; replace with DB user table */


/* POST /api/admin/login */
export const adminLogin = (req,res)=>{
  const { username, password } = req.body;
  if(username!==process.env.ADMIN_USER || password!==process.env.ADMIN_PASS)
      return res.status(401).json({msg:'Bad creds'});
  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn:'12h' });
  res.json({ token });
};