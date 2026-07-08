const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

module.exports = function startEmbeddedServer(port, userDataDir, appRootDir) {
  return new Promise((resolve, reject) => {
    const appStaticDir = path.join(appRootDir, 'app');
    const dataFile = path.join(userDataDir, 'data.json');
    const defaultFile = path.join(appRootDir, 'server-data', 'data.default.json');

    function loadState() {
      try {
        if (fs.existsSync(dataFile)) {
          return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        }
      } catch (e) {
        console.error('Erreur de lecture des données, chargement des données par défaut :', e.message);
      }
      return JSON.parse(fs.readFileSync(defaultFile, 'utf8'));
    }

    function saveState(state) {
      fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
    }

    let state = loadState();

    const expressApp = express();
    const server = http.createServer(expressApp);
    const io = new Server(server);

    expressApp.use(express.json({ limit: '10mb' }));
    expressApp.use(express.static(appStaticDir));

    expressApp.get('/api/state', (req, res) => {
      res.json(state);
    });

    expressApp.post('/api/state', (req, res) => {
      state = req.body;
      saveState(state);
      io.emit('state:changed', state);
      res.json({ ok: true });
    });

    io.on('connection', (socket) => {
      socket.emit('state:changed', state);
    });

    server.on('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
};
