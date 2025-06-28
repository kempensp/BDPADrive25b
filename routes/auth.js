const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const SECRET_KEY = process.env.SECRET_KEY || 'changeme'; // Use .env secret key

const API_BASE_URL = 'https://drive.api.hscc.bdpa.org/v1';

// For simulating email sending
const emailQueue = new Map();

// Create a fake SMTP transport for development
const transporter = nodemailer.createTransport({
  jsonTransport: true
});

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.BEARER_TOKEN ? process.env.BEARER_TOKEN.trim() : ''}`
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
            console.error('Login failed: /users/:username response', userResponse.status, userData);
            return res.render('auth', { error: 'Login failed: User not found or invalid credentials.' });
        }
        // Derive key using password and salt
        const key = await deriveKey(password, userData.user.salt);
        // Attempt authentication
        const authResponse = await fetch(`${API_BASE_URL}/users/${username}/auth`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ key })
        });
        let authError = '';
        if (authResponse.status !== 200) {
            try {
                const authData = await authResponse.json();
                authError = authData.error || '';
                console.error('Login failed: /users/:username/auth response', authResponse.status, authData);
            } catch (e) {
                console.error('Login failed: /users/:username/auth response', authResponse.status, 'Could not parse JSON');
            }
            return res.render('auth', { error: 'Login failed: Invalid credentials.' + (authError ? ' ' + authError : '') });
        }
        // Create session
        req.session.token = jwt.sign({ username }, SECRET_KEY);
        req.session.username = username;
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Login error:', err);
        res.render('auth', { error: 'An error occurred during login: ' + err.message });
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
            req.session.token = jwt.sign({ username }, SECRET_KEY);
            req.session.username = username;
            res.redirect('/dashboard');
        } else {
            console.error('Registration failed:', response.status, data);
            res.render('auth', { error: 'Registration failed: ' + (data.error || 'Unknown error') });
        }
    } catch (err) {
        console.error('Registration error:', err);
        res.render('auth', { error: 'An error occurred: ' + err.message });
    }
});

/* POST logout */
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth');
});

/* POST forgot password */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    // Find user by email
    const usersResponse = await fetch(`${API_BASE_URL}/users`, { headers });
    const usersData = await usersResponse.json();
    const user = usersData.users.find(u => u.email === email);
    if (!user) {
      return res.json({ success: true }); // Don't reveal if email exists
    }
    // Generate recovery token
    const token = crypto.randomBytes(32).toString('hex');
    emailQueue.set(token, {
      username: user.username,
      expires: Date.now() + (60 * 60 * 1000) // 1 hour expiry
    });
    // Simulate sending email
    const recoveryLink = `http://localhost:3000/auth/reset-password?token=${token}`;
    const info = await transporter.sendMail({
      from: 'noreply@bdpadrive.com',
      to: email,
      subject: 'Password Recovery - BDPADrive',
      text: `Click this link to reset your password: ${recoveryLink}\nThis link will expire in 1 hour.`
    });
    // Log the email for development
    console.log('Recovery email sent:', info.message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* GET reset password page */
router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  const recovery = emailQueue.get(token);
  
  if (!recovery || recovery.expires < Date.now()) {
    return res.render('error', { message: 'Invalid or expired recovery link' });
  }

  res.render('reset-password', { token });
});

/* POST reset password */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const recovery = emailQueue.get(token);
    if (!recovery || recovery.expires < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired recovery token' });
    }
    // Generate new salt and key
    const salt = crypto.randomBytes(16).toString('hex');
    const key = await deriveKey(password, salt);
    // Update user's credentials
    const response = await fetch(`${API_BASE_URL}/users/${recovery.username}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ salt, key })
    });
    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to update password' });
    }
    // Clean up recovery token
    emailQueue.delete(token);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* POST change password */
router.post('/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const username = req.session.username;
    // Get user's current salt
    const userResponse = await fetch(`${API_BASE_URL}/users/${username}`, { headers });
    const userData = await userResponse.json();
    if (!userData.success) {
      return res.status(400).json({ error: 'User not found' });
    }
    // Verify old password
    const oldKey = await deriveKey(oldPassword, userData.user.salt);
    const authResponse = await fetch(`${API_BASE_URL}/users/${username}/auth`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key: oldKey })
    });
    if (!authResponse.ok) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    // Generate new salt and key
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newKey = await deriveKey(newPassword, newSalt);
    // Update credentials
    const updateResponse = await fetch(`${API_BASE_URL}/users/${username}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ salt: newSalt, key: newKey })
    });
    if (!updateResponse.ok) {
      return res.status(400).json({ error: 'Failed to update password' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
