import type { User } from "./UserManager"

let GLOBAL_ROOM_ID = 1

interface Room {
  user1: User
  user2: User
}

export class RoomManager {
  private rooms: Map<string, Room>
  private userRoomMap: Map<string, string> // Maps socketId to roomId

  constructor() {
    this.rooms = new Map<string, Room>()
    this.userRoomMap = new Map<string, string>()
  }

  createRoom(user1: User, user2: User) {
    const roomId = this.generate().toString()
    console.log(`Creating room ${roomId} for users ${user1.socket.id} and ${user2.socket.id}`)

    this.rooms.set(roomId.toString(), {
      user1,
      user2,
    })

    // Update the user-room mapping
    this.userRoomMap.set(user1.socket.id, roomId)
    this.userRoomMap.set(user2.socket.id, roomId)

    // Notify both users to start the WebRTC connection process
    user1.socket.emit("send-offer", {
      roomId,
      peerName: user2.name,
    })

    user2.socket.emit("send-offer", {
      roomId,
      peerName: user1.name,
    })

    return roomId
  }

  findRoomByUserId(socketId: string): string | null {
    return this.userRoomMap.get(socketId) || null
  }

  handleUserDisconnect(roomId: string, disconnectedUserId: string): string | null {
    const room = this.rooms.get(roomId)
    if (!room) {
      console.log(`Room ${roomId} not found for disconnect handling`)
      return null
    }

    // Determine which user is still connected
    const isUser1Disconnected = room.user1.socket.id === disconnectedUserId
    const remainingUser = isUser1Disconnected ? room.user2 : room.user1
    const disconnectedUser = isUser1Disconnected ? room.user1 : room.user2

    console.log(`User ${disconnectedUserId} (${disconnectedUser.name}) disconnected from room ${roomId}`)
    console.log(`Remaining user is ${remainingUser.socket.id} (${remainingUser.name})`)

    // Notify the remaining user that their peer disconnected
    remainingUser.socket.emit("peer-disconnected", {
      peerName: disconnectedUser.name,
    })

    // Clean up room and mappings
    this.rooms.delete(roomId)
    this.userRoomMap.delete(disconnectedUserId)
    this.userRoomMap.delete(remainingUser.socket.id)

    // Return the ID of the remaining user so they can be added back to the queue
    return remainingUser.socket.id
  }

  handleUserLeaveRoom(roomId: string, leavingUserId: string): string | null {
    return this.handleUserDisconnect(roomId, leavingUserId)
  }

  onOffer(roomId: string, sdp: string, senderSocketId: string) {
    const room = this.rooms.get(roomId)
    if (!room) {
      console.log(`Room ${roomId} not found for offer`)
      return
    }

    const isUser1Sender = room.user1.socket.id === senderSocketId
    const receivingUser = isUser1Sender ? room.user2 : room.user1
    const senderUser = isUser1Sender ? room.user1 : room.user2

    console.log(
      `Sending offer from ${senderUser.name} (${senderSocketId}) to ${receivingUser.name} (${receivingUser.socket.id})`,
    )

    receivingUser.socket.emit("offer", {
      sdp,
      roomId,
      peerName: senderUser.name,
    })
  }

  onAnswer(roomId: string, sdp: string, senderSocketId: string) {
    const room = this.rooms.get(roomId)
    if (!room) {
      console.log(`Room ${roomId} not found for answer`)
      return
    }

    const isUser1Sender = room.user1.socket.id === senderSocketId
    const receivingUser = isUser1Sender ? room.user2 : room.user1
    const senderUser = isUser1Sender ? room.user1 : room.user2

    console.log(
      `Sending answer from ${senderUser.name} (${senderSocketId}) to ${receivingUser.name} (${receivingUser.socket.id})`,
    )

    receivingUser.socket.emit("answer", {
      sdp,
      roomId,
      peerName: senderUser.name,
    })
  }

  onIceCandidates(roomId: string, senderSocketId: string, candidate: any, type: "sender" | "receiver") {
    const room = this.rooms.get(roomId)
    if (!room) {
      console.log(`Room ${roomId} not found for ICE candidate`)
      return
    }

    const isUser1Sender = room.user1.socket.id === senderSocketId
    const receivingUser = isUser1Sender ? room.user2 : room.user1

    console.log(`Sending ICE candidate from ${senderSocketId} to ${receivingUser.socket.id} (${type})`)

    receivingUser.socket.emit("add-ice-candidate", {
      candidate,
      type,
      roomId,
    })
  }

  generate() {
    return GLOBAL_ROOM_ID++
  }
}
