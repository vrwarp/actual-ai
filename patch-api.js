const fs = require('fs');
const path = require('path');

// Locate the bundled @actual-app/api file. The layout has changed across versions
// (older: dist/app/bundle.api.js, 26.x: dist/index.js) and the module may live in
// either ./node_modules or ../node_modules depending on the docker working dir
// (/opt/node_app/app vs /opt/node_app).
const candidatePaths = [
    ['dist', 'index.js'],
    ['dist', 'app', 'bundle.api.js'],
];

let bundlePath = null;
for (const base of [__dirname, path.join(__dirname, '..')]) {
    for (const parts of candidatePaths) {
        const candidate = path.join(base, 'node_modules', '@actual-app', 'api', ...parts);
        if (fs.existsSync(candidate)) {
            bundlePath = candidate;
            break;
        }
    }
    if (bundlePath) break;
}

if (!bundlePath) {
    console.error('Could not locate the @actual-app/api bundle to patch');
    process.exit(1);
}

let content = fs.readFileSync(bundlePath, 'utf8');

const patchedMarker = 'typeof row.id === "string" ? getMigrationId(row.id) : row.id';
if (content.includes(patchedMarker)) {
    console.log(`bundle already patched (${path.basename(bundlePath)})`);
    process.exit(0);
}

// getAppliedMigrations maps the __migrations__ rows straight to their raw id. Actual
// stores some migration ids as strings, so wrap the id in getMigrationId() for those.
// Match the migrations SELECT followed by the `.map((row) => row.id)` projection,
// independent of the surrounding (minified) variable names / layout.
const migrationMapRe = /(SELECT \* FROM __migrations__ ORDER BY id ASC"[\s\S]*?\.map\(\(row\) => )row\.id(\))/;

if (migrationMapRe.test(content)) {
    content = content.replace(migrationMapRe, `$1${patchedMarker}$2`);
    fs.writeFileSync(bundlePath, content);
    console.log(`Successfully patched getAppliedMigrations for string migration IDs (${path.basename(bundlePath)})`);
} else {
    // Not fatal: a future version may already handle string ids or have restructured
    // this code. Skip rather than break the build.
    console.warn('Could not find the getAppliedMigrations map target - patch skipped');
}
