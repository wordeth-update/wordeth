'use strict';

/**
 * TEST CONTENT — NOT REAL LYRICS.
 *
 * Every artist, title and line below is fabricated for development and
 * automated testing. Nothing here is licensed content and nothing here should
 * be presented to players as a real song. Tracks are flagged `synthetic: true`
 * and are only merged into the catalog when config.provider.includeSynthetic
 * is on (never in production by default).
 */

const SYNTHETIC_MARKER = 'TEST CONTENT — NOT REAL LYRICS';

const tracks = [
    {
        providerTrackId: 'syn-0001', title: 'Neon Rooftop', artist: 'Vera Solace', album: 'Midnight Grammar',
        genre: 'pop', releaseYear: 2019, popularity: 82, explicit: false,
        lines: [
            'Walking through the city tonight',
            'Every streetlight learns my name',
            'We were dancing on the rooftop in the rain',
            'Your jacket smelled like cinnamon and smoke',
            'I kept the ticket from the midnight train',
            'Glass towers humming underneath the stars',
            'Nobody told the moon to wait for us',
            'Turn the radio louder than the thunder',
            'Paper crowns and borrowed diamond rings',
            'Say my name like a secret in the wind',
            'The elevator only goes to heaven',
            'Neon rooftop, keep me till the morning'
        ]
    },
    {
        providerTrackId: 'syn-0002', title: 'Concrete Sermon', artist: 'Marlow Reign', album: 'Asphalt Gospel',
        genre: 'hiphop', releaseYear: 2016, popularity: 88, explicit: true,
        lines: [
            'Concrete sermon from the corner of the block',
            'Pockets heavy with the lessons that we learned',
            'Mama prayed on Sunday while the stove was burning',
            'Every scar on my knuckles is a chapter',
            'Sirens singing harmony with the summer',
            'Built a castle out of cardboard and ambition',
            'Trophies in the trunk beside the jumper cables',
            'Talk your talk until the pavement starts to listen',
            'Counting ceilings on the bus to the arena',
            'Running through the alley with a golden ticket',
            'They said hustle till the sunrise looks familiar',
            'My whole hood in the mirror when I shine'
        ]
    },
    {
        providerTrackId: 'syn-0003', title: 'Velvet Hour', artist: 'Delphine Ash', album: 'Slow Chemistry',
        genre: 'rnb', releaseYear: 2021, popularity: 76, explicit: false,
        lines: [
            'Meet me in the velvet hour after midnight',
            'Candles leaning like the whispers on your pillow',
            'Pour the honey slow across the record player',
            'Silk sheets remember everything you promised',
            'Your heartbeat is a bassline in the hallway',
            'Lipstick on the window of a taxi',
            'Kiss me like the elevator stalled forever',
            'Diamonds on the dresser catching moonlight',
            'Feathers fall whenever you say sorry',
            'We melt like sugar in the summer kitchen',
            'Velvet hour, velvet hour, stay a little longer',
            'Trace my shoulder like a map you finally learned'
        ]
    },
    {
        providerTrackId: 'syn-0004', title: 'Gasoline Cathedral', artist: 'The Hollow Kings', album: 'Rust and Hymns',
        genre: 'rock', releaseYear: 2004, popularity: 71, explicit: false,
        lines: [
            'Gasoline cathedral burning on the highway',
            'Choir of engines screaming through the canyon',
            'Broken guitar strings tangled in my fingers',
            'We built a kingdom out of thunder and regret',
            'Chrome saints kneeling on the shoulder of the road',
            'Sleeping in the back seat of a stolen sunrise',
            'Every bridge we crossed was made of matches',
            'Kick the amplifier till the windows shatter',
            'Whiskey prophets preaching to the desert',
            'Wrote your name in oil across the pavement',
            'Feedback howling like a wounded wolf',
            'Headlights are the only stars we trusted'
        ]
    },
    {
        providerTrackId: 'syn-0005', title: 'Porchlight Promise', artist: 'Callie Redwood', album: 'Long Road Home',
        genre: 'country', releaseYear: 2012, popularity: 74, explicit: false,
        lines: [
            'Leave the porchlight burning till the tractor rolls in',
            'Dust on the dashboard of a rusted pickup',
            'Mama hums a hymn beside the kitchen window',
            'Boots by the doorway and a heart on the fence',
            'Fireflies are wishing on the river tonight',
            'Kissed you underneath the water tower',
            'Sunday morning gravel crunching soft and slow',
            'Every mile marker whispers your name',
            'We carved our initials in the cottonwood',
            'Sweet tea sweating on the wooden railing',
            'Porchlight promise, I will find my way home',
            'The radio still plays our song in the barn'
        ]
    },
    {
        providerTrackId: 'syn-0006', title: 'Glass Shoulders', artist: 'Vera Solace', album: 'Midnight Grammar',
        genre: 'pop', releaseYear: 2019, popularity: 69, explicit: false,
        lines: [
            'Glass shoulders carry every heavy morning',
            'I painted the ceiling with your favorite color',
            'Broken compass spinning on the nightstand',
            'You sent a postcard from a city with no rain',
            'Coffee getting cold beside the telephone',
            'I wore your hoodie like a borrowed armor',
            'Balloons deflating on the birthday table',
            'Someday the mirror is going to forgive me',
            'We danced in the kitchen with the lights off',
            'Glass shoulders, glass shoulders, do not let me fall',
            'Every song on the playlist was a warning',
            'Sunlight cracked the silence like an egg'
        ]
    },
    {
        providerTrackId: 'syn-0007', title: 'Trophy Case', artist: 'Kade Lumen', album: 'Overtime',
        genre: 'hiphop', releaseYear: 2022, popularity: 91, explicit: true,
        lines: [
            'Trophy case in the hallway getting crowded',
            'Started in the basement with a broken microphone',
            'Now the whole arena screaming out my lyrics',
            'Diamond chains swinging like a pendulum',
            'Every doubter bought a ticket to the finale',
            'Mama got the mansion on the hillside',
            'Turned the pressure into platinum bracelets',
            'Locked in like a vault inside a vault',
            'Backpack full of notebooks and ambition',
            'Ran the marathon before the sun woke up',
            'Talk is cheap but the receipts are expensive',
            'Overtime, overtime, till the scoreboard breaks'
        ]
    },
    {
        providerTrackId: 'syn-0008', title: 'Copper Moon', artist: 'Silas Verne', album: 'Lanterns',
        genre: 'rnb', releaseYear: 2008, popularity: 66, explicit: false,
        lines: [
            'Copper moon hanging over the boulevard',
            'Your perfume lingers on the leather seat',
            'Slow dance in the parking lot at closing time',
            'Streetlamp halo on your velvet dress',
            'Whisper something sweeter than the saxophone',
            'Strawberries and champagne on the balcony',
            'Your laughter is the melody I sample',
            'Fingerprints on the window of the limousine',
            'Rain on the roof like a drummer falling asleep',
            'Copper moon, copper moon, pour your light on us',
            'I wrote your name inside the vinyl sleeve',
            'Hold me till the candle finally surrenders'
        ]
    },
    {
        providerTrackId: 'syn-0009', title: 'Static Halo', artist: 'Bright Machinery', album: 'Signal Fires',
        genre: 'rock', releaseYear: 2015, popularity: 63, explicit: false,
        lines: [
            'Static halo flickering above the stadium',
            'We are the ghosts inside the broken speakers',
            'Cut the cable and let the feedback bleed',
            'Concrete lullaby for the sleepless city',
            'Dragging our shadows down the fire escape',
            'Every chorus is a bruise we wear with pride',
            'Paper airplanes crashing in the rafters',
            'Scream until the satellites remember',
            'Rusted anthems rattling in the basement',
            'Static halo, crown me in the noise',
            'The drummer counts the heartbeat of the riot',
            'We painted lightning on the water tower'
        ]
    },
    {
        providerTrackId: 'syn-0010', title: 'Tailgate Sky', artist: 'Boone Carter', album: 'Backroad Radio',
        genre: 'country', releaseYear: 2020, popularity: 79, explicit: false,
        lines: [
            'Tailgate sky painted orange over the cornfield',
            'Cooler full of thunder and a guitar out of tune',
            'Dancing on the dirt road in your daddy\'s boots',
            'Fireworks whispering across the county line',
            'Bonfire crackling like an old cassette',
            'Painted our initials on the water tower',
            'Dashboard glowing like a lantern in the dark',
            'Every summer ends with gravel in my shoes',
            'Tailgate sky, keep the stars in your pocket',
            'Cicadas humming the harmony we forgot',
            'Wrote you a love song on a napkin from the diner',
            'Headlights sweeping past the sleeping barn'
        ]
    },
    {
        providerTrackId: 'syn-0011', title: 'Marble Kitchen', artist: 'Delphine Ash', album: 'Slow Chemistry',
        genre: 'rnb', releaseYear: 2021, popularity: 72, explicit: false,
        lines: [
            'Marble kitchen glowing at the golden hour',
            'Dripping strawberries across the counter',
            'You hum my melody while the coffee brews',
            'Bare feet dancing on the cold tile',
            'Sunday morning smells like cinnamon and jazz',
            'Your fingerprints are all across my playlist',
            'Sugar in the silence when you say my name',
            'Every window holds a different version of you',
            'Marble kitchen, marble kitchen, stay for breakfast',
            'The record skips whenever you smile',
            'Draw the curtains and the city disappears',
            'Butter melting like the promises we keep'
        ]
    },
    {
        providerTrackId: 'syn-0012', title: 'Corner Store Crown', artist: 'Marlow Reign', album: 'Asphalt Gospel',
        genre: 'hiphop', releaseYear: 2016, popularity: 77, explicit: true,
        lines: [
            'Corner store crown on the king of the block',
            'Quarter water dreams and a dollar in my sock',
            'Chalk outlines faded but the memory stays',
            'Basketball rhythm on the summer pavement',
            'Grandma\'s remedy was patience and a prayer',
            'Turned the stoop into a stage every evening',
            'Landlord knocking louder than the drums',
            'Notebook pages bleeding with the truth',
            'Skyline stitched into the back of my hoodie',
            'Corner store crown, they can never take it',
            'Loyalty is heavier than any chain',
            'Feed the block before you feed your ego'
        ]
    },
    {
        providerTrackId: 'syn-0013', title: 'Satellite Lullaby', artist: 'Juno Wilder', album: 'Orbit',
        genre: 'pop', releaseYear: 2023, popularity: 85, explicit: false,
        lines: [
            'Satellite lullaby humming through the speakers',
            'Send me a signal from the other side of the ocean',
            'I fall asleep with the television glowing',
            'Your voicemail is a blanket in the winter',
            'Counting airplanes like they are shooting stars',
            'Rooftop pool reflecting all the neon',
            'I bought a globe and circled where you are',
            'Static in the headphones sounds like rain',
            'Satellite lullaby, sing me back to sleep',
            'Keep the porch light on across the planet',
            'Every timezone is a room I cannot enter',
            'Trace the constellations on my ceiling'
        ]
    },
    {
        providerTrackId: 'syn-0014', title: 'Amber Highway', artist: 'The Hollow Kings', album: 'Rust and Hymns',
        genre: 'rock', releaseYear: 2004, popularity: 68, explicit: false,
        lines: [
            'Amber highway stretching like a scar',
            'Engine coughing in the freezing morning',
            'Sold my compass for a tank of gasoline',
            'Radio preacher shouting through the static',
            'Cactus shadows pointing toward the border',
            'Motel bibles full of phone numbers',
            'Chasing thunderstorms across the flatlands',
            'Amber highway, carry me to nowhere',
            'The drummer sleeps beneath the merchandise',
            'Strangers waving from a burning billboard',
            'Vultures circle like a broken record',
            'Every exit sign is written in lightning'
        ]
    },
    {
        providerTrackId: 'syn-0015', title: 'Honeysuckle Fence', artist: 'Callie Redwood', album: 'Long Road Home',
        genre: 'country', releaseYear: 2012, popularity: 61, explicit: false,
        lines: [
            'Honeysuckle climbing up the broken fence',
            'Grandpa\'s fiddle sleeping in the attic',
            'Sundress blowing like a flag of surrender',
            'Church bells arguing with the rooster',
            'Pie cooling on the windowsill at noon',
            'Wrote a letter with a pencil and a prayer',
            'Muddy river carries every secret south',
            'Honeysuckle fence, keep the sweetness close',
            'Barefoot on the porch with a jar of lightning',
            'Old dog sleeping underneath the swing',
            'Tin roof singing when the storm rolls in',
            'The scarecrow knows the words to every hymn'
        ]
    },
    {
        providerTrackId: 'syn-0016', title: 'Penthouse Echo', artist: 'Kade Lumen', album: 'Overtime',
        genre: 'hiphop', releaseYear: 2022, popularity: 83, explicit: true,
        lines: [
            'Penthouse echo bouncing off the marble',
            'Elevator music sounds like victory',
            'Rearview mirror full of empty lanes',
            'Bought my mother a garden on the balcony',
            'Every handshake is a contract in the making',
            'Champagne bubbles rising like the rent',
            'They wanted silence so I brought the orchestra',
            'Penthouse echo, hear my name repeated',
            'Suitcase full of passports and apologies',
            'I sleep with one eye on the skyline',
            'Wolves in cashmere waiting in the lobby',
            'Bulletproof ambition, velvet interior'
        ]
    },
    {
        providerTrackId: 'syn-0017', title: 'Cherry Static', artist: 'Juno Wilder', album: 'Orbit',
        genre: 'pop', releaseYear: 2023, popularity: 78, explicit: false,
        lines: [
            'Cherry static crackling on the dance floor',
            'Bubblegum lightning in a plastic cup',
            'You spun me like a record in the hallway',
            'Confetti in my hair until September',
            'Glitter on the pavement after closing',
            'Kiss me quick before the DJ changes',
            'Cherry static, cherry static, turn it up',
            'Polaroid smile that I cannot throw away',
            'Roller skates squealing on the boardwalk',
            'Every crush I had was a summer storm',
            'Lemonade sunset dripping down the sky',
            'We wrote our names in sparklers on the beach'
        ]
    },
    {
        providerTrackId: 'syn-0018', title: 'Lantern Bay', artist: 'Silas Verne', album: 'Lanterns',
        genre: 'rnb', releaseYear: 2008, popularity: 58, explicit: false,
        lines: [
            'Lantern bay glowing on the harbor water',
            'Saxophone drifting from the ferry deck',
            'Your silhouette is a painting on the pier',
            'Salt in the breeze and sugar on your lips',
            'Lighthouse turning slowly like a lover',
            'Barefoot on the dock until the tide comes in',
            'Lantern bay, hold the evening still',
            'Fishermen whistle the chorus we invented',
            'Moonlight folded neatly on the sand',
            'Anchor my heart beside the sleeping boats',
            'Every wave rewrites the letter I forgot',
            'Velvet fog rolling over the marina'
        ]
    },
    {
        providerTrackId: 'syn-0019', title: 'Basement Cathedral', artist: 'Bright Machinery', album: 'Signal Fires',
        genre: 'rock', releaseYear: 2015, popularity: 55, explicit: false,
        lines: [
            'Basement cathedral with a drum kit for an altar',
            'Candles made of amplifiers burning bright',
            'Our hymns are distortion and a broken snare',
            'Spray paint scripture on the boiler room',
            'The neighbors pound the ceiling like a metronome',
            'Wires tangled like a crown of thorns',
            'Basement cathedral, baptize me in noise',
            'Every rehearsal is a small revolution',
            'Cassette confessions hidden in the rafters',
            'The furnace hums the bassline we forgot',
            'Sweat and glory dripping from the pipes',
            'We built a choir out of borrowed speakers'
        ]
    },
    {
        providerTrackId: 'syn-0020', title: 'Diner Constellation', artist: 'Boone Carter', album: 'Backroad Radio',
        genre: 'country', releaseYear: 2020, popularity: 64, explicit: false,
        lines: [
            'Diner constellation blinking on the interstate',
            'Coffee refills and a jukebox out of quarters',
            'Waitress knows my order and my heartbreak',
            'Truckers trading stories like a poker game',
            'Pancakes stacked as high as the mountains',
            'Neon sign buzzing like a June bug',
            'Diner constellation, guide me through the dark',
            'Ketchup on the map of where we are going',
            'Windshield wipers keeping time with the steel guitar',
            'Every booth is a chapel for the lonely',
            'Sugar packets stacked into a tiny tower',
            'Sunrise pouring syrup on the parking lot'
        ]
    },
    {
        providerTrackId: 'syn-0021', title: 'Pager Dreams', artist: 'Lady Quinnell', album: 'Dial Tone',
        genre: 'rnb', releaseYear: 1997, popularity: 70, explicit: false,
        lines: [
            'Pager dreams buzzing on the nightstand',
            'Call me from the payphone by the station',
            'Slow jam whispering through the cordless',
            'Braided moonlight on the fire escape',
            'Your denim jacket hanging on my chair',
            'Cassette rewinding to the part you loved',
            'Pager dreams, pager dreams, answer when I call',
            'Boombox glowing on the corner after curfew',
            'Sweetness written in a beeper code',
            'Roller rink lights spinning through my memory',
            'Every dial tone sounds like waiting',
            'Dance with me until the street sweeper comes'
        ]
    },
    {
        providerTrackId: 'syn-0022', title: 'Boombox Prophet', artist: 'Rezz Almanac', album: 'Cardboard Empire',
        genre: 'hiphop', releaseYear: 1994, popularity: 73, explicit: true,
        lines: [
            'Boombox prophet on the milk crate throne',
            'Cardboard empire rising from the courtyard',
            'Sneakers laced with lightning and ambition',
            'Subway rumble is the drum beneath my verses',
            'Graffiti halo on the handball wall',
            'Cypher circle burning like a bonfire',
            'Boombox prophet, let the block bear witness',
            'Every rhyme a brick inside the tower',
            'Fat laces and a notebook full of thunder',
            'Payphone ringing with a record deal',
            'Grandmother waving from the seventh floor',
            'The pavement knows the gospel that I wrote'
        ]
    },
    {
        providerTrackId: 'syn-0023', title: 'Mirrorball Winter', artist: 'Ivy Castellan', album: 'Frost Disco',
        genre: 'pop', releaseYear: 1986, popularity: 67, explicit: false,
        lines: [
            'Mirrorball winter spinning over the plaza',
            'Snowflakes dancing like a thousand strangers',
            'Synthesizer heartbeat under my sweater',
            'Neon scarf trailing down the frozen avenue',
            'Kiss me on the escalator going nowhere',
            'Mirrorball winter, glitter in the frost',
            'Every window is a stage for the lonely',
            'Cassette sunrise humming through the static',
            'Ice on the fountain and fire in your eyes',
            'We skated circles on the parking garage',
            'Champagne laughter echoing in the subway',
            'The city wears a crown of frozen lightning'
        ]
    },
    {
        providerTrackId: 'syn-0024', title: 'Thunder Chapel', artist: 'Dust Revival', album: 'Dust Revival',
        genre: 'rock', releaseYear: 1978, popularity: 75, explicit: false,
        lines: [
            'Thunder chapel shaking on the mountain',
            'Preacher with a guitar made of lightning',
            'Congregation stomping on the wooden floor',
            'Wine and gasoline poured in the same cup',
            'Every hallelujah is a broken cymbal',
            'Thunder chapel, ring the iron bell',
            'Sinners dancing in the burning meadow',
            'Motorcycle hymn roaring down the valley',
            'Feathers and rust falling from the steeple',
            'Kneel before the amplifier and pray',
            'The organ bleeds a chorus into midnight',
            'Smoke signals rising from the drummer\'s hands'
        ]
    },
    {
        providerTrackId: 'syn-0025', title: 'Wildflower Radio', artist: 'June Halloran', album: 'Gravel Roads',
        genre: 'country', releaseYear: 1999, popularity: 62, explicit: false,
        lines: [
            'Wildflower radio playing on the tractor',
            'Painted the mailbox the color of your laughter',
            'Mason jar sunshine on the kitchen table',
            'Wind chimes gossip on the porch at supper',
            'Fence post letters carved with a pocketknife',
            'Wildflower radio, sing me down the driveway',
            'Cattle dreaming under a quilt of stars',
            'Every dance we had was in the hayloft',
            'Lemonade and lightning on a July evening',
            'Hound dog howling with the steel guitar',
            'Storm clouds rolling like a wagon wheel',
            'Kissed you goodbye beside the sleeping combine'
        ]
    },
    {
        providerTrackId: 'syn-0026', title: 'Elevator Saints', artist: 'Ivy Castellan', album: 'Frost Disco',
        genre: 'pop', releaseYear: 1986, popularity: 54, explicit: false,
        lines: [
            'Elevator saints rising through the tower',
            'Lipstick prayers written on the mirror',
            'Shoulder pads and heartbreak in the lobby',
            'The bellhop whistles every song we ruined',
            'Chandelier confetti falling on the ballroom',
            'Elevator saints, take me to the rooftop',
            'Velvet ropes and telephones that never ring',
            'Dancing with the doorman in the snow',
            'Every floor a different kind of lonely',
            'Perfume ghosts drifting through the hallway',
            'The penthouse lights are winking at the harbor',
            'Cufflinks glittering like distant satellites'
        ]
    }
];

function buildSyntheticTrack(entry) {
    return {
        provider: 'synthetic',
        providerTrackId: entry.providerTrackId,
        isrc: null,
        title: entry.title,
        artist: entry.artist,
        album: entry.album,
        artwork: null,
        genres: [entry.genre],
        primaryGenre: entry.genre,
        releaseYear: entry.releaseYear,
        language: 'en',
        explicit: !!entry.explicit,
        instrumental: false,
        hasLyrics: true,
        hasSubtitles: false,
        hasRichSync: false,
        popularity: entry.popularity,
        copyright: SYNTHETIC_MARKER,
        synthetic: true,
        providerMetadata: { marker: SYNTHETIC_MARKER }
    };
}

function buildSyntheticLyric(entry) {
    return {
        provider: 'synthetic',
        providerLyricId: `${entry.providerTrackId}-lyric`,
        body: entry.lines.join('\n'),
        language: 'en',
        copyright: SYNTHETIC_MARKER,
        territoryRestrictions: [],
        explicit: !!entry.explicit,
        provenance: { source: 'fixtures/syntheticCatalog.js', synthetic: true }
    };
}

module.exports = { SYNTHETIC_MARKER, tracks, buildSyntheticTrack, buildSyntheticLyric };
