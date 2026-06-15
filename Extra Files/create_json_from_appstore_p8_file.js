const fs = require('fs');
const path = require('path');
// :white_tick: CONFIG: update these values
const ISSUER_ID = 'f9232c9b-032c-4293-b624-4facbd27ea7f';
const KEY_ID = 'VZG2Q53VSL';
const IN_HOUSE = false;
const P8_FILE = path.join(__dirname, 'AppStore Connect Api Key For Github Actions.p8'); // path to your .p8 file
const OUTPUT_FILE = path.join(__dirname, 'fastlane_api_key.json');
try {
    // :one: Read the .p8 file
    const p8Content = fs.readFileSync(P8_FILE, 'utf8');
    // :two: Replace line breaks with \n for JSON
    const keyWithEscapes = p8Content.replace(/\r?\n/g, '\\n');
    // :three: Build JSON object
    const apiKeyJson = {
        issuer_id: ISSUER_ID,
        key_id: KEY_ID,
        in_house: IN_HOUSE,
        key: keyWithEscapes
    };
    // :four: Write JSON to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(apiKeyJson, null, 2));
    console.log(`:white_tick: fastlane_api_key.json created successfully at ${OUTPUT_FILE}`);
} catch (err) {
    console.error(':x: Error:', err.message);
}