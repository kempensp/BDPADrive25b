const express = require('express');
const router = express.Router();
const { auth, requireAuth } = require('../middleware/auth');
const fetch = require('node-fetch');
const { marked } = require('marked');
const { createCanvas } = require('canvas');

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

// Create new file, folder, or symlink
router.post('/new', requireAuth, async (req, res) => {
  try {
    const { name, type, tags, target, text } = req.body;
    let body = { name, type };
    if (type === 'file') {
      body.text = text || '';
      body.tags = (tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    } else if (type === 'directory') {
      body.contents = [];
    } else if (type === 'symlink') {
      body.contents = target ? [target] : [];
    }
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.session.token}`
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!data.success) {
      return res.status(400).render('error', { message: 'Failed to create node: ' + (data.error || 'Unknown error') });
    }
    res.redirect('/explorer');
  } catch (err) {
    res.status(500).render('error', { message: 'Error creating node' });
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

// Delete file/folder/symlink
router.post('/:node_id/delete', requireAuth, async (req, res) => {
  try {
    const { node_id } = req.params;
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/${node_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${req.session.token}` }
    });
    const data = await response.json();
    if (!data.success) {
      return res.status(400).render('error', { message: 'Failed to delete node: ' + (data.error || 'Unknown error') });
    }
    res.redirect('/explorer');
  } catch (err) {
    res.status(500).render('error', { message: 'Error deleting node' });
  }
});

// Rename file/folder/symlink
router.post('/:node_id/rename', requireAuth, async (req, res) => {
  try {
    const { node_id } = req.params;
    const { newName } = req.body;
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/${node_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.session.token}`
      },
      body: JSON.stringify({ name: newName })
    });
    const data = await response.json();
    if (!data.success) {
      return res.status(400).render('error', { message: 'Failed to rename node: ' + (data.error || 'Unknown error') });
    }
    res.redirect('/explorer');
  } catch (err) {
    res.status(500).render('error', { message: 'Error renaming node' });
  }
});

// Update tags for file
router.post('/:node_id/tags', requireAuth, async (req, res) => {
  try {
    const { node_id } = req.params;
    const tags = (req.body.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/${node_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.session.token}`
      },
      body: JSON.stringify({ tags })
    });
    const data = await response.json();
    if (!data.success) {
      return res.status(400).render('error', { message: 'Failed to update tags: ' + (data.error || 'Unknown error') });
    }
    res.redirect('/explorer');
  } catch (err) {
    res.status(500).render('error', { message: 'Error updating tags' });
  }
});

// Move file/folder to another folder
router.post('/:node_id/move', requireAuth, async (req, res) => {
  try {
    const { node_id } = req.params;
    const { targetFolder } = req.body;
    // Get target folder node
    const targetRes = await fetch(`${API_URL}/filesystem/${req.user.username}/${targetFolder}`, {
      headers: { 'Authorization': `Bearer ${req.session.token}` }
    });
    const targetData = await targetRes.json();
    if (!targetData.success || !targetData.nodes || targetData.nodes[0].type !== 'directory') {
      return res.status(400).render('error', { message: 'Target must be a valid folder you own.' });
    }
    // Get node to move
    const nodeRes = await fetch(`${API_URL}/filesystem/${req.user.username}/${node_id}`, {
      headers: { 'Authorization': `Bearer ${req.session.token}` }
    });
    const nodeData = await nodeRes.json();
    if (!nodeData.success || !nodeData.nodes) {
      return res.status(400).render('error', { message: 'Node not found.' });
    }
    // Add node to target folder's contents
    const contents = targetData.nodes[0].contents || [];
    if (!contents.includes(node_id)) contents.push(node_id);
    const updateRes = await fetch(`${API_URL}/filesystem/${req.user.username}/${targetFolder}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.session.token}`
      },
      body: JSON.stringify({ contents })
    });
    const updateData = await updateRes.json();
    if (!updateData.success) {
      return res.status(400).render('error', { message: 'Failed to move node: ' + (updateData.error || 'Unknown error') });
    }
    res.redirect('/explorer');
  } catch (err) {
    res.status(500).render('error', { message: 'Error moving node' });
  }
});

// Change owner
router.post('/:node_id/owner', requireAuth, async (req, res) => {
  try {
    const { node_id } = req.params;
    const { newOwner } = req.body;
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/${node_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.session.token}`
      },
      body: JSON.stringify({ owner: newOwner })
    });
    const data = await response.json();
    if (!data.success) {
      return res.status(400).render('error', { message: 'Failed to change owner: ' + (data.error || 'Unknown error') });
    }
    res.redirect('/explorer');
  } catch (err) {
    res.status(500).render('error', { message: 'Error changing owner' });
  }
});

// Explorer view (GET)
router.get('/explorer', requireAuth, async (req, res) => {
  try {
    const sort = req.query.sort || 'name';
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/search`, {
      headers: { 'Authorization': `Bearer ${req.session.token}` }
    });
    const data = await response.json();
    let files = (data.nodes || []).filter(n => n.owner === req.user.username);
    // Mark broken symlinks
    files = files.map(f => {
      if (f.type === 'symlink') {
        const target = files.find(t => t.node_id === (f.contents && f.contents[0]));
        f.broken = !target || target.owner !== req.user.username || !f.contents || f.contents[0] === f.node_id;
      }
      return f;
    });
    // Sorting
    files.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'size') return (b.size || 0) - (a.size || 0);
      if (sort === 'createdAt') return b.createdAt - a.createdAt;
      if (sort === 'modifiedAt') return b.modifiedAt - a.modifiedAt;
      return 0;
    });
    res.render('explorer', { files, user: req.user });
  } catch (err) {
    res.status(500).render('error', { message: 'Error loading explorer' });
  }
});

// File preview thumbnail (Markdown to image)
router.get('/preview/:node_id', requireAuth, async (req, res) => {
  try {
    const { node_id } = req.params;
    // Get file node
    const response = await fetch(`${API_URL}/filesystem/${req.user.username}/${node_id}`, {
      headers: { 'Authorization': `Bearer ${req.session.token}` }
    });
    const data = await response.json();
    if (!data.success || !data.nodes || !data.nodes[0] || data.nodes[0].type !== 'file') {
      return res.status(404).end();
    }
    const file = data.nodes[0];
    // Render Markdown to HTML, then to plain text (for preview)
    const html = marked.parse((file.text || '').split('\n').slice(0, 5).join('\n'));
    // Strip HTML tags for a simple preview (or use a library for better rendering)
    const previewText = html.replace(/<[^>]+>/g, '').slice(0, 200);
    // Draw preview on canvas
    const canvas = createCanvas(300, 80);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 300, 80);
    ctx.fillStyle = '#222';
    ctx.font = '14px sans-serif';
    ctx.fillText(previewText, 10, 30, 280);
    res.set('Content-Type', 'image/png');
    canvas.pngStream().pipe(res);
  } catch (err) {
    res.status(500).end();
  }
});

module.exports = router;
