const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const fetch = require('node-fetch');

const API_BASE_URL = 'https://drive.api.hscc.bdpa.org/v1';

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.BEARER_TOKEN.trim()}`
};

// Get all files and folders for the authenticated user
router.get('/', requireAuth, async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/filesystem/${req.user.username}/search`, {
            method: 'GET',
            headers
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create new file or folder
router.post('/create', requireAuth, async (req, res) => {
    try {
        const { type, name, text, tags, contents } = req.body;
        // Build the body object only with defined fields
        const body = { type, name };
        if (typeof text !== 'undefined') body.text = text;
        if (typeof tags !== 'undefined') body.tags = tags;
        if (typeof contents !== 'undefined') body.contents = contents;
        // Do NOT include lock unless explicitly set
        const response = await fetch(`${API_BASE_URL}/filesystem/${req.user.username}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update file or folder
router.put('/:nodeId', requireAuth, async (req, res) => {
    try {
        const { name, text, tags, contents, owner } = req.body;
        const response = await fetch(`${API_BASE_URL}/filesystem/${req.user.username}/${req.params.nodeId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                name,
                text,
                tags,
                contents,
                owner
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete file or folder
router.delete('/:nodeId', requireAuth, async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/filesystem/${req.user.username}/${req.params.nodeId}`, {
            method: 'DELETE',
            headers
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
