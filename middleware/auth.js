const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            throw new Error('No authorization header');
        }
        
        const token = authHeader.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.userId) {
            throw new Error('Invalid token type');
        }
        const user = await User.findById(decoded.userId);

        if (!user) {
            throw new Error('User not found');
        }

        req.token = token;
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Please authenticate.' });
    }
};

module.exports = auth; 