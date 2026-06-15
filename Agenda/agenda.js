// Agenda/agenda.js
const path = require('path');
const fs = require('fs');
const Agenda = require('agenda');
require('dotenv').config();

let agenda; // singleton we share everywhere

/**
 * Initialize Agenda once, load job definitions, then start.
 */
async function initAgenda() {
  if (agenda) return agenda; // avoid double-init in dev or multi-imports

  agenda = new Agenda({
    db: {
      address: process.env.MONGO_URI,
      collection: 'agendaJobs',          // jobs live here
      options: { useUnifiedTopology: true },
    },
    processEvery: '1 second',            // check due jobs frequently
    defaultLockLifetime: 30_000,         // lock window to avoid duplicate runners
    maxConcurrency: 50,                  // tune as needed
  });

  // Load every job file in Agenda Jobs/
  const jobsDir = path.join(__dirname, 'Agenda Jobs');
  fs.readdirSync(jobsDir)
    .filter(f => f.endsWith('.js'))
    .forEach(f => require(path.join(jobsDir, f))(agenda));

  await agenda.start();

  // Graceful shutdown (clears locks)
  const shutdown = async () => {
    try {
      if (agenda) await agenda.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return agenda;
}

/** Accessor anywhere you need Agenda (controllers/services). */
function getAgenda() {
  if (!agenda) throw new Error('Agenda not initialized yet');
  return agenda;
}

module.exports = { initAgenda, getAgenda };
