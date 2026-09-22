'use strict';

/**
 * Apple in-app purchase verification.
 *
 * StoreKit 2 hands the app a signed transaction (a JWS). The phone is not
 * trusted: the server checks Apple's signature against Apple's own root
 * certificates before a single token is credited. Nothing here talks to
 * Apple over the network, so a purchase still lands if Apple's servers are
 * slow, and there are no API keys to rotate.
 */

const fs = require('fs');
const path = require('path');
const { SignedDataVerifier, Environment } = require('@apple/app-store-server-library');

const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.wordeth.app';
/** Numeric App Store id; only needed for production checks, and optional. */
const APP_APPLE_ID = process.env.APPLE_APP_ID ? Number(process.env.APPLE_APP_ID) : undefined;

let rootCerts = null;
function certificates() {
    if (rootCerts) return rootCerts;
    const dir = path.join(__dirname, '..', 'certs', 'apple');
    rootCerts = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.cer'))
        .map((f) => fs.readFileSync(path.join(dir, f)));
    if (!rootCerts.length) throw new Error('No Apple root certificates found in certs/apple');
    return rootCerts;
}

const verifiers = new Map();
function verifierFor(environment) {
    if (verifiers.has(environment)) return verifiers.get(environment);
    // Online checks would call Apple to test for revocation; offline keeps a
    // purchase working when Apple is unreachable, and the chain is still verified.
    const v = new SignedDataVerifier(certificates(), false, environment, BUNDLE_ID, APP_APPLE_ID);
    verifiers.set(environment, v);
    return v;
}

/** The unverified environment claim, used only to pick which verifier to run. */
function claimedEnvironment(jws) {
    try {
        const body = JSON.parse(Buffer.from(String(jws).split('.')[1], 'base64url').toString('utf8'));
        return body && body.environment === 'Sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
    } catch {
        return Environment.PRODUCTION;
    }
}

/**
 * Verify a signed transaction and return its decoded payload.
 * Throws when the signature, the bundle id or the shape is wrong.
 */
async function verifyTransaction(jws) {
    if (typeof jws !== 'string' || jws.split('.').length !== 3) {
        const err = new Error('That purchase could not be read.');
        err.code = 'MALFORMED_TRANSACTION';
        throw err;
    }
    const first = claimedEnvironment(jws);
    const order = first === Environment.SANDBOX
        ? [Environment.SANDBOX, Environment.PRODUCTION]
        : [Environment.PRODUCTION, Environment.SANDBOX];

    let lastError = null;
    for (const env of order) {
        try {
            const payload = await verifierFor(env).verifyAndDecodeTransaction(jws);
            if (payload.bundleId !== BUNDLE_ID) {
                const err = new Error('That purchase belongs to a different app.');
                err.code = 'WRONG_BUNDLE';
                throw err;
            }
            return { payload, environment: env === Environment.SANDBOX ? 'sandbox' : 'production' };
        } catch (e) {
            if (e && e.code === 'WRONG_BUNDLE') throw e;
            lastError = e;
        }
    }
    const err = new Error('That purchase could not be verified with Apple.');
    err.code = 'VERIFICATION_FAILED';
    err.cause = lastError;
    throw err;
}

module.exports = { verifyTransaction, BUNDLE_ID };
