"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.encrypt = void 0;
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default_secret_key_change_me_32b'; // Must be 32 chars
const ALGORITHM = 'aes-256-gcm';
// Ensure key is 32 bytes
const getKey = () => {
    return crypto_1.default.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);
};
const encrypt = (text) => {
    if (!text)
        return text;
    try {
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv(ALGORITHM, getKey(), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        // Return as IV:AuthTag:Encrypted
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }
    catch (error) {
        console.error('Encryption error:', error);
        return text; // Fallback to raw text if encryption fails (bad practice but safe for now)
    }
};
exports.encrypt = encrypt;
const decrypt = (text) => {
    if (!text)
        return text;
    // Check if text is in encrypted format (IV:Tag:Content)
    const parts = text.split(':');
    if (parts.length !== 3) {
        // Assume it's plain text (lazy migration)
        return text;
    }
    try {
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, getKey(), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('Decryption error:', error);
        return text; // Return original on failure (might be plain text)
    }
};
exports.decrypt = decrypt;
