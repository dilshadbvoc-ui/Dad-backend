import jwt from 'jsonwebtoken';

const generateToken = (id: string, tokenVersion: number = 0) => {
    return jwt.sign({ id, tokenVersion }, process.env.JWT_SECRET || 'secret_key_change_this', {
        expiresIn: '3650d',
    });
};

export default generateToken;
