
import express from 'express';
import { getPipelines, createPipeline, updatePipeline, deletePipeline } from '../controllers/pipelineController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getPipelines);
router.post('/', protect, createPipeline);
router.put('/:id', protect, updatePipeline);
router.delete('/:id', protect, deletePipeline);

export default router;
