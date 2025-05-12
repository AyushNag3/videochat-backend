import express from 'express';
import http from "http"
import { Socket } from "socket.io";
import { Server } from 'socket.io';
import { UserManager } from './Managers/UserManager';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
   cors: {
    origin: "*"
  }
});
app.use(express.json())

const userManager = new UserManager() 
io.on('connection', (socket: Socket) => {
  console.log('a user connected', socket.id);
  userManager.addUser("randomName", socket) ;
  socket.on("disconnect", () => {
    console.log('a user disconnected', socket.id);
    userManager.removeUser(socket.id)
  })
});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});