const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../Config/Import Appsheet Data/otobix-service-account-key.json'); // Path to the JSON file
// const filePath = path.join(__dirname, 'firebase-admin-service-account-key.json'); // Path to the JSON file
const raw = fs.readFileSync(filePath);
const json = JSON.parse(raw);

const asEnvString = JSON.stringify(json);

console.log('✅ Copy the following string into your .env file:\n');
console.log(`RENAME_ME_WITH_YOUR_VARIABLE_NAME=${asEnvString}`);
