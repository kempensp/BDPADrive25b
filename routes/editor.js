const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const marked = require('marked');
const { requireAuth } = require('../middleware/auth');

const API_BASE_URL = 'https://drive.api.hscc.bdpa.org/v1';
const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.BEARER_TOKEN.trim()}`
};

// GET editor view for a file
router.get('/:node_id', requireAuth, async (req, res) => {
    const username = req.user.username;
    const node_id = req.params.node_id;
    try {
        const response = await fetch(`${API_BASE_URL}/filesystem/${username}/${node_id}`, { headers });
        const data = await response.json();
        if (!data.success || !data.nodes || !data.nodes[0]) {
            return res.status(404).render('error', { message: 'File not found' });
        }
        const file = data.nodes[0];
        const html = marked.parse(file.text || '');
        res.render('editor', {
            title: file.name,
            file,
            html,
            user: req.user
        });
    } catch (err) {
        res.status(500).render('error', { message: 'Error loading file' });
    }
});

// POST save file changes
router.post('/:node_id/save', requireAuth, async (req, res) => {
    const username = req.user.username;
    const node_id = req.params.node_id;
    const { text, tags, name } = req.body;
    try {
        // Get file to check lock and ownership
        const response = await fetch(`${API_BASE_URL}/filesystem/${username}/${node_id}`, { headers });
        const data = await response.json();
        const file = data.nodes[0];
        if (file.owner !== username) {
            return res.status(403).json({ success: false, error: 'Not owner' });
        }
        // Save changes
        const putRes = await fetch(`${API_BASE_URL}/filesystem/${username}/${node_id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                text,
                tags: tags ? tags.split(',').map(t => t.trim().toLowerCase()) : [],
                name
            })
        });
        const putData = await putRes.json();
        res.json(putData);
    } catch (err) {
        res.status(500).json({ success: false, error: 'Save failed' });
    }
});

// POST delete file
router.post('/:node_id/delete', requireAuth, async (req, res) => {
    const username = req.user.username;
    const node_id = req.params.node_id;
    try {
        // Get file to check ownership
        const response = await fetch(`${API_BASE_URL}/filesystem/${username}/${node_id}`, { headers });
        const data = await response.json();
        const file = data.nodes[0];
        if (file.owner !== username) {
            return res.status(403).json({ success: false, error: 'Not owner' });
        }
        // Delete file
        const delRes = await fetch(`${API_BASE_URL}/filesystem/${username}/${node_id}`, {
            method: 'DELETE',
            headers
        });
        const delData = await delRes.json();
        res.json(delData);
    } catch (err) {
        res.status(500).json({ success: false, error: 'Delete failed' });
    }
});

module.exports = router;
