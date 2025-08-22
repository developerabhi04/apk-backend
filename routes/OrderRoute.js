import { Router } from 'express';
import { confirmOrder } from '../controllers/OrderController.js';

const router = Router();

// Confirm order endpoint
router.post('/confirm-order', confirmOrder);

export default router;
