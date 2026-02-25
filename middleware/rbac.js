const { getUserEntitlements } = require('../services/entitlements');

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const userRole = req.user.role || 'USER_FAN';
        if (userRole === 'ADMIN') return next();
        if (!roles.includes(userRole)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
}

function requireAccountType(...types) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (req.user.role === 'ADMIN') return next();
        const acctType = req.user.accountType || 'fan';
        if (!types.includes(acctType)) {
            return res.status(403).json({ message: 'Account type not permitted for this action' });
        }
        next();
    };
}

async function loadEntitlements(req, res, next) {
    try {
        if (req.user) {
            req.entitlements = await getUserEntitlements(req.user);
        }
        next();
    } catch (error) {
        console.error('Error loading entitlements:', error);
        next();
    }
}

module.exports = { requireRole, requireAccountType, loadEntitlements };
