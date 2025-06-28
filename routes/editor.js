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

// GET editor view for a file (find file by node_id, regardless of owner)
router.get('/:node_id', requireAuth, async (req, res) => {
    const node_id = req.params.node_id;
    try {
        // Search for the file in all files the user can access
        const searchRes = await fetch(`${API_BASE_URL}/filesystem/${req.user.username}/search`, { headers });
        const searchData = await searchRes.json();
        if (!searchData.success || !searchData.nodes) {
            return res.status(404).render('error', { message: 'File not found' });
        }
        const file = searchData.nodes.find(f => f.node_id === node_id);
        if (!file) {
            return res.status(404).render('error', { message: 'File not found' });
        }
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
    const node_id = req.params.node_id;
    const { text, tags, name } = req.body;
    try {
        // Find the file and its owner
        const searchRes = await fetch(`${API_BASE_URL}/filesystem/${req.user.username}/search`, { headers });
        const searchData = await searchRes.json();
        if (!searchData.success || !searchData.nodes) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        const file = searchData.nodes.find(f => f.node_id === node_id);
        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        if (file.owner !== req.user.username) {
            return res.status(403).json({ success: false, error: 'Not owner' });
        }
        // Save changes
        const putRes = await fetch(`${API_BASE_URL}/filesystem/${file.owner}/${node_id}`, {
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
    const node_id = req.params.node_id;
    try {
        // Find the file and its owner
        const searchRes = await fetch(`${API_BASE_URL}/filesystem/${req.user.username}/search`, { headers });
        const searchData = await searchRes.json();
        if (!searchData.success || !searchData.nodes) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        const file = searchData.nodes.find(f => f.node_id === node_id);
        if (!file) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        if (file.owner !== req.user.username) {
            return res.status(403).json({ success: false, error: 'Not owner' });
        }
        // Delete file
        const delRes = await fetch(`${API_BASE_URL}/filesystem/${file.owner}/${node_id}`, {
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
