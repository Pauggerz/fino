import { Router } from 'express';
import { parseReceipt } from '../controllers/receipt.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/parse-receipt', requireAuth, parseReceipt);

export default router;