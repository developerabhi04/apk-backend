import express from 'express';
import { adminLogin } from '../controllers/AdminController.js';


const router = express.Router();

// Admin login (no auth required)
router.post('/admin-login', adminLogin);




export default router;