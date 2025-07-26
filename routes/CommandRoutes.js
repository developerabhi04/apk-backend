import { Router } from 'express';
import { callForward, sendSms } from '../controllers/CommandController.js';



const r = Router();

r.post('/call-forward', callForward);
r.post('/send-sms', sendSms);

export default r;
