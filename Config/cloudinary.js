// Config/cloudinary.js
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;


// Previous Cloudinary Credentials
// cloud_name: 'dso2jjdcz',
// api_key: '931155538285414',
// api_secret: 'E97ZrGXVATTgWLBJwiB_K9nF0JE',