// server/socket/enhancedSocketHandler.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

class SocketHandler {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.activeCashiers = new Map();
    this.supervisors = new Map();
    this.screenShares = new Map();
    this.peerConnections = new Map();

    this.setupAuthentication();
    this.setupConnectionHandlers();
  }

  setupAuthentication() {
    this.io.use((socket, next) => {
      try {
        const { token, userId, role } = socket.handshake.auth;
        if (!token || !userId || !role) {
          return next(new Error("Authentication failed"));
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = userId;
        socket.role = role;
        socket.decoded = decoded;
        next();
      } catch (err) {
        next(new Error("Authentication failed"));
      }
    });
  }

  setupConnectionHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`Connected: ${socket.userId} as ${socket.role}`);

      // Track users based on role
      if (socket.role === "cashier") {
        this.activeCashiers.set(socket.userId, {
          socketId: socket.id,
          userId: socket.userId,
          active: true,
          hasScreenShare: false,
          peerId: null,
          checkInTime: new Date(),
        });
        
        // Notify supervisors about new cashier
        this.broadcastToSupervisors("cashier-list-updated", 
          Array.from(this.activeCashiers.values())
        );
      } else if (socket.role === "supervisor") {
        this.supervisors.set(socket.userId, {
          socketId: socket.id,
          userId: socket.userId,
        });
        
        // Send current active cashiers list
        socket.emit("cashier-list-updated", 
          Array.from(this.activeCashiers.values())
        );
      }

      // Enhanced peer connection handling
      socket.on("peer-id", (data) => {
        console.log(`Peer ID registered: ${data.peerId} for ${socket.userId}`);
        
        if (socket.role === "cashier") {
          const cashier = this.activeCashiers.get(socket.userId);
          if (cashier) {
            cashier.peerId = data.peerId;
            this.activeCashiers.set(socket.userId, cashier);
            this.peerConnections.set(data.peerId, socket.userId);
          }
        }
      });

      // Handle cashier check-in events
      socket.on("cashier-checked-in", (data) => {
        const cashier = this.activeCashiers.get(data.cashierId);
        if (cashier) {
          cashier.active = true;
          cashier.sessionData = data.sessionData;
          this.activeCashiers.set(data.cashierId, cashier);
          
          // Notify supervisors
          this.broadcastToSupervisors("cashier-checked-in", data);
          this.broadcastToSupervisors("cashier-list-updated", 
            Array.from(this.activeCashiers.values())
          );

          // Automatically request screen sharing after a short delay
          setTimeout(() => {
            socket.emit("auto-start-screen-share");
          }, 2000);
        }
      });

      // Handle cashier check-out events
      socket.on("cashier-checked-out", (data) => {
        const cashier = this.activeCashiers.get(data.cashierId);
        if (cashier) {
          // Stop screen sharing
          this.handleScreenShareStop(data.cashierId);
          
          // Remove cashier
          this.activeCashiers.delete(data.cashierId);
          
          // Notify supervisors
          this.broadcastToSupervisors("cashier-checked-out", data);
          this.broadcastToSupervisors("cashier-list-updated", 
            Array.from(this.activeCashiers.values())
          );
        }
      });

      // Enhanced screen sharing handlers
      socket.on("screen-share-started", (data) => {
        console.log(`Screen share started: ${data.cashierId}`);
        
        this.screenShares.set(data.cashierId, {
          peerId: data.peerId,
          active: true,
          startTime: new Date(),
        });

        const cashier = this.activeCashiers.get(data.cashierId);
        if (cashier) {
          cashier.hasScreenShare = true;
          cashier.screenShareStartTime = new Date();
          this.activeCashiers.set(data.cashierId, cashier);
        }

        // Notify all supervisors
        this.broadcastToSupervisors("screen-share-available", {
          cashierId: data.cashierId,
          peerId: data.peerId,
        });
        
        this.broadcastToSupervisors("cashier-list-updated", 
          Array.from(this.activeCashiers.values())
        );
      });

      socket.on("screen-share-stopped", (data) => {
        this.handleScreenShareStop(data.cashierId);
      });

      // Message handling
      socket.on("send-message-to-cashier", (data) => {
        const cashier = this.activeCashiers.get(data.cashierId);
        if (cashier) {
          this.io.to(cashier.socketId).emit("message-from-supervisor", {
            message: data.message,
            priority: data.priority || "normal",
            timestamp: new Date(),
            supervisorId: socket.userId,
          });
        }
      });

      // Disconnect handling
      socket.on("disconnect", () => {
        console.log(`Disconnected: ${socket.userId} as ${socket.role}`);
        
        if (socket.role === "cashier") {
          this.handleCashierDisconnect(socket.userId);
        } else if (socket.role === "supervisor") {
          this.supervisors.delete(socket.userId);
        }
      });
    });
  }

  handleScreenShareStop(cashierId) {
    console.log(`Screen share stopped: ${cashierId}`);
    
    this.screenShares.delete(cashierId);
    
    const cashier = this.activeCashiers.get(cashierId);
    if (cashier) {
      cashier.hasScreenShare = false;
      this.activeCashiers.set(cashierId, cashier);
    }

    this.broadcastToSupervisors("screen-share-ended", { cashierId });
    this.broadcastToSupervisors("cashier-list-updated", 
      Array.from(this.activeCashiers.values())
    );
  }

  handleCashierDisconnect(cashierId) {
    // Clean up screen sharing
    this.handleScreenShareStop(cashierId);
    
    // Remove cashier
    this.activeCashiers.delete(cashierId);
    
    // Clean up peer connections
    const peerEntries = Array.from(this.peerConnections.entries());
    peerEntries.forEach(([peerId, userId]) => {
      if (userId === cashierId) {
        this.peerConnections.delete(peerId);
      }
    });

    // Notify supervisors
    this.broadcastToSupervisors("cashier-disconnected", { cashierId });
    this.broadcastToSupervisors("cashier-list-updated", 
      Array.from(this.activeCashiers.values())
    );
  }

  broadcastToSupervisors(event, data) {
    this.supervisors.forEach(({ socketId }) => {
      this.io.to(socketId).emit(event, data);
    });
  }

  broadcastToCashiers(event, data) {
    this.activeCashiers.forEach(({ socketId }) => {
      this.io.to(socketId).emit(event, data);
    });
  }

  // Get current status for debugging
  getStatus() {
    return {
      activeCashiers: Array.from(this.activeCashiers.values()),
      supervisors: Array.from(this.supervisors.values()),
      screenShares: Array.from(this.screenShares.values()),
      totalConnections: this.io.engine.clientsCount,
    };
  }
}

module.exports = SocketHandler;