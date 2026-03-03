"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const encryption_1 = require("../utils/encryption");
const runVerification = () => {
    console.log('--- Verifying Encryption Utility ---');
    const originalText = 'sat_1234567890abcdef';
    console.log(`Original: ${originalText}`);
    const encrypted = (0, encryption_1.encrypt)(originalText);
    console.log(`Encrypted: ${encrypted}`);
    if (encrypted === originalText) {
        console.error('FAIL: Text was not encrypted');
        return;
    }
    if (!encrypted.includes(':')) {
        console.error('FAIL: Encrypted format incorrect (missing IV:Tag separator)');
        return;
    }
    const decrypted = (0, encryption_1.decrypt)(encrypted);
    console.log(`Decrypted: ${decrypted}`);
    if (decrypted !== originalText) {
        console.error('FAIL: Decrypted text does not match original');
        return;
    }
    console.log('SUCCESS: Encryption/Decryption roundtrip working.');
    // Test backward compatibility (plain text)
    const plainText = 'plain_text_value';
    const decryptedPlain = (0, encryption_1.decrypt)(plainText);
    if (decryptedPlain !== plainText) {
        console.error('FAIL: Backward compatibility check failed');
        return;
    }
    console.log('SUCCESS: Backward compatibility (plain text) working.');
};
runVerification();
