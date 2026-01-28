const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'generated', 'client');
const destDir = path.join(__dirname, 'dist', 'generated', 'client');

console.log(`Copying Prisma client from ${srcDir} to ${destDir}...`);

try {
    if (fs.existsSync(srcDir)) {
        // Ensure destination directory exists
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Copy recursively
        fs.cpSync(srcDir, destDir, { recursive: true });
        console.log('Prisma client copied successfully.');
    } else {
        console.warn(`Source directory ${srcDir} does not exist. Skipping copy.`);
    }
} catch (error) {
    console.error('Error copying Prisma client:', error);
    process.exit(1);
}
