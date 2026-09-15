import jwt from 'jsonwebtoken';

// `sessionId` (a UserSession row's id) is optional and backward-compatible:
// omitting it produces the exact same token shape as before this feature
// existed. `protect` (authMiddleware.ts) only enforces session-revocation
// for tokens that DO carry a sessionId claim.
const generateToken = (id: string, tokenVersion: number = 0, sessionId?: string) => {
    return jwt.sign(
        { id, tokenVersion, ...(sessionId ? { sessionId } : {}) },
        process.env.JWT_SECRET || 'secret_key_change_this',
        { expiresIn: '3650d' },
    );
};

export default generateToken;
