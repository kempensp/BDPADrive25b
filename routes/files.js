const express = require('express');
const router = express.Router();
const { auth, requireAuth } = require('../middleware/auth');
const fetch = require('node-fetch');
const { marked } = require('marked');

const API_URL = process.env.API_URL || 'https://drive.api.hscc.bdpa.org/v1';

// Show editor for a file
router.get('/:fileId', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/${req.params.fileId}`, {
      headers: { 'Authorization': `Bearer ${req.session.token}` }
    });
    
    const data = await response.json();
    if (!data.success || !data.nodes || !data.nodes[0]) {
      return res.status(404).render('error', { message: 'File not found' });
    }

    res.render('editor', { 
      file: data.nodes[0],
      currentUser: req.user
    });
  } catch (error) {
    res.render('error', { message: 'Error loading file' });
  }
});

// Create new file
router.post('/new', requireAuth, async (req, res) => {
  try {
    const { name, text, tags } = req.body;
    
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.session.token}`
      },
      body: JSON.stringify({
        type: 'file',
        name,
        text: text || '',
        tags: tags ? tags.split(',').map(tag => tag.trim().toLowerCase()) : []
      })
    });

    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({ error: 'Failed to create file' });
    }

    res.redirect(`/files/${data.node.node_id}`);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update file
router.put('/:fileId', requireAuth, async (req, res) => {
  try {
    const { name, text, tags } = req.body;
    
    // First check if we have a lock
    const fileResponse = await fetch(`${API_URL}/filesystem/${req.user.username}/${req.params.fileId}`);
    const fileData = await fileResponse.json();
    
    if (!fileData.success || !fileData.nodes || !fileData.nodes[0]) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = fileData.nodes[0];
    if (file.lock && file.lock.user !== req.user.username) {
      return res.status(403).json({ error: 'File is locked by another user' });
    }

    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/${req.params.fileId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.session.token}`
      },
      body: JSON.stringify({
        name,
        text,
        tags: tags.map(tag => tag.toLowerCase())
      })
    });

    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({ error: 'Failed to update file' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete file
router.delete('/:fileId', requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/${req.params.fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${req.session.token}` }
    });

    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({ error: 'Failed to delete file' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
