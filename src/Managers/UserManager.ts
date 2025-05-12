import { Socket } from "socket.io"
import { RoomManager } from "./RoomManager"

export interface User {
  socket: Socket
  name: string
}

export class UserManager {
  private users: User[]
  private queue: string[]
  private roomManager: RoomManager

  constructor() {
    this.users = []
    this.queue = []
    this.roomManager = new RoomManager()
  }

  addUser(name: string, socket: Socket) {
    console.log(`Adding user ${name} (${socket.id}) to the system`)
    this.users.push({
      name,
      socket,
    })
    this.queue.push(socket.id)
    socket.emit("lobby")
    console.log(`Current queue after adding ${socket.id}: ${JSON.stringify(this.queue)}`)
    this.clearQueue()
    this.initHandlers(socket)
  }

  removeUser(socketId: string) {
    console.log(`Removing user ${socketId} from the system`)
    const user = this.users.find((x) => x.socket.id === socketId)
    if (user) {
      // Check if user was in a room and notify the other user
      const roomId = this.roomManager.findRoomByUserId(socketId)
      if (roomId) {
        console.log(`User ${socketId} was in room ${roomId}, handling disconnect`)
        const remainingUserId = this.roomManager.handleUserDisconnect(roomId, socketId)
        // Add the remaining user back to the queue
        if (remainingUserId) {
          console.log(`Adding remaining user ${remainingUserId} back to the queue`)
          this.addUserToQueue(remainingUserId, true) // Priority = true to put at front of queue
        }
      }
    }

    this.users = this.users.filter((x) => x.socket.id !== socketId)
    this.queue = this.queue.filter((x) => x !== socketId)
    console.log(`Current queue after removing ${socketId}: ${JSON.stringify(this.queue)}`)
  }

  addUserToQueue(socketId: string, priority = false) {
    // Check if user exists and is not already in queue
    const userExists = this.users.some((user) => user.socket.id === socketId)
    const alreadyInQueue = this.queue.includes(socketId)

    if (userExists && !alreadyInQueue) {
      if (priority) {
        // Add to front of queue if priority is true (user was in a room and is waiting)
        this.queue.unshift(socketId)
        console.log(`Added user ${socketId} to the FRONT of the queue with priority`)
      } else {
        // Add to end of queue normally
        this.queue.push(socketId)
        console.log(`Added user ${socketId} to the END of the queue`)
      }

      const user = this.users.find((x) => x.socket.id === socketId)
      if (user) {
        user.socket.emit("lobby")
      }
      console.log(`Current queue after adding ${socketId}: ${JSON.stringify(this.queue)}`)
      this.clearQueue()
    }
  }

  clearQueue() {
    console.log(`Processing queue with ${this.queue.length} users`)
    if (this.queue.length < 2) {
      console.log("Not enough users in queue to create a room")
      return
    }

    // Take the first two users from the queue (FIFO order)
    const id1 = this.queue.shift()
    const id2 = this.queue.shift()

    if (!id1 || !id2) {
      console.log("Invalid IDs in queue")
      return
    }

    console.log(`Matching users: ${id1} and ${id2}`)

    const user1 = this.users.find((x) => x.socket.id === id1)
    const user2 = this.users.find((x) => x.socket.id === id2)

    if (!user1 || !user2) {
      // If one of the users doesn't exist, put the other back in queue
      console.log("One of the users not found")
      if (user1) {
        console.log(`Putting ${id1} back in queue`)
        this.queue.unshift(user1.socket.id) // Put back at the front of the queue
      }
      if (user2) {
        console.log(`Putting ${id2} back in queue`)
        this.queue.unshift(user2.socket.id) // Put back at the front of the queue
      }
      return
    }

    console.log(`Creating room for ${user1.name} (${user1.socket.id}) and ${user2.name} (${user2.socket.id})`)
    const room = this.roomManager.createRoom(user1, user2)

    // Continue processing the queue in case there are more users waiting
    this.clearQueue()
  }

  initHandlers(socket: Socket) {
    socket.on("offer", ({ sdp, roomId }: { sdp: string; roomId: string }) => {
      console.log(`Received offer from ${socket.id} for room ${roomId}`)
      this.roomManager.onOffer(roomId, sdp, socket.id)
    })

    socket.on("answer", ({ sdp, roomId }: { sdp: string; roomId: string }) => {
      console.log(`Received answer from ${socket.id} for room ${roomId}`)
      this.roomManager.onAnswer(roomId, sdp, socket.id)
    })

    socket.on("add-ice-candidate", ({ candidate , roomId, type } : { candidate:any, roomId:string, type: "sender" | "receiver" }  ) => {
      console.log(`Received ICE candidate from ${socket.id} for room ${roomId} (${type})`)
      this.roomManager.onIceCandidates(roomId, socket.id, candidate, type)
    })

    socket.on("leave-room", ({ roomId }: { roomId: string }) => {
      console.log(`User ${socket.id} is explicitly leaving room ${roomId}`)
      const remainingUserId = this.roomManager.handleUserLeaveRoom(roomId, socket.id)

      // Add the remaining user back to the queue with priority
      if (remainingUserId) {
        console.log(`Adding remaining user ${remainingUserId} back to the queue with priority`)
        this.addUserToQueue(remainingUserId, true)
      }

      // Add the leaving user back to the queue without priority
      this.addUserToQueue(socket.id, false)
    })
  }
}
