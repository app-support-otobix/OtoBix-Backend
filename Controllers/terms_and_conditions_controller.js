// controllers/terms_and_conditions_controller.js
const mongoose = require('mongoose');
const multer = require('multer');
const mammoth = require('mammoth');      // DOCX -> HTML
const pdfParse = require('pdf-parse');   // PDF -> text (we'll wrap to simple HTML)
const sanitize = require('sanitize-html');
const crypto = require('crypto');

/* ---------------------------
   Multer (memory; single file)
---------------------------- */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (req, file, cb) => {
        const name = file.originalname.toLowerCase();
        const ok =
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            name.endsWith('.pdf') || name.endsWith('.docx');
        if (ok) return cb(null, true);
        cb(new Error('Only .docx or .pdf files are allowed'));
    },
}).single('file');

exports.uploadMiddleware = upload;

/* ---------------------------
   Small helpers
---------------------------- */
const sha256 = (bufOrStr) => crypto.createHash('sha256').update(bufOrStr).digest('hex');

function cleanHtml(dirty) {
    return sanitize(dirty, {
        allowedTags: sanitize.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'section']),
        allowedAttributes: {
            a: ['href', 'name', 'target', 'rel'],
            img: ['src', 'alt'],
        },
        transformTags: {
            a: (tagName, attribs) => ({
                tagName: 'a',
                attribs: { ...attribs, rel: 'noopener noreferrer' },
            }),
        },
    });
}


async function docxBufferToHtml(buffer) {
    const { value: html } = await mammoth.convertToHtml({ buffer }, {
        styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
        ],
    });
    return html;
}

async function pdfBufferToHtml(buffer) {
    const data = await pdfParse(buffer);
    const text = (data && data.text) ? data.text : '';

    const lines = text.split(/\r?\n/).map(l => l.trim());
    const paras = [];
    let chunk = [];
    for (const line of lines) {
        if (!line) {
            if (chunk.length) { paras.push(chunk.join(' ')); chunk = []; }
        } else {
            chunk.push(line);
        }
    }
    if (chunk.length) paras.push(chunk.join(' '));

    const html = ['<section>']
        .concat(paras.map(p => `<p>${escapeHtml(p)}</p>`))
        .concat(['</section>'])
        .join('\n');

    return html;
}


async function fileToHtml(file) {
    const isDocx = file.originalname.toLowerCase().endsWith('.docx');
    const isPdf = file.originalname.toLowerCase().endsWith('.pdf');
    if (isDocx) return await docxBufferToHtml(file.buffer);
    if (isPdf) return await pdfBufferToHtml(file.buffer);
    throw new Error('Unsupported file type');
}



// helper: strip all tags (leave plain text)
function stripTags(html) {
    return sanitize(html, { allowedTags: [], allowedAttributes: {} });
}

// helper: escape raw text for HTML
function escapeHtml(str = '') {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}


/** Atomic version increment without a model */
async function nextVersion(db) {
    const counters = db.collection('counters');
    const res = await counters.findOneAndUpdate(
        { _id: 'termsAndConditions' },
        { $inc: { seq: 1 } },            // only $inc
        {
            upsert: true,
            returnDocument: 'after',       // driver v4+
            returnOriginal: false,         // driver v3
        }
    );

    const doc = res && (res.value || res);
    if (!doc || typeof doc.seq !== 'number') {
        // very defensive fallback
        const check = await counters.findOne({ _id: 'termsAndConditions' });
        if (!check || typeof check.seq !== 'number') {
            throw new Error('Version counter not initialized');
        }
        return check.seq;
    }
    return doc.seq;
}


/** Try to derive a title if none provided */
function deriveTitle({ providedTitle, fileName, html }) {
    if (providedTitle && providedTitle.trim()) return providedTitle.trim();

    // first <h1>…</h1>
    const h1 = /<h1[^>]*>(.*?)<\/h1>/i.exec(html);
    if (h1 && h1[1]) return stripTags(h1[1]).trim().slice(0, 140);

    // else first <p>…</p>
    const p = /<p[^>]*>(.*?)<\/p>/i.exec(html);
    if (p && p[1]) return stripTags(p[1]).trim().slice(0, 140);

    // else filename without extension
    return (fileName || 'Terms & Conditions').replace(/\.[^.]+$/, '');
}


/* ---------------------------
   Controllers
---------------------------- */

// POST /api/terms/upload  (form-data: file=<docx/pdf>, title=<optional>)
exports.uploadTerms = async (req, res) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({ success: false, message: 'file is required (.docx or .pdf)' });
        }

        const db = mongoose.connection;
        const col = db.collection('termsAndConditions');

        // Convert -> HTML and sanitize
        const rawHtml = await fileToHtml(req.file);
        const html = cleanHtml(rawHtml);

        // Deduplicate by content hash
        const contentHash = sha256(html);
        const exists = await col.findOne({ contentHash });
        if (exists) {
            return res.status(200).json({
                success: true,
                message: "No changes found. The uploaded document is same as the current Terms & Conditions.",
                data: {
                    version: exists.version,
                    title: exists.title,
                    content: exists.content,
                    fileName: exists.fileName,
                    _id: exists._id,
                    createdAt: exists.createdAt,
                },
            });
        }

        // Get version, build doc
        const version = await nextVersion(db);
        const title = deriveTitle({
            providedTitle: req.body?.title,
            fileName: req.file.originalname,
            html,
        });

        const doc = {
            version,
            title,
            content: html,
            fileName: req.file.originalname,
            contentHash,
            createdAt: new Date(), // optional, handy
        };

        await col.insertOne(doc);

        return res.status(201).json({
            success: true,
            message: 'New Terms & Conditions version created.',
            data: {
                version: doc.version,
                title: doc.title,
                content: doc.content,
                fileName: doc.fileName,
                _id: doc._id,
                createdAt: doc.createdAt,
            },
        });
    } catch (err) {
        console.error('[uploadTerms] Error:', err);
        res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    }
};

// GET /api/terms/latest
exports.getLatestTerms = async (req, res) => {
    try {
        const db = mongoose.connection;
        const col = db.collection('termsAndConditions');
        const doc = await col.find().sort({ version: -1 }).limit(1).next();
        if (!doc) return res.status(404).json({ success: false, message: 'No terms found' });

        res.json({
            success: true,
            data: {
                version: doc.version,
                title: doc.title,
                content: doc.content,
                fileName: doc.fileName,
                _id: doc._id,
                createdAt: doc.createdAt,
            },
        });
    } catch (err) {
        console.error('[getLatestTerms] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch latest terms' });
    }
};

// GET /api/terms/:version
exports.getTermsByVersion = async (req, res) => {
    try {
        const v = Number(req.params.version);
        if (!Number.isInteger(v) || v < 1) {
            return res.status(400).json({ success: false, message: 'Invalid version' });
        }

        const db = mongoose.connection;
        const col = db.collection('termsAndConditions');
        const doc = await col.findOne({ version: v });
        if (!doc) return res.status(404).json({ success: false, message: 'Version not found' });

        res.json({
            success: true,
            data: {
                version: doc.version,
                title: doc.title,
                content: doc.content,
                fileName: doc.fileName,
                _id: doc._id,
                createdAt: doc.createdAt,
            },
        });
    } catch (err) {
        console.error('[getTermsByVersion] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch version' });
    }
};

// GET /api/terms?limit=10&page=1
exports.listTerms = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
        const skip = (page - 1) * limit;

        const db = mongoose.connection;
        const col = db.collection('termsAndConditions');

        const cursor = col.find({}, { projection: { content: 0 } }) // omit heavy HTML in list
            .sort({ version: -1 })
            .skip(skip)
            .limit(limit);

        const items = await cursor.toArray();
        const total = await col.countDocuments();

        res.json({
            success: true,
            items: items.map(d => ({
                version: d.version,
                title: d.title,
                fileName: d.fileName,
                _id: d._id,
                createdAt: d.createdAt,
            })),
            total,
            page,
            pages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error('[listTerms] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to list terms' });
    }
};
