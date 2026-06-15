
// Helper Functions/inspection_add_car_video_helpers.js

const crypto = require("crypto");
const fileType = require("file-type");
const cloudinary = require("../Config/cloudinary");

const CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD = process.env.CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD || "upload";
const CLOUDINARY_VIDEO_RESOURCE_TYPE = "video";

function makeStableFileIdForVideoUpload(buffer) {
    return crypto.createHash("sha1").update(buffer).digest("hex");
}

async function assertIsVideoFileForVideoUpload(file) {
    const detected = await fileType.fileTypeFromBuffer(file.buffer);
    const mime = detected?.mime || file.mimetype || "";
    if (!mime.startsWith("video/")) {
        const name = file.originalname || "unknown";
        throw new Error(`Invalid file "${name}". Detected MIME: "${mime || "unknown"}" (video required).`);
    }
    return { mime, ext: detected?.ext || null };
}

async function checkIfVideoAlreadyUploaded(publicId) {
    try {
        const result = await cloudinary.api.resource(publicId, {
            resource_type: CLOUDINARY_VIDEO_RESOURCE_TYPE,
            type: CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD,
        });
        return result.secure_url || null;
    } catch (err) {
        if (err.http_code === 404) return null;
        // For strict duplicate prevention, fail if Cloudinary check fails
        console.log(`Cloudinary API check failed for ${publicId}:`, err.message || err);
        // throw new Error(`Cloudinary video check failed: ${err.message || err}`);
    }
}

async function uploadVideoWithCheckForVideoUpload(buffer, folder, fileId) {
    const fullPublicId = `${folder}/${fileId}`;

    const existingUrl = await checkIfVideoAlreadyUploaded(fullPublicId);
    if (existingUrl) {
        return { publicId: fullPublicId, url: existingUrl, alreadyExisted: true };
    }

    const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: fileId,
                resource_type: CLOUDINARY_VIDEO_RESOURCE_TYPE,
                type: CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD,
                overwrite: false,
                unique_filename: false,
            },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });

    return {
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
        alreadyExisted: false,
    };
}

// “Safe compression” via delivery optimization (original stays intact)
// Uses q_auto for video optimization. :contentReference[oaicite:2]{index=2}
function buildOptimizedVideoUrlForVideoUpload(publicId) {
    return cloudinary.url(publicId, {
        resource_type: CLOUDINARY_VIDEO_RESOURCE_TYPE,
        type: CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD,
        secure: true,
        transformation: [
            {
                quality: "auto:good",
                fetch_format: "auto",
                video_codec: "auto",
            },
        ],
    });
}




// -------------------- Helper: Delete a video using stored publicId --------------------
// Use this with the `publicId` you save in DB (recommended).
// Example publicId: "ParentFolder/Car Videos/26-1000542/<sha1hash>"
async function deleteVideoFromCloudinaryByPublicId(publicIdOrUrl) {
    if (!publicIdOrUrl) throw new Error("publicIdOrUrl is required");

    let publicId = String(publicIdOrUrl).trim();

    // If someone passes a URL instead of publicId, attempt to parse it.
    if (/^https?:\/\//i.test(publicId)) {
        try {
            const u = new URL(publicId);
            const parts = u.pathname.split("/").filter(Boolean);

            // Find "upload" / "authenticated" / "private" and take everything after it
            const typeIdx = parts.findIndex((p) =>
                ["upload", "authenticated", "private"].includes(p)
            );

            if (typeIdx === -1) {
                throw new Error("Could not locate delivery type segment in URL");
            }

            const afterType = parts.slice(typeIdx + 1);

            // Typical: /video/upload/<transforms>/v123/folder/file.mp4
            const versionIdx = afterType.findIndex((p) => /^v\d+$/.test(p));
            const pathStart = versionIdx !== -1 ? versionIdx + 1 : 0;

            const pubWithExt = afterType.slice(pathStart).join("/");
            // publicId = pubWithExt.replace(/\.[^/.]+$/, ""); // remove extension
            publicId = decodeURIComponent(pubWithExt.replace(/\.[^/.]+$/, ""));
        } catch (e) {
            throw new Error(`Invalid URL provided. ${e.message}`);
        }
    }

    publicId = publicId.replace(/\/+/g, "/");

    try {
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: CLOUDINARY_VIDEO_RESOURCE_TYPE, // "video"
            type: CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD, // upload | authenticated | private
            invalidate: true,
        });

        return {
            publicId,
            deleted: result?.result === "ok",
            result: result?.result || "unknown", // "ok" | "not found" | etc.
        };
    } catch (error) {
        console.log(`Cloudinary video delete failed for ${publicId}:`, error.message || error);
        throw error;
    }
}


module.exports = {
    makeStableFileIdForVideoUpload,
    assertIsVideoFileForVideoUpload,
    uploadVideoWithCheckForVideoUpload,
    buildOptimizedVideoUrlForVideoUpload,
    CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD,
    deleteVideoFromCloudinaryByPublicId,
};
