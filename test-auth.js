require('dotenv').config();
const fetch = require('node-fetch');
const crypto = require('crypto');

const API_BASE_URL = 'https://drive.api.hscc.bdpa.org/v1';

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BEARER_TOKEN ? process.env.BEARER_TOKEN.trim() : ''}`
    };
}

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

async function testAuth() {
    try {
        const username = 'testuser';
        const password = 'testpassword';
        const headers = getHeaders();
        
        console.log('Headers:', headers);
        
        // Get user data
        console.log(`Fetching user data for ${username}...`);
        const userResponse = await fetch(`${API_BASE_URL}/users/${username}`, { headers });
        const userData = await userResponse.json();
        
        console.log('User data:', userData);
        
        if (!userData.success) {
            console.log('User not found');
            return;
        }
        
        // Derive key
        console.log('Deriving key from password...');
        const key = await deriveKey(password, userData.user.salt);
        console.log('Derived key:', key);
        
        // Authenticate
        console.log('Attempting authentication...');
        const authResponse = await fetch(`${API_BASE_URL}/users/${username}/auth`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ key })
        });
        
        const authData = await authResponse.json();
        console.log('Auth response status:', authResponse.status);
        console.log('Auth response:', authData);
        
    } catch (err) {
        console.error('Error:', err);
    }
}

testAuth();
