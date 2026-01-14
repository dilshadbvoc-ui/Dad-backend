
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Lead from './models/Lead';
import User from './models/User';

dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found');
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const leadId = '696637bbc27c45e5d8490393';
        const lead = await Lead.findById(leadId);

        if (!lead) {
            console.log('Lead NOT FOUND');
        } else {
            console.log('--- Lead Info ---');
            console.log(`ID: ${lead._id}`);
            console.log(`Org: ${lead.organisation}`);
            console.log(`Status: ${lead.status}`);
        }

        // We don't know exactly WHICH user triggers it, but let's list admins
        const admins = await User.find({ role: 'admin' });
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


    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
