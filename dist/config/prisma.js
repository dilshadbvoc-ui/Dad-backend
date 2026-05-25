"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cronPrisma = exports.prisma = void 0;
// import { Pool, PoolConfig } from 'pg';
// import { PrismaPg } from '@prisma/adapter-pg';
const client_1 = require("../generated/client");
const globalForPrisma = global;
// Main API Prisma client — uses connection_limit from DATABASE_URL
if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new client_1.PrismaClient();
}
// Dedicated Cron Prisma client — limited to 3 connections so crons
// never starve the API request connection pool.
if (!globalForPrisma.cronPrisma) {
    const baseUrl = process.env.DATABASE_URL || '';
    // Strip existing connection_limit / pool_timeout params and re-apply our own
    const cleanUrl = baseUrl
        .replace(/[&?]connection_limit=\d+/g, '')
        .replace(/[&?]pool_timeout=\d+/g, '');
    const sep = cleanUrl.includes('?') ? '&' : '?';
    const cronUrl = `${cleanUrl}${sep}connection_limit=3&pool_timeout=60`;
    globalForPrisma.cronPrisma = new client_1.PrismaClient({
        datasources: { db: { url: cronUrl } }
    });
}
exports.prisma = globalForPrisma.prisma;
exports.cronPrisma = globalForPrisma.cronPrisma;
exports.default = exports.prisma;
