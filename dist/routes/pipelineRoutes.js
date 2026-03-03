"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const pipelineController_1 = require("../controllers/pipelineController");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.protect); // All routes require authentication
router.get('/', pipelineController_1.getPipelines);
router.post('/', (0, authMiddleware_1.authorize)('admin', 'super_admin'), pipelineController_1.createPipeline);
router.put('/:id', (0, authMiddleware_1.authorize)('admin', 'super_admin'), pipelineController_1.updatePipeline);
router.delete('/:id', (0, authMiddleware_1.authorize)('admin', 'super_admin'), pipelineController_1.deletePipeline);
exports.default = router;
