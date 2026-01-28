import express from 'express';
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook } from '../controllers/webhookController';
import { protect } from '../middleware/authMiddleware';
import { MetaIntegrationService } from '../services/MetaIntegrationService';

const router = express.Router();

router.get('/', protect, getWebhooks);
router.post('/', protect, createWebhook);
router.put('/:id', protect, updateWebhook);
router.delete('/:id', protect, deleteWebhook);

// Meta Integration Routes (Public)
router.get('/meta', (req, res) => MetaIntegrationService.verifyWebhook(req, res));

router.post('/meta', async (req, res) => {
    // Send 200 OK immediately to acknowledge receipt to Meta
    res.sendStatus(200);
    try {
        await MetaIntegrationService.handleWebhook(req.body);
    } catch (error) {
        console.error('Error processing Meta webhook:', error);
    }
});

export default router;
