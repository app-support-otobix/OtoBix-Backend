// Routes/entity_documents_routes.js
const router = require('express').Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { getEntities, getEntityByName } = require('../Controllers/entity_documents_controller');

// Everything below this line is authenticated (protected routes)
// router.use(authMiddleware);

// GET all entity names
router.get('/get-entity-names-list', getEntities);

// GET one entity (with documents) by name
router.get('/get-entity-documents-by-name/:entityName', getEntityByName);

module.exports = router;
