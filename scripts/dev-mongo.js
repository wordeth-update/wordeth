#!/usr/bin/env node
/**
 * Local development database.
 *
 * Starts an in-process MongoDB (mongodb-memory-server) and prints the URI to
 * use in MONGODB_URI. Data lives only while this process runs.
 *
 *   npm run dev:db
 *   MONGODB_URI=<printed uri> npm run dev
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
    const port = parseInt(process.env.DEV_MONGO_PORT || '27017', 10);
    const server = await MongoMemoryServer.create({ instance: { port, dbName: 'wordeth' } });
    const uri = server.getUri('wordeth');
    console.log(`MongoDB (in-memory) ready\nMONGODB_URI=${uri}\nPress Ctrl+C to stop.`);
    const stop = async () => { await server.stop(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
})().catch((err) => {
    console.error('Could not start in-memory MongoDB:', err.message);
    console.error('Install MongoDB locally or point MONGODB_URI at a running instance instead.');
    process.exit(1);
});
