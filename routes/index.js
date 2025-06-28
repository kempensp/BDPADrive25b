const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const fetch = require('node-fetch');

const API_BASE_URL = 'https://drive.api.hscc.bdpa.org/v1';

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.BEARER_TOKEN.trim()}`
};

/* GET home page - redirects to appropriate page based on auth status */
router.get('/', function(req, res, next) {
  if (req.user) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/auth');
  }
});

/* GET dashboard page - requires authentication */
router.get('/dashboard', requireAuth, async function(req, res, next) {
  try {
    // Get user's files
    const response = await fetch(`${API_BASE_URL}/filesystem/${req.user.username}/search`, { headers });
    const data = await response.json();
    
    res.render('dashboard', { 
      title: 'Dashboard',
      user: req.user,
      files: data.nodes || []
    });
  } catch (err) {
    next(err);
  }
});

/* GET search page - requires authentication */
router.get('/search', requireAuth, async function(req, res, next) {
  try {
    const { query } = req.query;
    let files = [];
    
    if (query) {
      const searchQuery = {
        name: query
      };        const response = await fetch(
            `${API_BASE_URL}/filesystem/${req.user.username}/search?match=${encodeURIComponent(JSON.stringify(searchQuery))}`,
            { headers }
        );
      const data = await response.json();
      files = data.nodes || [];
    }
    
    res.render('search', {
      title: 'Search',
      user: req.user,
      query,
      files
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
              <div class="file-name">
                <% if (file.type === 'file') { %>
                  <a href="/editor/<%= file.node_id %>"><%= file.name %></a>
                <% } else { %>
                  <%= file.name %>
                <% } %>
              </div>
