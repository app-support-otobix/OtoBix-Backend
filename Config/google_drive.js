const { google } = require('googleapis');
require('dotenv').config();

const serviceAccountKey = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY);

const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const googleDrive = google.drive({ version: 'v3', auth });

module.exports = googleDrive;
