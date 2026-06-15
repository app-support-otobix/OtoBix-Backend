// Controllers/entity_documents_controller.js
const EntityModel = require('../Models/entityDocumentsModel');

/**
 * GET /api/entities
 * Returns [{ _id, name }]
 */
exports.getEntities = async (req, res) => {
    try {
        const entities = await EntityModel
            .find({ isActive: true })
            .select('name')
            .sort({ name: 1 });

        res.json({ data: entities });
    } catch (err) {
        console.error('[getEntities] Error:', err);
        res.status(500).json({ message: 'Failed to fetch entities' });
    }
};

/**
 * GET /api/entities/:name
 * Returns { _id, name, documents }
 * name lookup is case-insensitive
 */
exports.getEntityByName = async (req, res) => {
    try {
        const name = req.params.entityName || '';
        const entity = await EntityModel.findOne({
            name: { $regex: `^${name}$`, $options: 'i' },
            isActive: true,
        });

        if (!entity) return res.status(404).json({ message: 'Entity not found' });

        res.json({ data: entity });
    } catch (err) {
        console.error('[getEntityByName] Error:', err);
        res.status(500).json({ message: 'Failed to fetch entity documents' });
    }
};
