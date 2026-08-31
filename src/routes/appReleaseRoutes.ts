import express from 'express';
import { getLatestRelease, downloadRelease } from '../controllers/appReleaseController';

const router = express.Router();

// Both intentionally public/unauthenticated — the mobile app checks for
// updates before (or regardless of) login, and the public download page
// (pypecrm.com/download) has no auth wall either.
router.get('/latest', getLatestRelease);
router.get('/download/:platform', downloadRelease);

export default router;
