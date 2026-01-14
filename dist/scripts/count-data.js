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
// Load environment variables BEFORE importing prisma
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const prisma_1 = __importDefault(require("../config/prisma"));
const checkCount = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        yield prisma_1.default.$connect();
        const userCount = yield prisma_1.default.user.count();
        const orgCount = yield prisma_1.default.organisation.count();
        console.log('---------------------------');
        console.log('Database: PostgreSQL (Prisma)');
        console.log(`Total Users: ${userCount}`);
        console.log(`Total Organisations: ${orgCount}`);
        console.log('---------------------------');
        if (userCount > 0) {
            const users = yield prisma_1.default.user.findMany({
                select: { email: true, role: true, organisationId: true }
            });
            console.log('Users:', JSON.stringify(users, null, 2));
        }
        process.exit(0);
    }
    catch (error) {
        console.error(error);
        process.exit(1);
    }
});
checkCount();
