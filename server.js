const { createServer } = require("http");
const { Server } = require("socket.io");
const { instrument } = require("@socket.io/admin-ui");

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    credentials: true
  }
});

instrument(io, {
  auth: false
});

const PORT = 4000;
const ESTABLISH_CONNECTION = "establishConnection";
const NEW_CHAT_MESSAGE_EVENT = "newChatMessage";
const SEND_USERNAME_EVENT = "sendUsernane";
const CREATE_ROOM_EVENT = "createRoom";
const LEAVE_ROOM_EVENT = "leaveRoom";
const FETCH_ROOM_EVENT = "fetchRoom";
const JOIN_ROOM_EVENT = "joinRoom";
const FETCH_NUMBER_SOCKETS_EVENT = "fetchNumberSockets";

const SEND_READY_EVENT = "sendReady";
const SEND_SHOOT_EVENT = "sendShoot";
const RECV_SHOOT_EVENT = "recvShoot";
const SEND_LOSE_EVENT = "sendLose";
const SEND_RESTART_EVENT = "sendRestart";
const ADD_SCORE_EVENT = "addScore";
const SEND_RESET_EVENT = "sendReset";
const CHANGE_CURRENT_PLAYER = "changePlayer";
const rooms = {};

io.on("connection", (socket) => {
  // Join a conversation
  //console.log(socket.id + " joins the server");
  socket.emit(ESTABLISH_CONNECTION);
  io.emit(FETCH_NUMBER_SOCKETS_EVENT, io.of("/").sockets.size);

  socket.on(FETCH_NUMBER_SOCKETS_EVENT, () => {
    //console.log("Number of sockets", io.of("/").sockets.size);
    socket.emit(FETCH_NUMBER_SOCKETS_EVENT, io.of("/").sockets.size);
  });

  socket.on(FETCH_ROOM_EVENT, () => {
    socket.emit(FETCH_ROOM_EVENT, rooms);
  });

  socket.on(SEND_USERNAME_EVENT, (username) => {
    //console.log(`${socket.id} is ${username}`);
    socket.username = username;
    if (socket.joinGame && socket.roomId && rooms[socket.roomId]) {
      rooms[socket.roomId].users[socket.id][1] = username;
      return;
    }
    socket.joinGame = false;
    io.emit(FETCH_ROOM_EVENT, rooms);
  });

  socket.on(NEW_CHAT_MESSAGE_EVENT, (message) => {
    if (!socket.joinGame) {
      //console.log("socket not yet joined a game");
      return;
    }
    //console.log("chat incoming", message);
    const sendoutMessage = {
      ...message,
      senderId: socket.id,
      sender: socket.username,
    };
    rooms[socket.roomId].messages.push(sendoutMessage);
    io.in(socket.roomId).emit(NEW_CHAT_MESSAGE_EVENT, sendoutMessage);
    io.emit(FETCH_ROOM_EVENT, rooms);
  });

  socket.on(CREATE_ROOM_EVENT, ({ roomId, roomName, description }) => {
    if (socket.joinGame) {
      //console.log("socket not yet joined a game");
      return;
    }
    socket.joinGame = true;
    socket.roomId = roomId;
    rooms[socket.roomId] = {
      roomId,
      roomName,
      description,
      users: { [socket.id]: [socket.id, socket.username, 0] },
      messages: [],
      restart: { [socket.id]: false },
      ready: { [socket.id]: false },
      playable: false,
      currentPlayer: "",
      board: {},
    };
    //console.log("create room", rooms);
    socket.join(socket.roomId);
    io.emit(FETCH_ROOM_EVENT, rooms);
  });

  socket.on(JOIN_ROOM_EVENT, (roomId) => {
    if (socket.joinGame || !rooms[roomId]) {
      //console.log("socket already joined a game");
      return;
    }
    socket.joinGame = true;
    socket.roomId = roomId;
    rooms[socket.roomId].users[socket.id] = [socket.id, socket.username, 0];
    rooms[socket.roomId].restart[socket.id] = false;
    rooms[socket.roomId].ready[socket.id] = false;
    //console.log(`${socket.username} joins `);
    //console.log(rooms[socket.roomId]);
    socket.join(socket.roomId);
    socket.emit(JOIN_ROOM_EVENT, rooms[socket.roomId]);
    socket.to(socket.roomId).emit(JOIN_ROOM_EVENT, rooms[socket.roomId]); // send everyone in the room a new room data.
    io.emit(FETCH_ROOM_EVENT, rooms);
  });

  socket.on(LEAVE_ROOM_EVENT, () => {
    if (!socket.joinGame) {
      //console.log("socket not yet joined a game");
      return;
    }
    //console.log(`${socket.id} leaves room #${socket.roomId}`);
    socket.joinGame = false;
    if (Object.keys(rooms[socket.roomId].users).length === 1) {
      //console.log(`Delete room #${socket.roomId}`);
      delete rooms[socket.roomId];
    } else {
      delete rooms[socket.roomId].users[socket.id];
      socket.to(socket.roomId).emit(LEAVE_ROOM_EVENT);
    }
    socket.leave(socket.roomId);
    io.emit(FETCH_ROOM_EVENT, rooms);
    delete socket.roomId;
    //console.log(rooms[socket.roomId]);
  });

  socket.on(SEND_READY_EVENT, ({ board }) => {
    if (!socket.joinGame) {
      //console.log("socket not yet joined a game");
      return;
    } else if (!rooms[socket.roomId]) {
      //console.log("room not founded");
      return;
    }
    //console.log(socket.username + " ready");
    // //console.log(board);
    rooms[socket.roomId].ready[socket.id] = true;
    rooms[socket.roomId].board[socket.id] = board;
    if (
      Object.values(rooms[socket.roomId].users).length === 2 &&
      Object.values(rooms[socket.roomId].ready).every((item) => item)
    ) {
      const randomIndex = Math.floor(Math.random() * 2);
      rooms[socket.roomId].currentPlayer = Object.values(
        rooms[socket.roomId].users
      )[randomIndex][0];
      rooms[socket.roomId].playable = true;
      //console.log(rooms);
      io.in(socket.roomId).emit(SEND_READY_EVENT, rooms[socket.roomId]);
    }
  });

  socket.on(SEND_SHOOT_EVENT, (position) => {
    if (
      !(
        socket.joinGame &&
        socket.roomId &&
        rooms[socket.roomId] &&
        rooms[socket.roomId].playable
      )
    ) {
      return;
    }
    //console.log(position);
    socket.to(socket.roomId).emit(SEND_SHOOT_EVENT, position);
  });

  socket.on(CHANGE_CURRENT_PLAYER, () => {
    //console.log("Change turn from server");
    socket.to(socket.roomId).emit(CHANGE_CURRENT_PLAYER);
  });

  socket.on(RECV_SHOOT_EVENT, (data) => {
    if (
      !(
        socket.joinGame &&
        socket.roomId &&
        rooms[socket.roomId] &&
        rooms[socket.roomId].playable
      )
    ) {
      return;
    }
    socket.to(socket.roomId).emit(RECV_SHOOT_EVENT, data);
  });

  socket.on(ADD_SCORE_EVENT, () => {
    if (
      !(
        socket.joinGame &&
        socket.roomId &&
        rooms[socket.roomId] &&
        rooms[socket.roomId].playable
      )
    ) {
      return;
    }
    rooms[socket.roomId].users[socket.id][2] += 1;
  });

  socket.on(SEND_RESTART_EVENT, () => {
    rooms[socket.roomId].restart[socket.id] = true;
    if (Object.values(rooms[socket.roomId].every((item) => item))) {
      io.in(socket.roomId).emit(SEND_RESTART_EVENT);
    }
  });

  socket.on(SEND_RESET_EVENT, (roomId) => {
    if (!rooms[roomId]) {
      //console.log("room not exist");
      return;
    }
    for (const socketId in rooms[roomId].users) {
      rooms[roomId].users[socketId][2] = 0;
      rooms[roomId].restart[socketId] = false;
      rooms[roomId].ready[socketId] = false;
      rooms[roomId].playable = false;
      rooms[roomId].currentPlayer = "";
    }
    io.in(roomId).emit(SEND_RESET_EVENT);
  });

  socket.on("disconnect", () => {
    if (socket.joinGame && socket.roomId && rooms[socket.roomId]) {
      //console.log(`${socket.id} leaves room #${socket.roomId}`);
      if (Object.keys(rooms[socket.roomId].users).length === 1) {
        //console.log(`Delete room #${socket.roomId}`);
        delete rooms[socket.roomId];
      } else {
        delete rooms[socket.roomId].users[socket.id];
        socket.to(socket.roomId).emit(LEAVE_ROOM_EVENT);
      }
      io.emit(FETCH_ROOM_EVENT, rooms);
      delete socket.roomId;
    }
    io.emit(FETCH_NUMBER_SOCKETS_EVENT, io.of("/").sockets.size);
  });
});

httpServer.listen(PORT);
