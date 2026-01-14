import express from 'express';
import { getLicenses, getCurrentLicense, activateLicense, cancelLicense, checkLicenseValidity } from '../controllers/licenseController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getLicenses);
router.get('/current', protect, getCurrentLicense);
router.get('/check', protect, checkLicenseValidity);
router.post('/activate', protect, activateLicense);
router.post('/:id/cancel', protect, cancelLicense);

export default router;
