const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { MongoClient } = require("mongodb");

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// Helper to backup a single collection with retry
function backupCollection(mongoUri, dbName, collectionName, outDir, retries = 3) {
    return new Promise((resolve, reject) => {
        const args = [
            "--uri", mongoUri,
            "--db", dbName,
            "--collection", collectionName,
            "--out", outDir,
            "--authenticationDatabase", "admin"
        ];
        
        const dump = spawn("mongodump", args);
        let stderr = "";
        
        dump.stderr.on("data", (d) => (stderr += d.toString()));
        
        dump.on("close", async (code) => {
            if (code === 0) {
                resolve({ success: true, collection: collectionName });
            } else if (retries > 0 && (stderr.includes("connection") || stderr.includes("closed"))) {
                console.log(`Retrying ${dbName}.${collectionName}, ${retries} attempts left`);
                setTimeout(() => {
                    backupCollection(mongoUri, dbName, collectionName, outDir, retries - 1)
                        .then(resolve)
                        .catch(reject);
                }, 5000);
            } else {
                reject({ collection: collectionName, error: stderr });
            }
        });
        
        dump.on("error", reject);
    });
}

// POST /api/db/backup
router.post("/backup", async (req, res) => {
    let client = null;
    
    try {
        const mongoUri = process.env.MONGO_BACKUP_URI;
        if (!mongoUri) return res.status(500).json({ error: "MONGO_BACKUP_URI missing in .env" });

        const backupBaseDir = process.env.BACKUP_DIR || path.join(__dirname, '../..', 'MongoDB Backups');
        ensureDir(backupBaseDir);

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const outDir = path.join(backupBaseDir, `backup-${stamp}`);
        ensureDir(outDir);

        // Connect to MongoDB to get list of databases and collections
        client = new MongoClient(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 30000,
            connectTimeoutMS: 10000
        });
        
        await client.connect();
        const adminDb = client.db().admin();
        const { databases } = await adminDb.listDatabases();
        
        // Filter out system databases
        const userDatabases = databases.filter(db => 
            !['admin', 'local', 'config'].includes(db.name)
        );
        
        console.log(`Found ${userDatabases.length} databases to backup`);
        
        const results = {
            databases: [],
            totalCollections: 0,
            successCount: 0,
            failedCollections: []
        };
        
        // Backup each database and its collections
        for (const dbInfo of userDatabases) {
            const dbName = dbInfo.name;
            console.log(`\n=== Processing database: ${dbName} ===`);
            
            const db = client.db(dbName);
            const collections = await db.listCollections().toArray();
            
            const dbResult = {
                database: dbName,
                collections: [],
                successCount: 0,
                failedCount: 0
            };
            
            // Backup each collection individually
            for (const collection of collections) {
                const collectionName = collection.name;
                console.log(`  Backing up ${dbName}.${collectionName}...`);
                
                try {
                    await backupCollection(mongoUri, dbName, collectionName, outDir, 3);
                    dbResult.collections.push({ name: collectionName, status: "success" });
                    dbResult.successCount++;
                    results.successCount++;
                    console.log(`  ✅ Success`);
                } catch (error) {
                    console.log(`  ❌ Failed: ${error.error || error.message}`);
                    dbResult.collections.push({ name: collectionName, status: "failed", error: error.error || error.message });
                    dbResult.failedCount++;
                    results.failedCollections.push(`${dbName}.${collectionName}`);
                }
                
                // Small delay between collections to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            results.databases.push(dbResult);
            results.totalCollections += collections.length;
        }
        
        await client.close();
        
        // Check if backup was successful
        const hasFailures = results.failedCollections.length > 0;
        
        const response = {
            message: hasFailures ? "Backup completed with some failures" : "Backup created successfully",
            backupPath: outDir,
            backupName: path.basename(outDir),
            summary: {
                totalDatabases: results.databases.length,
                totalCollections: results.totalCollections,
                successfulCollections: results.successCount,
                failedCollections: results.failedCollections.length
            },
            details: results.databases
        };
        
        if (hasFailures) {
            response.failedCollections = results.failedCollections;
            return res.status(207).json(response);
        }
        
        return res.json(response);
        
    } catch (e) {
        if (client) await client.close();
        console.error("Backup error:", e);
        return res.status(500).json({ error: "Backup error", details: e.message });
    }
});

// POST /api/db/restore
router.post("/restore", async (req, res) => {
    try {
        const mongoUri = process.env.MONGO_BACKUP_URI;
        if (!mongoUri) return res.status(500).json({ error: "MONGO_BACKUP_URI missing in .env" });

        const { backupName, drop = true } = req.body || {};
        if (!backupName) return res.status(400).json({ error: "backupName is required" });

        const backupBaseDir = process.env.BACKUP_DIR || path.join(__dirname, '../..', 'MongoDB Backups');
        const backupDir = path.join(backupBaseDir, backupName);

        if (!fs.existsSync(backupDir)) {
            return res.status(404).json({ error: "Backup not found", backupDir });
        }

        // Get list of databases in backup
        const databases = fs.readdirSync(backupDir).filter(item => {
            const itemPath = path.join(backupDir, item);
            return fs.statSync(itemPath).isDirectory() && !['admin', 'local', 'config'].includes(item);
        });

        if (databases.length === 0) {
            return res.status(404).json({ error: "No databases found in backup" });
        }

        console.log(`Restoring ${databases.length} databases...`);
        
        // Restore using mongorestore
        const args = ["--uri", mongoUri, backupDir, "--authenticationDatabase", "admin"];
        if (drop) args.push("--drop");
        
        const restore = spawn("mongorestore", args);
        
        let stderr = "";
        let stdout = "";
        
        restore.stdout.on("data", (d) => (stdout += d.toString()));
        restore.stderr.on("data", (d) => (stderr += d.toString()));
        
        await new Promise((resolve, reject) => {
            restore.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `mongorestore exited with code ${code}`));
                } else {
                    resolve();
                }
            });
            restore.on("error", reject);
        });

        return res.json({
            message: "Restore completed successfully",
            restoredFrom: backupName,
            databasesRestored: databases,
            totalDatabases: databases.length,
            dropBeforeRestore: drop
        });
        
    } catch (e) {
        console.error("Restore error:", e);
        return res.status(500).json({ error: "Restore error", details: e.message });
    }
});

module.exports = router;