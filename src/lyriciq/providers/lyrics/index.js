'use strict';

const config = require('../../config');
const SyntheticProvider = require('./SyntheticProvider');
const MusixmatchProvider = require('./MusixmatchProvider');

let primary = null;
let synthetic = null;

/** The provider that supplies licensed catalog content. */
function getLyricProvider() {
    if (primary) return primary;
    if (config.provider.name === 'musixmatch') {
        primary = new MusixmatchProvider();
    } else {
        primary = getSyntheticProvider();
    }
    return primary;
}

function getSyntheticProvider() {
    if (!synthetic) synthetic = new SyntheticProvider();
    return synthetic;
}

/** Test hook: swap the active provider. */
function setLyricProvider(provider) {
    primary = provider;
}

module.exports = { getLyricProvider, getSyntheticProvider, setLyricProvider, SyntheticProvider, MusixmatchProvider };
