// // utils/agenda.js
// const { Agenda } = require('agenda');
// require('dotenv').config();

// const agenda = new Agenda({
//     db: {
//         address: process.env.MONGO_URI,
//         collection: 'agendaJobs',
//     },
//     processEvery: '10 seconds',
// });

// // Load jobs and scheduling functions
// const AgendaJobs = require('./agenda_jobs');
// AgendaJobs.defineJobs(agenda);

// // Start Agenda
// (async () => {
//     await agenda.start();
// })();

// module.exports = { agenda, AgendaJobs };



