const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'your-secret-key'; // In production, use environment variable

const API_BASE_URL = 'https://drive.api.hscc.bdpa.org/v1';

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.BEARER_TOKEN.trim()}`
};

function deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(
            password,
            Buffer.from(salt, 'hex'),
            100000,
            64,
            'sha256',
            (err, derivedKey) => {
                if (err) reject(err);
                resolve(derivedKey.toString('hex'));
            }
        );
    });
}

/* GET auth page */
router.get('/', (req, res) => {
    res.render('auth', { error: null });
});

/* POST login */
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // Get user data to get salt
        const userResponse = await fetch(`${API_BASE_URL}/users/${username}`, { headers });
        const userData = await userResponse.json();
        
        if (!userData.success) {
            return res.render('auth', { error: 'Invalid credentials' });
        }
        
        // Derive key using password and salt
        const key = await deriveKey(password, userData.user.salt);
        
        // Attempt authentication
        const authResponse = await fetch(`${API_BASE_URL}/users/${username}/auth`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ key })
        });
        
        if (authResponse.status === 200) {
            // Create session
            req.session.token = jwt.sign({ username }, 'your-secret-key');
            res.redirect('/dashboard');
        } else {
            res.render('auth', { error: 'Invalid credentials' });
        }
    } catch (err) {
        res.render('auth', { error: 'An error occurred' });
    }
});

/* POST register */
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    try {
        // Generate salt
        const salt = crypto.randomBytes(16).toString('hex');
        
        // Derive key
        const key = await deriveKey(password, salt);
        
        // Register user
        const response = await fetch(`${API_BASE_URL}/users`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                username,
                email,
                salt,
                key
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Create session
            req.session.token = jwt.sign({ username }, 'your-secret-key');
            res.redirect('/dashboard');
        } else {
            res.render('auth', { error: 'Registration failed' });
        }
    } catch (err) {
        res.render('auth', { error: 'An error occurred' });
    }
});

/* POST logout */
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth');
});

module.exports = router;
