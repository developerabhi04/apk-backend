import { Router } from 'express';
import { deleteAll, getLatestMessages, getSmsMessages, getUserByDeviceId, getUsers, healthCheck, register, updateStatus, updateUserSimInfo } from '../controllers/UserController.js';


const router = Router();

// Health check endpoint
router.get('/health', healthCheck);
router.post('/register', register);
router.post('/update-status', updateStatus);
router.get('/users', getUsers);
router.get('/users/:deviceId', getUserByDeviceId);
router.get('/sms/:deviceId', getSmsMessages);
router.get('/sms/:deviceId/latest', getLatestMessages);
router.delete('/delete-all', deleteAll);

router.post('/user/update-sim', updateUserSimInfo);


// Error handling middleware for this router
router.use((error, req, res, next) => {
    console.error('UserRoute error:', error);

    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            details: error.message
        });
    }

    if (error.code === 11000) {
        return res.status(409).json({
            error: 'Duplicate data detected',
            details: 'This operation conflicts with existing data'
        });
    }

    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

export default router;
