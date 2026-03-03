"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("../config/prisma"));
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const updateMetaToken = async () => {
    const token = 'EAAMfcaNNQFYBQlsBB6vvZAE3ZCrhxdCODpyZBZBKqaAMaNcqZC7CEZCwqWSAoavxqg2RXODX3wtOqYKn4LotsF2Stgtee4BHvEZBnajzP7dmcOZCV8oEXx0c8h496IkgBWCKEUa2MRLZA6JX6MXNPFy0JKZCxWXDmkFuUa7GzVvO87Cg0uMd418LsjLW9c0SIGm9o9ZCrq7D9L25PZB3P9OKtMaURaVFxGQyDlNPaGlIVUqHi98kNOBcAxlAliOsDUnRmgTHRAekVFa4AvOyTxmhcbXbkHJa';
    const email = 'superadmin@crm.com';
    try {
        console.log('Validating token with Meta Graph API...');
        const response = await axios_1.default.get(`https://graph.facebook.com/v19.0/me?access_token=${token}&fields=id,name`);
        const { id: metaUserId, name } = response.data;
        console.log(`Token valid for Meta User: ${name} (ID: ${metaUserId})`);
        console.log('Connecting to database...');
        await prisma_1.default.$connect();
        const user = await prisma_1.default.user.update({
            where: { email },
            data: {
                metaAccessToken: token,
                metaUserId: metaUserId
            }
        });
        console.log(`\nSUCCESS! Updated user ${user.email}`);
        console.log(`Meta User ID: ${user.metaUserId}`);
        console.log(`Token set: Yes`);
    }
    catch (error) {
        console.error('Error updating token:', error.response?.data || error.message);
    }
    finally {
        await prisma_1.default.$disconnect();
    }
};
updateMetaToken();
