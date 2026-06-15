const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = express();
const upload = multer({ dest: 'uploads/' });

if (!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY) {
    throw new Error('❌ GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY is missing from .env');
}

// 🔐 Google Drive Auth
const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY);
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// 🔁 Get folder ID by name and parent
async function getFolderIdByName(name, parentId = 'root') {
    const res = await drive.files.list({
        q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        spaces: 'drive',
    });
    return res.data.files.length ? res.data.files[0].id : null;
}

// 📁 Traverse folder path to get final parent ID
async function getFolderIdFromPath(folderPath) {
    const folders = folderPath.split('/');
    let parentId = 'root';
    for (const name of folders) {
        const folderId = await getFolderIdByName(name, parentId);
        if (!folderId) return null;
        parentId = folderId;
    }
    return parentId;
}

// 🔍 Search file in given folder
async function searchFileInFolder(fileName, folderId) {
    const res = await drive.files.list({
        q: `'${folderId}' in parents and name='${fileName}' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
    });
    return res.data.files.length ? res.data.files[0].id : null;
}

app.post('/upload-sheet', upload.single('file'), async (req, res) => {
    try {
        // ✅ Step 1: Test Google Drive access by listing files from root
        const testList = await drive.files.list({
            q: `'root' in parents and trashed=false`,
            pageSize: 10,
            fields: 'files(id, name, mimeType)',
        });

        const driveTestFiles = testList.data.files.map(file => ({
            id: file.id,
            name: file.name,
            type: file.mimeType,
        }));

        console.log('✅ Google Drive Test Files:', driveTestFiles);

        // Optional: If you only want to test access and stop here:
        // return res.json({ message: '✅ Google Drive access confirmed.', driveFiles: driveTestFiles });

        // ✅ Step 2: Proceed with Excel file processing
        const filePath = req.file.path;
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        const results = [];

        for (const row of data) {
            const rawPath = row['Otobix Images'];
            if (!rawPath) continue;

            const parts = rawPath.split('/');
            const fileName = parts.pop();
            const folderPath = parts.join('/');

            const folderId = await getFolderIdFromPath(folderPath);
            if (!folderId) {
                results.push({ rawPath, status: '❌ Folder Not Found', url: null });
                continue;
            }

            const fileId = await searchFileInFolder(fileName, folderId);
            if (!fileId) {
                results.push({ rawPath, status: '❌ File Not Found', url: null });
                continue;
            }

            const url = `https://drive.google.com/uc?id=${fileId}`;
            results.push({ rawPath, status: '✅ Found', url });
        }

        fs.unlinkSync(filePath); // Cleanup

        // ✅ Final combined response
        res.json({
            message: '✅ Drive access successful & Excel processed.',
            driveFiles: driveTestFiles,
            results,
        });
    } catch (err) {
        console.error('❌ Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/list-drive', async (req, res) => {
    try {
        const response = await drive.files.list({
            q: `trashed = false`,
            fields: 'files(id, name, mimeType, parents)',
            pageSize: 50,
            spaces: 'drive',
        });

        const files = response.data.files.map(file => ({
            id: file.id,
            name: file.name,
            parent: file.parents?.[0] || 'N/A',
            type: file.mimeType.includes('folder') ? '📁 Folder' : '📄 File',
        }));

        res.json({
            message: '✅ Google Drive Access Confirmed',
            items: files,
        });
    } catch (error) {
        console.error('❌ Drive access error:', error);
        res.status(500).json({ error: 'Failed to list Drive files' });
    }
});


app.get('/list-formresponses', async (req, res) => {
    const foldersToRead = [
        {
            name: 'Form Responses 1_Images',
            id: '1lqJbUHA5fmEOVm3SJoRley7W8Bn5L1WF',
        },
        {
            name: 'Form Responses 1_Files_',
            id: '18FlfiqiqhWX3bt2dUbZXJdbB9f7qkfT6',
        },
    ];

    try {
        const result = [];

        for (const folder of foldersToRead) {
            const response = await drive.files.list({
                q: `'${folder.id}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType)',
                spaces: 'drive',
                pageSize: 500,
            });

            const files = response.data.files.map(file => ({
                name: file.name,
                type: file.mimeType,
                url: `https://drive.google.com/uc?id=${file.id}`,
            }));

            result.push({
                folder: folder.name,
                count: files.length,
                files,
            });
        }

        res.json({
            message: '✅ Files from Form Responses folders',
            data: result,
        });
    } catch (err) {
        console.error('❌ Error fetching formresponses files:', err);
        res.status(500).json({ error: 'Failed to fetch files from formresponses folders' });
    }
});




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));





// const fs = require('fs');
// const path = require('path');
// const xlsx = require('xlsx');
// const { google } = require('googleapis');
// require('dotenv').config({
//     path: path.join(__dirname, '../../.env'),
// });

// if (!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY) {
//     throw new Error('❌ GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY is missing from .env');
// }

// // Google Auth
// const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY);
// const auth = new google.auth.GoogleAuth({
//     credentials,
//     scopes: ['https://www.googleapis.com/auth/drive.readonly'], // Read-only scope
// });

// const drive = google.drive({ version: 'v3', auth });

// async function getFolderIdByName(name) {
//     const res = await drive.files.list({
//         q: `name='${name}' and mimeType='application/vnd.google-apps.folder'`,
//         fields: 'files(id, name)',
//     });
//     return res.data.files[0]?.id || null;
// }

// async function getFileIdByNameInFolder(fileName, folderId) {
//     const res = await drive.files.list({
//         q: `'${folderId}' in parents and name='${fileName}'`,
//         fields: 'files(id, name)',
//     });
//     return res.data.files[0]?.id || null;
// }

// async function extractAndPrintUrlsFromExcel() {
//     const workbook = xlsx.readFile('Otobix Images Sheet.xlsx');
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const data = xlsx.utils.sheet_to_json(sheet);

//     const folderName = 'Otobix Data';
//     const folderId = await getFolderIdByName(folderName);
//     if (!folderId) {
//         console.error('❌ Folder not found:', folderName);
//         return;
//     }

//     for (const row of data) {
//         const rawPath = row['Otobix Images'];
//         const fileName = path.basename(rawPath);

//         const fileId = await getFileIdByNameInFolder(fileName, folderId);
//         if (!fileId) {
//             console.warn(`⚠️ File not found in folder: ${fileName}`);
//             continue;
//         }

//         // Skip makePublic, assume it's already shared with anyone
//         const url = `https://drive.google.com/uc?id=${fileId}`;

//         console.log(`✅ ${fileName}: ${url}`);
//     }
// }

// module.exports = extractAndPrintUrlsFromExcel().catch(console.error);

///////////////////////////////////////////////
// const fs = require('fs');
// const path = require('path');
// const xlsx = require('xlsx');
// const { google } = require('googleapis');
// require('dotenv').config({
//     path: path.join(__dirname, '../../.env'), // ⬅️ adjusts path from 'Utils/Image Urls Fetcher'
// });

// if (!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY) {
//     throw new Error('❌ GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY is missing from .env');
// }

// // Google Auth
// const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY);
// const auth = new google.auth.GoogleAuth({
//     credentials,
//     scopes: ['https://www.googleapis.com/auth/drive'],
// });

// const drive = google.drive({ version: 'v3', auth });

// async function getFolderIdByName(name) {
//     const res = await drive.files.list({
//         q: `name='${name}' and mimeType='application/vnd.google-apps.folder'`,
//         fields: 'files(id, name)',
//     });
//     return res.data.files[0]?.id || null;
// }

// async function getFileIdByNameInFolder(fileName, folderId) {
//     const res = await drive.files.list({
//         q: `'${folderId}' in parents and name='${fileName}'`,
//         fields: 'files(id, name)',
//     });
//     return res.data.files[0]?.id || null;
// }

// async function makePublic(fileId) {
//     await drive.permissions.create({
//         fileId,
//         requestBody: {
//             role: 'reader',
//             type: 'anyone',
//         },
//     });
// }

// async function extractAndPrintUrlsFromExcel() {
//     const workbook = xlsx.readFile('Otobix Images Sheet.xlsx');
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const data = xlsx.utils.sheet_to_json(sheet);

//     // const folderName = process.env.GOOGLE_FOLDER_NAME;
//     const folderName = 'Otobix Data';
//     const folderId = await getFolderIdByName(folderName);
//     if (!folderId) {
//         console.error('❌ Folder not found:', folderName);
//         return;
//     }

//     for (const row of data) {
//         const rawPath = row['Otobix Images']; // Excel column
//         const fileName = path.basename(rawPath); // Get '1.png' from 'Otobix Data/1.png'

//         const fileId = await getFileIdByNameInFolder(fileName, folderId);
//         if (!fileId) {
//             console.warn(`⚠️ File not found in folder: ${fileName}`);
//             continue;
//         }

//         await makePublic(fileId); // Make file public (optional, but important)
//         const url = `https://drive.google.com/uc?id=${fileId}`;

//         console.log(`✅ ${fileName}: ${url}`);
//     }
// }

// module.exports = extractAndPrintUrlsFromExcel().catch(console.error);
