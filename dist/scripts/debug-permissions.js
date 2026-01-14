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
const prisma_1 = __importDefault(require("../config/prisma"));
dotenv_1.default.config();
const debugPermissions = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Connecting to PostgreSQL via Prisma...');
        yield prisma_1.default.$connect();
        console.log('\n--- Organisation List ---');
        const orgs = yield prisma_1.default.organisation.findMany();
        orgs.forEach(org => {
            console.log(`Org: ${org.name} (id: ${org.id})`);
        });
        console.log('\n--- User List ---');
        const users = yield prisma_1.default.user.findMany({
            include: { organisation: true }
        });
        users.forEach(u => {
            console.log(`User: ${u.firstName} ${u.lastName}`);
            console.log(`  id: ${u.id}`);
            console.log(`  Email: ${u.email}`);
            console.log(`  Role: ${u.role}`);
            console.log(`  Organisation: ${u.organisationId || 'NULL'}`);
            console.log('---');
        });
        console.log('\n--- Summary ---');
        console.log(`Total organisations: ${orgs.length}`);
        console.log(`Total users: ${users.length}`);
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        yield prisma_1.default.$disconnect();
        process.exit();
    }
});
debugPermissions();
