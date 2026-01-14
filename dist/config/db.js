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
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    // Note: This project has migrated to Prisma/PostgreSQL.
    // MongoDB connection is kept for any legacy models but is now optional.
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.warn('MONGODB_URI not set - skipping MongoDB connection (using Prisma/PostgreSQL)');
            return;
        }
        const conn = yield mongoose_1.default.connect(mongoUri);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        console.warn(`MongoDB connection skipped: ${error.message} (using Prisma/PostgreSQL as primary)`);
        // Non-fatal: Don't exit, as Prisma is the primary database
    }
});
exports.default = connectDB;
