const passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const InstagramStrategy = require('passport-instagram').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');

// Serialize user for the session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// X (Twitter) Strategy
if (process.env.TWITTER_CONSUMER_KEY && process.env.TWITTER_CONSUMER_SECRET) {
    passport.use(new TwitterStrategy({
        consumerKey: process.env.TWITTER_CONSUMER_KEY,
        consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
        callbackURL: process.env.TWITTER_CALLBACK_URL,
        includeEmail: true
    }, async (token, tokenSecret, profile, done) => {
        try {
            return done(null, {
                id: profile.id,
                displayName: profile.displayName,
                emails: profile.emails ? [{ value: profile.emails[0].value }] : [{ value: `${profile.id}@twitter.com` }],
                photos: profile.photos ? [{ value: profile.photos[0].value }] : [{ value: 'assets/default-avatar.png' }]
            });
        } catch (error) {
            return done(error, null);
        }
    }));
}

// Instagram Strategy
if (process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET) {
    passport.use(new InstagramStrategy({
        clientID: process.env.INSTAGRAM_CLIENT_ID,
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
        callbackURL: process.env.INSTAGRAM_CALLBACK_URL
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            return done(null, {
                id: profile.id,
                displayName: profile.displayName,
                emails: profile.emails ? [{ value: profile.emails[0].value }] : [{ value: `${profile.id}@instagram.com` }],
                photos: profile.photos ? [{ value: profile.photos[0].value }] : [{ value: 'assets/default-avatar.png' }]
            });
        } catch (error) {
            return done(error, null);
        }
    }));
}

// Facebook Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'displayName', 'photos', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            return done(null, {
                id: profile.id,
                displayName: profile.displayName,
                emails: profile.emails ? [{ value: profile.emails[0].value }] : [{ value: `${profile.id}@facebook.com` }],
                photos: profile.photos ? [{ value: profile.photos[0].value }] : [{ value: 'assets/default-avatar.png' }]
        });
        } catch (error) {
            return done(error, null);
        }
    }));
}

module.exports = passport; 