"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const callController_1 = require("../controllers/callController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Configure storage
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path_1.default.join(__dirname, '../../uploads/recordings');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Filename: call-{callId}-{timestamp}.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname) || '.webm';
        cb(null, `call-${uniqueSuffix}${ext}`);
    }
});
const upload = (0, multer_1.default)({ storage });
router.route('/initiate').post(authMiddleware_1.protect, callController_1.initiateCall);
router.route('/:id/complete').post(authMiddleware_1.protect, upload.single('recording'), callController_1.completeCall);
router.route('/lead/:leadId').get(authMiddleware_1.protect, callController_1.getLeadCalls);
router.route('/recording/:filename').get(authMiddleware_1.protect, callController_1.getRecording);
exports.default = router;
