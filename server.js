const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const questionsFixes = require('./questions');
const port = 3000;

app.use(express.static('public'));

// Store parties by PIN
const parties = {}; // { pin: { hostId, players: {}, currentQuestionIndex, started, questionStartTime } }

function generatePIN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
  console.log('Connexion:', socket.id);

  // HOST crée une partie
  socket.on('createGame', () => {
    const pin = generatePIN();
    parties[pin] = {
      hostId: socket.id,
      players: {},
      currentQuestionIndex: -1,
      started: false,
      questionStartTime: null
    };
    socket.join(pin);
    socket.emit('gameCreated', pin);
    console.log(`🎮 Partie créée : PIN ${pin}`);
  });

  // PLAYER rejoint une partie
  socket.on('joinGame', ({ pin, pseudo }) => {
    const party = parties[pin];
    if (!party) {
      socket.emit('invalidPIN');
      return;
    }
    if (party.started) {
      socket.emit('gameAlreadyStarted');
      return;
    }

    party.players[socket.id] = { pseudo, score: 0, answer: null };
    socket.join(pin);

    // Confirmer la connexion au player
    socket.emit('joinedGame', { status: 'waiting', pin });

    // Mettre à jour le host avec les joueurs présents
    io.to(party.hostId).emit('updatePlayers', Object.values(party.players));
    console.log(`👤 ${pseudo} a rejoint la partie ${pin}`);
  });

  // HOST démarre la partie
  socket.on('startGame', (pin) => {
    const party = parties[pin];
    if (!party || socket.id !== party.hostId) return;

    party.started = true;
    party.currentQuestionIndex = 0;
    party.questionStartTime = Date.now();

    io.to(pin).emit('question', questionsFixes[party.currentQuestionIndex]);
  });

  // PLAYER répond à une question
  socket.on('answer', ({ pin, index }) => {
    const party = parties[pin];
    if (!party || !party.players[socket.id]) return;

    const player = party.players[socket.id];
    if (player.answer !== null) return;

    player.answer = index;

    const delay = (Date.now() - party.questionStartTime) / 1000;
    const maxDelay = 7;
    const maxBonus = 0.5;

    if (index === questionsFixes[party.currentQuestionIndex].bonne) {
      player.score += 1;
      let bonus = ((maxDelay - delay) / maxDelay) * maxBonus;
      bonus = Math.max(0, Math.min(maxBonus, bonus));
      player.score += Number(bonus.toFixed(2));
    }

    socket.emit('waiting');
    io.to(party.hostId).emit('updatePlayers', Object.values(party.players));
  });

  // HOST passe à la question suivante
  socket.on('nextQuestion', (pin) => {
    const party = parties[pin];
    if (!party || socket.id !== party.hostId) return;

    party.currentQuestionIndex++;
    if (party.currentQuestionIndex < questionsFixes.length) {
      for (let id in party.players) {
        party.players[id].answer = null;
      }
      party.questionStartTime = Date.now();
      io.to(pin).emit('question', questionsFixes[party.currentQuestionIndex]);
    } else {
      const classement = Object.values(party.players)
        .map(p => ({ pseudo: p.pseudo, score: p.score }))
        .sort((a, b) => b.score - a.score);
      io.to(pin).emit('quizEnd', classement);
    }
  });

  // HOST réinitialise la partie
  socket.on('resetGame', (pin) => {
    const party = parties[pin];
    if (!party || socket.id !== party.hostId) return;

    party.currentQuestionIndex = -1;
    party.started = false;

    for (let id in party.players) {
      party.players[id].score = 0;
      party.players[id].answer = null;
    }

    io.to(pin).emit('resetToLobby');
    io.to(party.hostId).emit('updatePlayers', Object.values(party.players));
  });

  // Gestion déconnexion joueur ou host
  socket.on('disconnect', () => {
    for (let pin in parties) {
      const party = parties[pin];

      if (party.players[socket.id]) {
        delete party.players[socket.id];
        io.to(party.hostId).emit('updatePlayers', Object.values(party.players));
      }

      if (party.hostId === socket.id) {
        io.to(pin).emit('quizEnd', []);
        delete parties[pin];
        console.log(`❌ Partie ${pin} terminée (host déconnecté)`);
      }
    }

    console.log('Déconnecté:', socket.id);
  });
});

http.listen(port, () => {
  console.log(`✅ Serveur en écoute sur http://localhost:${port}`);
});
