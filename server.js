const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const port = 3000;

app.use(express.static('public'));

// Questions fixes
const questionsFixes = [
  {
    question: "Quelle est la capitale de la France ?",
    reponses: ["Paris", "Lyon", "Marseille", "Nice"],
    bonne: 0,
  },
  {
    question: "Combien font 2 + 2 ?",
    reponses: ["3", "4", "5", "22"],
    bonne: 1,
  },
];

let currentQuestionIndex = 0;
const players = {}; // { socketId: { score, answer } }

io.on('connection', (socket) => {
  console.log('Un joueur est connecté:', socket.id);

  // Envoyer la question courante au joueur qui vient de se connecter
  socket.emit('question', questionsFixes[currentQuestionIndex]);

  // Quand un joueur répond
  socket.on('answer', (answerIndex) => {
    console.log(`Réponse de ${socket.id}: ${answerIndex}`);

    if (!players[socket.id]) players[socket.id] = { score: 0 };

    players[socket.id].answer = answerIndex;

    if (answerIndex === questionsFixes[currentQuestionIndex].bonne) {
      players[socket.id].score++;
    }

    // Envoyer le score mis à jour au joueur
    socket.emit('score', players[socket.id].score);

    // Envoyer à tous (host) l’état des réponses
    io.emit('playersAnswers', players);
  });

  socket.on('disconnect', () => {
    console.log('Joueur déconnecté:', socket.id);
    delete players[socket.id];
    io.emit('playersAnswers', players);
  });
});

http.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
