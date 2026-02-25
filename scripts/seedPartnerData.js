require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
    console.error('Seed scripts should not run in production. Set NODE_ENV to development or remove the guard.');
    process.exit(1);
}

const mongoose = require('mongoose');
const Label = require('../models/Label');
const PartnerUser = require('../models/PartnerUser');
const MerchSale = require('../models/MerchSale');

const LABELS = [
    {
        name: 'Dreamville Records',
        slug: 'dreamville',
        contactEmail: 'partners@dreamville.com',
        revenueShare: 0.15,
        artists: [
            { name: 'J. Cole', slug: 'j-cole', genre: 'Hip Hop' },
            { name: 'JID', slug: 'jid', genre: 'Hip Hop' },
            { name: 'Bas', slug: 'bas', genre: 'Hip Hop' },
            { name: 'EarthGang', slug: 'earthgang', genre: 'Hip Hop' },
            { name: 'Ari Lennox', slug: 'ari-lennox', genre: 'R&B' }
        ]
    },
    {
        name: 'Top Dawg Entertainment',
        slug: 'tde',
        contactEmail: 'partners@tde.com',
        revenueShare: 0.18,
        artists: [
            { name: 'Kendrick Lamar', slug: 'kendrick-lamar', genre: 'Hip Hop' },
            { name: 'SZA', slug: 'sza', genre: 'R&B' },
            { name: 'ScHoolboy Q', slug: 'schoolboy-q', genre: 'Hip Hop' },
            { name: 'Ab-Soul', slug: 'ab-soul', genre: 'Hip Hop' }
        ]
    },
    {
        name: 'Young Money Entertainment',
        slug: 'young-money',
        contactEmail: 'partners@youngmoney.com',
        revenueShare: 0.20,
        artists: [
            { name: 'Drake', slug: 'drake', genre: 'Hip Hop' },
            { name: 'Nicki Minaj', slug: 'nicki-minaj', genre: 'Hip Hop' },
            { name: 'Lil Wayne', slug: 'lil-wayne', genre: 'Hip Hop' }
        ]
    }
];

const PRODUCTS = [
    { type: 't-shirt', names: ['Lyric Tee', 'Tour Tee', 'Album Art Tee', 'Verse Tee', 'Classic Logo Tee'] },
    { type: 'hoodie', names: ['Lyric Hoodie', 'Tour Hoodie', 'Album Hoodie', 'Pullover'] },
    { type: 'hat', names: ['Snapback Cap', 'Dad Hat', 'Beanie'] },
    { type: 'poster', names: ['Album Poster', 'Tour Poster', 'Lyric Art Print'] },
    { type: 'vinyl', names: ['LP Vinyl', 'Limited Edition Vinyl'] },
    { type: 'accessories', names: ['Phone Case', 'Tote Bag', 'Sticker Pack'] }
];

const SONGS = {
    'j-cole': [
        { title: 'No Role Modelz', album: '2014 Forest Hills Drive', lyrics: 'First things first rest in peace Uncle Phil' },
        { title: 'MIDDLE CHILD', album: 'Revenge of the Dreamers III', lyrics: 'I\'m dead in the middle of two generations' },
        { title: 'Love Yourz', album: '2014 Forest Hills Drive', lyrics: 'No such thing as a life that\'s better than yours' },
        { title: 'Wet Dreamz', album: '2014 Forest Hills Drive', lyrics: 'I was scared, my heart was racing' }
    ],
    'jid': [
        { title: 'Surpass', album: 'The Forever Story', lyrics: 'I came from the bottom to the top' },
        { title: 'Dance Now', album: 'DiCaprio 2', lyrics: 'Dance now while the record playing' }
    ],
    'bas': [
        { title: 'Tribe', album: 'Milky Way', lyrics: 'All my people in the tribe' }
    ],
    'earthgang': [
        { title: 'UP', album: 'Mirrorland', lyrics: 'We going up, never coming down' }
    ],
    'ari-lennox': [
        { title: 'Shea Butter Baby', album: 'Shea Butter Baby', lyrics: 'I just want your shea butter baby' }
    ],
    'kendrick-lamar': [
        { title: 'HUMBLE.', album: 'DAMN.', lyrics: 'Sit down, be humble' },
        { title: 'DNA.', album: 'DAMN.', lyrics: 'I got loyalty, got royalty inside my DNA' },
        { title: 'Alright', album: 'To Pimp a Butterfly', lyrics: 'We gon\' be alright' },
        { title: 'LOVE.', album: 'DAMN.', lyrics: 'Love\'s gonna get you killed' },
        { title: 'Money Trees', album: 'good kid, m.A.A.d city', lyrics: 'It go Halle Berry, or hallelujah' }
    ],
    'sza': [
        { title: 'Kill Bill', album: 'SOS', lyrics: 'I might kill my ex' },
        { title: 'Good Days', album: 'SOS', lyrics: 'Good day in my mind, safe to take a step out' },
        { title: 'Kiss Me More', album: 'SOS', lyrics: 'Can you kiss me more?' }
    ],
    'schoolboy-q': [
        { title: 'Collard Greens', album: 'Oxymoron', lyrics: 'I\'m on one like the drink but not soda' }
    ],
    'ab-soul': [
        { title: 'Terrorist Threats', album: 'Control System', lyrics: 'Soul in a higher place' }
    ],
    'drake': [
        { title: 'God\'s Plan', album: 'Scorpion', lyrics: 'She say do you love me, I tell her only partly' },
        { title: 'Hotline Bling', album: 'Views', lyrics: 'You used to call me on my cell phone' },
        { title: 'Started From The Bottom', album: 'Nothing Was The Same', lyrics: 'Started from the bottom now we here' },
        { title: 'One Dance', album: 'Views', lyrics: 'Got a pretty girl and she loves me long time' }
    ],
    'nicki-minaj': [
        { title: 'Super Bass', album: 'Pink Friday', lyrics: 'Boy you got my heartbeat running away' },
        { title: 'Starships', album: 'Pink Friday: Roman Reloaded', lyrics: 'Starships were meant to fly' }
    ],
    'lil-wayne': [
        { title: 'Lollipop', album: 'Tha Carter III', lyrics: 'She lick me like a lollipop' },
        { title: 'A Milli', album: 'Tha Carter III', lyrics: 'A milli, a milli, a milli' }
    ]
};

const GEO_DATA = [
    { country: 'United States', countryCode: 'US', region: 'California', city: 'Los Angeles', lat: 34.05, lng: -118.24 },
    { country: 'United States', countryCode: 'US', region: 'New York', city: 'New York', lat: 40.71, lng: -74.01 },
    { country: 'United States', countryCode: 'US', region: 'Texas', city: 'Houston', lat: 29.76, lng: -95.37 },
    { country: 'United States', countryCode: 'US', region: 'Georgia', city: 'Atlanta', lat: 33.75, lng: -84.39 },
    { country: 'United States', countryCode: 'US', region: 'Illinois', city: 'Chicago', lat: 41.88, lng: -87.63 },
    { country: 'United States', countryCode: 'US', region: 'Florida', city: 'Miami', lat: 25.76, lng: -80.19 },
    { country: 'United Kingdom', countryCode: 'GB', region: 'England', city: 'London', lat: 51.51, lng: -0.13 },
    { country: 'Canada', countryCode: 'CA', region: 'Ontario', city: 'Toronto', lat: 43.65, lng: -79.38 },
    { country: 'Germany', countryCode: 'DE', region: 'Berlin', city: 'Berlin', lat: 52.52, lng: 13.41 },
    { country: 'France', countryCode: 'FR', region: 'Île-de-France', city: 'Paris', lat: 48.86, lng: 2.35 },
    { country: 'Japan', countryCode: 'JP', region: 'Tokyo', city: 'Tokyo', lat: 35.68, lng: 139.69 },
    { country: 'Australia', countryCode: 'AU', region: 'New South Wales', city: 'Sydney', lat: -33.87, lng: 151.21 },
    { country: 'Brazil', countryCode: 'BR', region: 'São Paulo', city: 'São Paulo', lat: -23.55, lng: -46.63 },
    { country: 'Nigeria', countryCode: 'NG', region: 'Lagos', city: 'Lagos', lat: 6.52, lng: 3.38 },
    { country: 'South Africa', countryCode: 'ZA', region: 'Gauteng', city: 'Johannesburg', lat: -26.20, lng: 28.05 },
    { country: 'Mexico', countryCode: 'MX', region: 'CDMX', city: 'Mexico City', lat: 19.43, lng: -99.13 },
    { country: 'South Korea', countryCode: 'KR', region: 'Seoul', city: 'Seoul', lat: 37.57, lng: 126.98 },
    { country: 'India', countryCode: 'IN', region: 'Maharashtra', city: 'Mumbai', lat: 19.08, lng: 72.88 }
];

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}

function generateSales(label, labelDoc, count) {
    const sales = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
        const artist = randomElement(label.artists);
        const songs = SONGS[artist.slug] || [{ title: '', album: '', lyrics: '' }];
        const song = randomElement(songs);
        const productCat = randomElement(PRODUCTS);
        const productName = randomElement(productCat.names);
        const geo = randomElement(GEO_DATA);

        const daysAgo = Math.floor(randomBetween(0, 365));
        const saleDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

        const priceMap = {
            't-shirt': [24.99, 29.99, 34.99],
            'hoodie': [49.99, 59.99, 69.99],
            'hat': [19.99, 24.99, 29.99],
            'poster': [14.99, 19.99, 24.99],
            'vinyl': [29.99, 34.99, 44.99],
            'accessories': [9.99, 14.99, 19.99]
        };

        const unitPrice = randomElement(priceMap[productCat.type] || [19.99]);
        const quantity = Math.random() > 0.8 ? Math.floor(randomBetween(2, 5)) : 1;
        const totalAmount = +(unitPrice * quantity).toFixed(2);
        const payoutRate = label.revenueShare;
        const platformFeeRate = +(1 - payoutRate).toFixed(2);
        const payoutAmount = +(totalAmount * payoutRate).toFixed(2);
        const platformFeeAmount = +(totalAmount * platformFeeRate).toFixed(2);
        const revenueShare = payoutAmount;

        const skuPrefix = productCat.type.substring(0, 3).toUpperCase();
        const artistCode = artist.slug.substring(0, 3).toUpperCase();
        const skuNum = String(Math.floor(randomBetween(100, 999)));

        sales.push({
            orderId: `WRD-${Date.now().toString(36).toUpperCase()}-${String(i).padStart(4, '0')}`,
            sellerType: 'label',
            sellerId: labelDoc._id,
            labelId: labelDoc._id,
            artistName: artist.name,
            artistSlug: artist.slug,
            sku: `${skuPrefix}-${artistCode}-${skuNum}`,
            productName: `${artist.name} ${productName}`,
            productType: productCat.type,
            songTitle: song.title,
            albumTitle: song.album,
            lyricsSnippet: song.lyrics,
            quantity,
            unitPrice,
            totalAmount,
            payoutRate,
            payoutAmount,
            platformFeeRate,
            platformFeeAmount,
            revenueShare,
            source: 'manual',
            geo: {
                ...geo,
                lat: geo.lat + randomBetween(-0.5, 0.5),
                lng: geo.lng + randomBetween(-0.5, 0.5)
            },
            status: randomElement(['confirmed', 'confirmed', 'confirmed', 'shipped', 'delivered', 'delivered']),
            saleDate
        });
    }

    return sales;
}

async function seed() {
    let mongoUri;
    if (process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
        mongoUri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@wrdthcluster.3kkpz37.mongodb.net/wordeth?retryWrites=true&w=majority&appName=WrdthCluster`;
    } else {
        mongoUri = process.env.MONGODB_URI;
    }

    if (!mongoUri) {
        console.error('No MongoDB URI found');
        process.exit(1);
    }

    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    await Label.deleteMany({});
    await PartnerUser.deleteMany({});
    await MerchSale.deleteMany({});
    console.log('Cleared existing partner data');

    for (const labelData of LABELS) {
        const label = new Label(labelData);
        await label.save();
        console.log(`Created label: ${label.name}`);

        const partner = new PartnerUser({
            email: `partner@${labelData.slug}.com`,
            password: 'partner123',
            name: `${labelData.name} Admin`,
            labelId: label._id,
            role: 'owner',
            status: 'active'
        });
        await partner.save();
        console.log(`  Created partner user: ${partner.email} / partner123`);

        const salesCount = labelData.slug === 'dreamville' ? 500 : labelData.slug === 'tde' ? 400 : 350;
        const sales = generateSales(labelData, label, salesCount);
        await MerchSale.insertMany(sales);
        console.log(`  Generated ${salesCount} sales records`);
    }

    console.log('\nSeed complete! Partner login credentials:');
    LABELS.forEach(l => {
        console.log(`  ${l.name}: partner@${l.slug}.com / partner123`);
    });

    await mongoose.disconnect();
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
