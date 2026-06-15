// Helper Functions/inspection_add_car_image_helpers.js

const crypto = require("crypto");
require("dotenv").config();
const sharp = require("sharp");
const fileType = require("file-type");
const cloudinary = require("../Config/cloudinary");

// Decide delivery type from env (recommended: authenticated for sensitive images)
// upload (public) | authenticated | private
const CLOUDINARY_DELIVERY_TYPE = process.env.CLOUDINARY_DELIVERY_TYPE || "upload";
const CLOUDINARY_RESOURCE_TYPE = "image"; // you said images list

// -------------------- Helper: stable fileId from buffer (prevents duplicates) --------------------
function makeStableFileId(buffer) {
    // sha1 is enough for IDs; sha256 is also fine
    return crypto.createHash("sha1").update(buffer).digest("hex");
}

// -------------------- Helper: Check if buffer is an image --------------------
async function assertIsImageFile(file) {
    // file is multer file: { buffer, mimetype, originalname, size, ... }
    const detected = await fileType.fileTypeFromBuffer(file.buffer);

    const mime = detected?.mime || file.mimetype || "";
    const ok = mime.startsWith("image/");

    if (!ok) {
        const name = file.originalname || "unknown";
        throw new Error(`Invalid file "${name}". Detected MIME: "${mime || "unknown"}" (image required).`);
    }

    // return detected info (optional)
    return { mime, ext: detected?.ext || null };
}

// -------------------- Helper: Compress image (UNCHANGED) --------------------
async function compressImage(buffer) {
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

            if (compressedBuffer.byteLength <= targetSize) {
                // console.log(`✅ Compressed to ${(compressedBuffer.byteLength / 1024).toFixed(1)} KB at ${width}px width & quality ${currentQuality}`);
                return compressedBuffer;
            }

            currentQuality -= 10;
        }

        width -= 100;
    }

    console.warn(`⚠️ Could not compress below 100 KB. Final size: ${(compressedBuffer?.byteLength / 1024).toFixed(1)} KB`);
    return compressedBuffer;
}

// -------------------- Helper: Check if image is already uploaded --------------------
async function checkIfAlreadyUploaded(publicId) {
    try {
        // IMPORTANT: include "type" so it searches in correct delivery type (upload/authenticated/private)
        const result = await cloudinary.api.resource(publicId, {
            resource_type: CLOUDINARY_RESOURCE_TYPE,
            type: CLOUDINARY_DELIVERY_TYPE,
        });

        // For public uploads, secure_url is directly usable.
        // For authenticated/private, you should generate a signed URL when serving.
        return result.secure_url || null;
    } catch (error) {
        if (error.http_code === 404) return null;
        // Other errors: treat as "not found" but log
        console.log(`Cloudinary API check failed for ${publicId}:`, error.message || error);
        return null;
    }
}

// -------------------- Helper: Upload image only if not already uploaded --------------------
async function uploadImageWithCheck(buffer, folder, fileId) {
    // Because we pass folder + public_id separately, Cloudinary public_id becomes: folder/fileId
    const fullPublicId = `${folder}/${fileId}`;

    const existingUrl = await checkIfAlreadyUploaded(fullPublicId);
    if (existingUrl) {
        console.log(`✅ Already uploaded: ${fullPublicId}`);
        return { publicId: fullPublicId, url: existingUrl, alreadyExisted: true };
    }

    const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: fileId,
                resource_type: CLOUDINARY_RESOURCE_TYPE,
                type: CLOUDINARY_DELIVERY_TYPE, // upload | authenticated | private
                overwrite: false,               // never overwrite existing
                unique_filename: false,         // keep our public_id exactly
            },
            (error, result) => (error ? reject(error) : resolve(result))
        );

        stream.end(buffer);
    });

    return {
        publicId: uploadResult.public_id,     // usually folder/fileId
        url: uploadResult.secure_url,         // for upload type this is public usable
        alreadyExisted: false,
    };
}

// -------------------- Helper: Generate signed URL (for authenticated/private) --------------------
function generateSignedUrl(publicId) {
    // For authenticated delivery, Cloudinary recommends sign_url + type authenticated. :contentReference[oaicite:4]{index=4}
    // If you want expiry, consider auth_token per docs. :contentReference[oaicite:5]{index=5}

    if (CLOUDINARY_DELIVERY_TYPE === "authenticated") {
        return cloudinary.url(publicId, {
            resource_type: CLOUDINARY_RESOURCE_TYPE,
            type: "authenticated",
            secure: true,
            sign_url: true,
            // Optional: you can add auth_token here if configured on your Cloudinary account
            // auth_token: { duration: 300 } // 5 minutes
        });
    }

    // For private assets, usually you use private_download_url for downloads.
    // For in-app viewing, many teams prefer authenticated delivery instead. :contentReference[oaicite:6]{index=6}
    return null;
}


// -------------------- Helper: Delete an image using stored publicId --------------------
// Use this with the `publicId` you already save in DB:
// e.g. "ParentFolder/Car Images/26-1000542/<sha1hash>"
async function deleteImageFromCloudinaryByPublicId(publicIdOrUrl) {
    if (!publicIdOrUrl) throw new Error("publicIdOrUrl is required");

    // If caller passes a URL, try to extract the public_id from it.
    // Otherwise assume it's already a public_id.
    let publicId = String(publicIdOrUrl).trim();

    // Quick URL check 
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
                // publicId = pubWithExt.replace(/\.[^/.]+$/, ""); // remove extension
                publicId = decodeURIComponent(pubWithExt.replace(/\.[^/.]+$/, ""));
            } else {
                throw new Error("Could not parse Cloudinary URL into publicId");
            }
        } catch (e) {
            throw new Error(`Invalid URL provided. ${e.message}`);
        }
    }

    // Normalize slashes
    publicId = publicId.replace(/\/+/g, "/");

    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: CLOUDINARY_RESOURCE_TYPE, // "image"
            type: CLOUDINARY_DELIVERY_TYPE,          // upload | authenticated | private
            invalidate: true,
        });

        return {
            publicId,
            deleted: result?.result === "ok",
            result: result?.result || "unknown", // "ok" | "not found" | etc.
        };
    } catch (error) {
        console.log(`Cloudinary delete failed for ${publicId}:`, error.message || error);
        throw error;
    }
}


module.exports = {
    makeStableFileId,
    assertIsImageFile,
    compressImage,
    checkIfAlreadyUploaded,
    uploadImageWithCheck,
    generateSignedUrl,
    CLOUDINARY_DELIVERY_TYPE,
    deleteImageFromCloudinaryByPublicId,
};



