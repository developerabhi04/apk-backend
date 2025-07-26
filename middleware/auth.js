import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();


export const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ msg: 'No token' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) { res.status(401).json({ msg: 'Invalid token' }); }
};