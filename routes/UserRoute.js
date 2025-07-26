import express from 'express';
import { deleteAll, getUsers, register, updateStatus } from '../controllers/UserController.js';


const router = express.Router();

router.post('/register', register);
router.post('/update-status', updateStatus);
router.get('/users', getUsers);
router.delete('/users', deleteAll);

export default router;
