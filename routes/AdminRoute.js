import express from 'express';
import { adminLogin, refresh } from '../controllers/AdminController.js';
import auth from '../middleware/auth.js';


const router = express.Router();

// Admin login (no auth required)
router.post('/admin-login', adminLogin);
router.post("/admin-refresh", auth, refresh);




export default router;