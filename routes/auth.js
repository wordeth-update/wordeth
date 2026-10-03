const express = require('express');
const { setAuthCookie, clearAuthCookie } = require('../services/authCookie');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { getUserAccess } = require('../services/userAccess');
const auth = require('../middleware/auth');
const emailVerification = require('../services/emailVerification');

async function publicUserWithAccess(user) {
    const profile = user.getPublicProfile();
    try {
        const access = await getUserAccess(user);
        return { ...profile, customerAudience: access.customerAudience, access };
    } catch (error) {
        return profile;
    }
}

// Traditional sign up
router.post('/signup', [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, password, agreedToTerms } = req.body;

        if (!agreedToTerms) {
            return res.status(400).json({ message: 'You must agree to the Terms of Service and Privacy Policy to create an account.' });
        }
        
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({
                message: 'An account already exists for this email. Sign in instead — or, if you have forgotten the password, contact support@wordeth.com to reset it.',
                code: 'EMAIL_TAKEN',
            });
        }

        const existingName = await User.findOne({ name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
        if (existingName) {
            return res.status(400).json({ message: 'That name is already taken. Please choose a different one.' });
        }

        const user = new User({
            name, email, password,
            agreedToTerms: true,
            termsAgreedAt: new Date(),
            termsVersion: '1.0',
            emailVerified: false
        });
        await user.save();

        // The confirmation link. Not awaited: an account is made whether or
        // not the mail provider answers, and the link can be asked for again.
        emailVerification.start(user).catch((e) => console.warn('[Verify] send error:', e.message));

        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { 
            expiresIn: process.env.JWT_EXPIRES_IN || '7d' 
        });
        
        setAuthCookie(res, token);
        res.status(201).json({ token, user: await publicUserWithAccess(user) });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Traditional sign in
router.post('/signin', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { 
            expiresIn: process.env.JWT_EXPIRES_IN || '7d' 
        });
        setAuthCookie(res, token);
        res.json({ token, user: await publicUserWithAccess(user) });
    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/** The page somebody lands on from the link in their email. */
function verifyPage(title, line) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - Wordeth</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A0712;color:#fff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
<div style="max-width:420px;padding:32px;text-align:center;">
<img src="/images/logo.png" alt="Wordeth" style="height:96px;margin-bottom:24px;">
<h1 style="font-size:1.6rem;margin:0 0 12px;">${title}</h1>
<p style="font-size:1rem;line-height:1.5;color:#c9c3d6;margin:0;">${line}</p>
</div></body></html>`;
}

// The link in the confirmation email.
router.get('/verify-email', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const outcome = await emailVerification.finish(User, req.query.id, req.query.token);
        if (outcome === 'verified') return res.send(verifyPage('Email confirmed', 'Thank you. You can go back to the Wordeth app.'));
        if (outcome === 'already') return res.send(verifyPage('Already confirmed', 'This email was confirmed earlier. Nothing more to do.'));
        return res.status(400).send(verifyPage('This link has expired', 'Open Wordeth, go to Profile, and tap Resend to get a new one.'));
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).send(verifyPage('Something went wrong', 'Please try the link again in a moment.'));
    }
});

// Ask for the confirmation email again.
router.post('/resend-verification', auth, async (req, res) => {
    try {
        if (req.user.emailVerified === true) return res.json({ success: true, alreadyVerified: true, message: 'Your email is already confirmed.' });
        const r = await emailVerification.start(req.user);
        if (r.sent) return res.json({ success: true, message: `Sent to ${req.user.email}.` });
        if (r.reason === 'too_soon') return res.status(429).json({ message: 'One was just sent. Give it a minute, and check spam.' });
        if (r.reason === 'not_configured') return res.status(503).json({ message: 'Confirmation emails are not switched on yet.' });
        return res.status(502).json({ message: 'The email could not be sent. Try again shortly.' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Sign out: clears the shared cross-subdomain cookie (clients clear their own storage)
router.post('/signout', (req, res) => {
    clearAuthCookie(res);
    res.json({ success: true });
});

// Verify token
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid token' });
        }

        res.json({ user: await publicUserWithAccess(user) });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

module.exports = router; 