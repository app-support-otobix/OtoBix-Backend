// Routes/upload_pdf.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('../Config/cloudinary');

const router = express.Router();

// store file temporarily
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

router.post('/upload-sample-service-history-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'PDF file is required',
      });
    }

    const parentFolder = process.env.CLOUDINARY_PARENT_FOLDER || '';
    const folderPath = `${parentFolder}/Service History/Sample Service History Report PDF`;

    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'raw', // important for pdf
      folder: folderPath,
      use_filename: true,
      unique_filename: true,
    });

    // delete temp file
    fs.unlinkSync(req.file.path);

    return res.status(200).json({
      success: true,
      message: 'PDF uploaded successfully',
      data: {
        public_id: result.public_id,
        secure_url: result.secure_url,
        original_filename: result.original_filename,
        bytes: result.bytes,
        format: result.format,
      },
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Upload failed',
    });
  }
});

module.exports = router;