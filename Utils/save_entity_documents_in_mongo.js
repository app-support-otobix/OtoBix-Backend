const Entity = require('../Models/entityDocumentsModel');

const DEFAULT_ENTITIES = [
    {
        name: 'Individual',
        documents: [
            'Pan Card (self attested)',
            'Aadhar Card (self attested)',
            'GST (individual name, self attested)',
            'Cancelled Cheque',
        ],
    },
    {
        name: 'Proprietary',
        documents: [
            'Pan Card (self attested)',
            'Aadhar Card (self attested)',
            'Trade license (sign & stamp)',
            'GST (sign & stamp)',
            'Cancelled Cheque',
        ],
    },
    {
        name: 'HUF',
        documents: [
            'Huf Deed (signed & stamped by Karta)',
            'Huf Pan (signed & stamped by Karta)',
            'Pan card of Karta (self attested)',
            'Aadhar card of Karta (self attested)',
            'Huf Cancelled Cheque',
        ],
    },
    {
        name: 'Partnership',
        documents: [
            'Partnership Deed copy (signed & stamped by partner)',
            'Partnership pan card (signed & stamped by partner)',
            'Trade license (signed & stamped by partner)',
            'GST (signed & stamped by partner)',
            'KYC of partners (self attested)',
            'Cancelled cheque',
        ],
    },
    {
        name: 'LLP',
        documents: [
            'Partnership Deed copy (signed & stamped by partner)',
            'Partnership pan card (signed & stamped by partner)',
            'Trade license (signed & stamped by partner)',
            'GST (signed & stamped by partner)',
            'KYC of partners (self attested)',
            'Cancelled cheque',
        ],
    },
    {
        name: 'Ltd/Private Limited',
        documents: [
            'Company PAN card (Signed & stamped by authorised director)',
            'Company trade license (Signed & stamped by authorised director)',
            'Company GST (Signed & stamped by authorised director)',
            'Board resolution Original (see note)',
            'KYC of directors (self attested)',
            'List of Directors MCA - (Signed & stamped by authorised director)',
            'Cancelled Cheque',
        ],
    },
    {
        name: 'One person Company',
        documents: [
            'Company PAN card (Signed & stamped by sole director)',
            'Company trade license (Signed & stamped by sole director)',
            'Company GST (Signed & stamped by sole director)',
            'Board resolution Original (Signed & stamped by sole director)',
            'KYC of director (self attested)',
            'List of Directors MCA (Signed & stamped by sole director)',
            'Cancelled Cheque',
        ],
    },
];

async function saveEntityDocumentsInMongo() {
    const ops = DEFAULT_ENTITIES.map(e => ({
        updateOne: {
            filter: { name: e.name },
            update: { $set: { documents: e.documents, isActive: true } },
            upsert: true,
        },
    }));
    await Entity.bulkWrite(ops);
    // (Optional) remove unknown/old entities:
    // await Entity.deleteMany({ name: { $nin: DEFAULT_ENTITIES.map(e => e.name) } });
    console.log('[Save Entity Documents] Entities upserted');
}

module.exports = { saveEntityDocumentsInMongo };
