// Helper Functions/cloudinary_image_helpers.js

const crypto = require("crypto");
const sharp = require("sharp");
const fileType = require("file-type");
const cloudinary = require("../Config/cloudinary");
require("dotenv").config();


const CLOUDINARY_DELIVERY_TYPE = process.env.CLOUDINARY_DELIVERY_TYPE || "upload"; // upload | authenticated | private
const CLOUDINARY_RESOURCE_TYPE = "image";

// -------------------- small utils --------------------
const normalizeFolder = (folder) => String(folder || "").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");

const isHttpUrl = (s) => /^https?:\/\//i.test(String(s || ""));

function makeStableFileIdFromBuffer(buffer) {
    return crypto.createHash("sha1").update(buffer).digest("hex");
}

async function assertIsImageMulterFile(file) {
    if (!file?.buffer) {
        throw new Error("No file buffer found. Ensure you are using multer.memoryStorage().");
    }

    const detected = await fileType.fileTypeFromBuffer(file.buffer);
    const mime = detected?.mime || file.mimetype || "";
    const ok = mime.startsWith("image/");

    if (!ok) {
        const name = file.originalname || "unknown";
        throw new Error(`Invalid file "${name}". Detected MIME: "${mime || "unknown"}" (image required).`);
    }

    return {
        mime,
        ext: detected?.ext || null,
        size: file.size || file.buffer.length,
        originalName: file.originalname || "",
    };
}

// Your same compression logic
async function compressImageTo100KB(buffer) {
    const targetSize = 100 * 1024; // 100 KB
    let quality = 80;
    let width = 1000;
    let compressedBuffer = buffer;

    while (width >= 200) {
        let currentQuality = quality;

        while (currentQuality >= 30) {
            compressedBuffer = await sharp(buffer)
                .resize({ width, withoutEnlargement: true })
                .jpeg({ quality: currentQuality })
                .toBuffer();

            if (compressedBuffer.byteLength <= targetSize) return compressedBuffer;

            currentQuality -= 10;
        }

        width -= 100;
    }

    console.warn(
        `⚠️ Could not compress below 100 KB. Final size: ${(compressedBuffer?.byteLength / 1024).toFixed(1)} KB`
    );
    return compressedBuffer;
}

async function cloudinaryResourceExists(fullPublicId) {
    try {
        const r = await cloudinary.api.resource(fullPublicId, {
            resource_type: CLOUDINARY_RESOURCE_TYPE,
            type: CLOUDINARY_DELIVERY_TYPE,
        });
        return r?.secure_url || null;
    } catch (e) {
        if (e?.http_code === 404) return null;
        console.log(`[Cloudinary] exists-check failed for ${fullPublicId}:`, e?.message || e);
        return null;
    }
}

async function uploadBufferToCloudinary({ buffer, folder, publicId }) {
    const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: publicId,
                resource_type: CLOUDINARY_RESOURCE_TYPE,
                type: CLOUDINARY_DELIVERY_TYPE,
                overwrite: false,
                unique_filename: false,
            },
            (err, result) => (err ? reject(err) : resolve(result))
        );

        stream.end(buffer);
    });

    return uploadResult;
}

// Signed URL for authenticated delivery
function getSignedUrlIfNeeded(fullPublicId) {
    if (CLOUDINARY_DELIVERY_TYPE !== "authenticated") return null;

    return cloudinary.url(fullPublicId, {
        resource_type: CLOUDINARY_RESOURCE_TYPE,
        type: "authenticated",
        secure: true,
        sign_url: true,
    });
}

/**
 * ✅ MAIN HELPER: Upload ONE image (multer file) to Cloudinary with:
 * - image validation
 * - compression
 * - stable publicId (dedupe)
 * - existence check
 *
 * @param {Object} params
 * @param {Object} params.file Multer file object (memory storage): { buffer, mimetype, originalname, size }
 * @param {String} params.folder Cloudinary folder (without trailing slash)
 * @param {String} [params.fileId] Optional custom file id; if not provided, stable hash from buffer is used
 * @param {Boolean} [params.compress=true] Whether to compress before upload
 *
 * @returns {Promise<{url:string, publicId:string, alreadyExisted:boolean, signedUrl:string|null, meta:Object}>}
 */
async function uploadSingleImage({
    file,
    folder,
    fileId,
    compress = true,
}) {
    const meta = await assertIsImageMulterFile(file);

    const safeFolder = normalizeFolder(folder);
    if (!safeFolder) throw new Error("folder is required for Cloudinary upload");

    const stableId = fileId ? String(fileId).trim() : makeStableFileIdFromBuffer(file.buffer);

    const bufferToUpload = compress ? await compressImageTo100KB(file.buffer) : file.buffer;

    // Cloudinary full public_id becomes: folder/stableId
    const fullPublicId = `${safeFolder}/${stableId}`;

    // Dedup check
    const existingUrl = await cloudinaryResourceExists(fullPublicId);
    if (existingUrl) {
        return {
            url: existingUrl,
            publicId: fullPublicId,
            alreadyExisted: true,
            signedUrl: getSignedUrlIfNeeded(fullPublicId),
            meta,
        };
    }

    const uploaded = await uploadBufferToCloudinary({
        buffer: bufferToUpload,
        folder: safeFolder,
        publicId: stableId,
    });

    const finalPublicId = uploaded.public_id || fullPublicId;

    return {
        url: uploaded.secure_url,
        publicId: finalPublicId,
        alreadyExisted: false,
        signedUrl: getSignedUrlIfNeeded(finalPublicId),
        meta,
    };
}

/**
 * OPTIONAL: delete by publicId OR cloudinary URL
 */
async function deleteImageFromCloudinary(publicIdOrUrl) {
    if (!publicIdOrUrl) throw new Error("publicIdOrUrl is required");

    let publicId = String(publicIdOrUrl).trim();

    if (/^https?:\/\//i.test(publicId)) {
        try {
            const u = new URL(publicId);
            const parts = u.pathname.split("/").filter(Boolean);

            // Find "upload" / "authenticated" / "private" segment and take everything after it
            const typeIdx = parts.findIndex((p) =>
                ["upload", "authenticated", "private"].includes(p)
            );

            if (typeIdx !== -1) {
                // Everything after type may include transformations like "c_fill,w_200"
                // Remove any transformation segments (they contain commas or start with "v123")
                const afterType = parts.slice(typeIdx + 1);

                // Drop transformation segments until we hit version "v123..." or the actual path
                // Typical format: /image/upload/<transforms>/v123/folder/file.jpg
                const versionIdx = afterType.findIndex((p) => /^v\d+$/.test(p));
                const pathStart = versionIdx !== -1 ? versionIdx + 1 : 0;

                const pubWithExt = afterType.slice(pathStart).join("/");
                publicId = decodeURIComponent(pubWithExt.replace(/\.[^/.]+$/, ""));
            } else {
                throw new Error("Could not parse Cloudinary URL into publicId");
            }
        } catch (e) {
            throw new Error(`Invalid URL provided. ${e.message}`);
        }
    }

    publicId = publicId.replace(/\/+/g, "/");

    try {
    const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: CLOUDINARY_RESOURCE_TYPE,
        type: CLOUDINARY_DELIVERY_TYPE,
        invalidate: true,
    });

    return {
        publicId,
        deleted: result?.result === "ok",
        result: result?.result || "unknown",
    };
    } catch (error) {
        console.log(`Cloudinary delete failed for ${publicId}:`, error.message || error);
        throw error;
    }
}

module.exports = {
    uploadSingleImage,
    deleteImageFromCloudinary,
    CLOUDINARY_DELIVERY_TYPE,
};
