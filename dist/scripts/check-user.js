"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("../config/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const checkUser = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        yield prisma_1.default.$connect();
        const email = 'superadmin@crm.com';
        const user = yield prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            console.log(`User ${email} NOT FOUND in DB.`);
        }
        else {
            console.log(`User found: ${user.id}`);
            console.log(`Role: ${user.role}`);
            console.log(`Stored Hash: ${user.password.substring(0, 20)}...`);
            const isMatch = yield bcryptjs_1.default.compare('password123', user.password);
            console.log(`bcrypt.compare('password123', hash) result: ${isMatch}`);
        }
        process.exit(0);
    }
    catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
});
checkUser();
