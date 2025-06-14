const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    const token = req.session.token;
    
    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, 'your-secret-key'); // In production, use environment variable
        req.user = decoded;
        next();
    } catch (err) {
        req.user = null;
        next();
    }
};

const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.redirect('/auth');
    }
    next();
};

module.exports = { auth, requireAuth };
