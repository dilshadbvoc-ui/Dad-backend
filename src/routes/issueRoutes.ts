import express from 'express';
import {
    createIssue,
    getMyIssues,
    getAllIssuesForAdmin,
    getIssueById,
    addReply,
    updateIssueStatus,
    deleteReply
} from '../controllers/issueController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.use(protect);

// Order matters: static paths before the /:id catch-all.
router.get('/mine', getMyIssues);
router.get('/admin/all', getAllIssuesForAdmin); // super-admin check happens in the controller

router.post('/', createIssue);
router.get('/:id', getIssueById);
router.post('/:id/replies', addReply);
router.delete('/:id/replies/:replyId', deleteReply);
router.put('/:id/status', updateIssueStatus); // super-admin check happens in the controller

export default router;
