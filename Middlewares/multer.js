const multer = require('multer');
const cloudinary = require('../Config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: `${process.env.CLOUDINARY_PARENT_FOLDER}/User Images`,
    allowed_formats: ['jpg', 'png', 'jpeg'],
    public_id: (req, file) => `${Date.now()}-${file.originalname}`
  },
});

const parser = multer({ storage: storage });

module.exports = parser;