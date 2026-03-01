const fs = require('fs');
const path = require('path');

// First check ./node_modules, then ../node_modules for docker-compose /opt/node_app/app vs /opt/node_app structure
let bundlePath = path.join(__dirname, 'node_modules', '@actual-app', 'api', 'dist', 'app', 'bundle.api.js');
if (!fs.existsSync(bundlePath)) {
    bundlePath = path.join(__dirname, '..', 'node_modules', '@actual-app', 'api', 'dist', 'app', 'bundle.api.js');
}

if (fs.existsSync(bundlePath)) {
    let content = fs.readFileSync(bundlePath, 'utf8');

    // Replace the exact getAppliedMigrations function to avoid touching other functions
    const searchStr = `async function getAppliedMigrations(db2) {
    const rows = await runQuery$1(db2, "SELECT * FROM __migrations__ ORDER BY id ASC", [], true);
    return rows.map((row) => row.id);
}`;

    const replaceStr = `async function getAppliedMigrations(db2) {
    const rows = await runQuery$1(db2, "SELECT * FROM __migrations__ ORDER BY id ASC", [], true);
    return rows.map((row) => typeof row.id === "string" ? getMigrationId(row.id) : row.id);
}`;

    if (content.includes(searchStr)) {
        content = content.replace(searchStr, replaceStr);
        fs.writeFileSync(bundlePath, content);
        console.log('Successfully patched bundle.api.js for string migration IDs');
    } else {
        // Already patched or different version
        if (content.includes('typeof row.id === "string" ? getMigrationId(row.id) : row.id')) {
            console.log('bundle.api.js already patched');
        } else {
            console.warn('Could not find the target string in bundle.api.js - patch skipped');
        }
    }
} else {
    console.error('bundle.api.js not found at ' + bundlePath);
    process.exit(1);
}
