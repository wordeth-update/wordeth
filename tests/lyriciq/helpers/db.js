'use strict';

/**
 * Database bootstrap for Lyric IQ tests.
 *
 * Uses MONGODB_TEST_URI when provided (e.g. a local mongod / FerretDB), giving
 * each test file its own database name; otherwise falls back to
 * mongodb-memory-server.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only-64-characters-long-minimum';
process.env.LYRICIQ_LYRIC_PROVIDER = 'synthetic';
process.env.LYRICIQ_INCLUDE_SYNTHETIC = 'true';
process.env.LYRICIQ_INTERNAL_API_KEY = process.env.LYRICIQ_INTERNAL_API_KEY || 'test-internal-key';

const mongoose = require('mongoose');
const path = require('path');

let memoryServer = null;

function dbNameFor(filename) {
    return 'liq_' + path.basename(filename, '.test.js').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + process.pid;
}

async function connect(filename = 'default') {
    if (mongoose.connection.readyState === 1) return;
    let uri = process.env.MONGODB_TEST_URI;
    if (uri) {
        const u = new URL(uri);
        u.pathname = '/' + dbNameFor(filename);
        uri = u.toString();
    } else {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create();
        uri = memoryServer.getUri();
    }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

async function clearAll() {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function disconnect() {
    if (mongoose.connection.readyState !== 0) {
        try { await mongoose.connection.dropDatabase(); } catch (e) { /* ignore */ }
        await mongoose.disconnect();
    }
    if (memoryServer) { await memoryServer.stop(); memoryServer = null; }
}

module.exports = { connect, clearAll, disconnect };
