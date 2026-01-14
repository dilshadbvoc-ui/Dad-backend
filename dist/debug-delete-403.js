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
const path_1 = __importDefault(require("path"));
const Lead_1 = __importDefault(require("./models/Lead"));
const User_1 = __importDefault(require("./models/User"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found');
        }
        console.log('Connecting to MongoDB...');
        yield mongoose_1.default.connect(process.env.MONGODB_URI);
        console.log('Connected.');
        const leadId = '696637bbc27c45e5d8490393';
        const lead = yield Lead_1.default.findById(leadId);
        if (!lead) {
            console.log('Lead NOT FOUND');
        }
        else {
            console.log('--- Lead Info ---');
            console.log(`ID: ${lead._id}`);
            console.log(`Org: ${lead.organisation}`);
            console.log(`Status: ${lead.status}`);
        }
        // We don't know exactly WHICH user triggers it, but let's list admins
        const admins = yield User_1.default.find({ role: 'admin' });
        console.log('--- Admins ---');
        admins.forEach(a => {
            console.log(`User: ${a.firstName} ${a.lastName} (${a.role})`);
            console.log(`ID: ${a._id}`);
            console.log(`Org: ${a.organisation}`);
            console.log('---');
            if (lead && lead.organisation && a.organisation) {
                const match = lead.organisation.toString() === a.organisation.toString();
                console.log(`Can Delete? ${match}`);
            }
        });
    }
    catch (e) {
        console.error(e);
    }
    finally {
        yield mongoose_1.default.disconnect();
    }
});
run();
