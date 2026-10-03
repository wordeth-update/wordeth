'use strict';
/**
 * READ-ONLY summary of ads: what exists, where it runs, whether it can be
 * served right now, and what the server would pick for each app slot.
 *
 *   railway run --service wordeth node scripts/ops/ads-summary.js
 *
 * Prints titles, placements, states and counts. No emails, no secrets.
 */
const mongoose = require('mongoose');

(async () => {
    let uri;
    if (process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
        uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@wrdthcluster.3kkpz37.mongodb.net/wordeth?retryWrites=true&w=majority&appName=WrdthCluster`;
    } else {
        uri = process.env.MONGODB_URI_PROD || process.env.MONGODB_URI;
    }
    if (!uri) { console.log('No database settings in this environment. Run it through: railway run --service wordeth …'); process.exit(1); }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000 });

    const Ad = require('../../models/Ad');
    require('../../models/Advertiser');
    const adCredit = require('../../services/adCredit');
    const adRamp = require('../../services/adRamp');
    const appAds = require('../../services/appAds');

    const funded = new Set((await adCredit.fundedAdvertiserIds()).map(String));
    const ads = await Ad.find().sort({ createdAt: -1 }).limit(60).populate('advertiserId', 'companyName');
    console.log(`ads: ${ads.length} (newest first)`);
    for (const ad of ads) {
        const who = ad.advertiserId && ad.advertiserId.companyName ? ad.advertiserId.companyName : '?';
        const canPay = ad.advertiserId && funded.has(String(ad.advertiserId._id));
        const strength = Math.round(adRamp.strength(ad) * 100);
        console.log(`  ${String(ad.placement).padEnd(16)} | ${String(ad.status).padEnd(8)} | ${canPay ? 'account can pay' : 'ACCOUNT CANNOT PAY (will not show)'} | ${ad.title} | by ${who}`
            + ` | keywords ${(ad.keywords || []).length || 'none (run-of-app)'} | rate $${ad.pricing?.cpm ?? 0}/1000, $${ad.pricing?.cpc ?? 0}/click`
            + ` | shown ${ad.stats?.impressions || 0}, tapped ${ad.stats?.clicks || 0}${strength < 100 ? ` | on-ramp ${strength}%` : ''}`);
    }
    console.log('what each app slot would show with no context:');
    for (const placement of Object.keys(appAds.APP_PLACEMENTS)) {
        if (placement === 'app-takeover') continue;
        const pick = await appAds.pick(placement, '', null);
        console.log(`  ${placement.padEnd(16)} -> ${pick ? pick.title : 'nothing (slot stays empty)'}`);
    }
    process.exit(0);
})().catch((e) => {
    // A connection error can quote the address it tried; never let the part between :// and @ through.
    console.log('could not read ads:', String(e.message).replace(/:\/\/[^@\s]*@/g, '://***@').slice(0, 200));
    process.exit(1);
});
