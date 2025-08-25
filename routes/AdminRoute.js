import express from 'express';
import { adminLogin, adminRefresh } from '../controllers/AdminController.js';
import auth from '../middleware/auth.js';


const router = express.Router();

// Admin login (no auth required)
router.post('/admin-login', adminLogin);
router.post("/admin-refresh", auth, adminRefresh);




export default router;