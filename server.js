const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const questionsFixes = require('./questions');

const port = 3000;

app.use(express.static('public'));

let currentQuestionIndex = -1; // Phase d'attente initiale
let questionStartTime = null;
const players = {}; // { socketId: { pseudo, score, answer } }

io.on('connection', (socket) => {
  console.log('Un joueur est connecté:', socket.id);

  socket.on('pseudo', (pseudo) => {
    players[socket.id] = { pseudo, score: 0, answer: null };
    console.log(`Pseudo défini : ${pseudo}`);

    // Informer le joueur qu’il doit patienter
    socket.emit('waitingForStart');

    // Met à jour la liste des joueurs côté host
    io.emit('playerList', Object.values(players).map(p => p.pseudo));
  });

  socket.on('startQuiz', () => {
    currentQuestionIndex = 0;
    for (let id in players) {
      players[id].answer = null;
      players[id].score = 0;
    }
    questionStartTime = Date.now();
    io.emit('question', questionsFixes[currentQuestionIndex]);
  });

  socket.on('nextQuestion', () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < questionsFixes.length) {
      for (let id in players) {
        players[id].answer = null;
      }
      questionStartTime = Date.now();
      io.emit('question', questionsFixes[currentQuestionIndex]);
    } else {
      const classement = Object.values(players)
        .map(p => ({ pseudo: p.pseudo, score: p.score }))
        .sort((a, b) => b.score - a.score);
      io.emit('quizEnd', classement);
    }
  });

  socket.on('answer', (answerIndex) => {
    if (!players[socket.id] || players[socket.id].answer !== null) return;

    players[socket.id].answer = answerIndex;

    const delay = (Date.now() - questionStartTime) / 1000; // en secondes
    const maxDelay = 7;
    let bonus = 0;

    if (answerIndex === questionsFixes[currentQuestionIndex].bonne) {
      players[socket.id].score += 1;
      const maxBonus = 0.5;
      if (delay < maxDelay) {
        bonus = ((maxDelay - delay) / maxDelay) * maxBonus;
        bonus = Math.max(0, Math.min(maxBonus, bonus));
        players[socket.id].score += Number(bonus.toFixed(2));
      }
    }

    socket.emit('waiting');
    io.emit('playersAnswers', players);
  });

  socket.on('disconnect', () => {
    console.log('Joueur déconnecté:', socket.id);
    delete players[socket.id];
    io.emit('playerList', Object.values(players).map(p => p.pseudo));
    io.emit('playersAnswers', players);
  });

  // Si le quiz a commencé, envoyer la question courante
  if (currentQuestionIndex >= 0) {
    socket.emit('question', questionsFixes[currentQuestionIndex]);
  } else {
    socket.emit('waitingForStart');
  }
});

http.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
