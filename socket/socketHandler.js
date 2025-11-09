const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

class SocketHandler {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      allowEIO3: true
    });

    this.activeCashiers = new Map();
    this.supervisors = new Map();
    this.screenShareSessions = new Map();
    this.activeConnections = new Map();
    this.screenViewRequests = new Map();

    this.setupAuthentication();
    this.setupConnectionHandlers();
    
    console.log("SOCKET_HANDLER: Socket server initialized");
  }

  // Authentication middleware
  setupAuthentication() {
    this.io.use((socket, next) => {
      try {
        const { token, userId } = socket.handshake.auth;
        if (!token || !userId) {
          console.log("SOCKET_HANDLER: Authentication failed - missing credentials");
          return next(new Error("Authentication failed - missing credentials"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.userId !== userId) {
          console.log("SOCKET_HANDLER: Authentication failed - token mismatch");
          return next(new Error("Authentication failed - token mismatch"));
        }

        socket.userId = userId;
        socket.decoded = decoded;
        console.log("SOCKET_HANDLER: User authenticated:", userId);

        next();
      } catch (err) {
        console.error("SOCKET_HANDLER: Authentication error:", err.message);
        next(new Error("Authentication failed - invalid token"));
      }
    });
  }

  // Main connection handler
  setupConnectionHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`SOCKET_HANDLER: User connected: ${socket.userId} (${socket.id})`);

      // Determine user role
      const userRole = this.determineUserRole(socket.userId);
      socket.userRole = userRole;

      // Track users by role
      if (userRole === "cashier") {
        this.activeCashiers.set(socket.userId, {
          socketId: socket.id,
          userId: socket.userId,
          active: false,
          hasScreenShare: false,
          connectionTime: new Date(),
        });
        console.log(`SOCKET_HANDLER: Cashier registered: ${socket.userId}`);
      } else {
        this.supervisors.set(socket.userId, {
          socketId: socket.id,
          userId: socket.userId,
          connectionTime: new Date(),
        });
        console.log(`SOCKET_HANDLER: Supervisor registered: ${socket.userId}`);
      }

      // Ping/Pong for connection health
      socket.on("ping", (timestamp) => {
        socket.emit("pong", timestamp);
      });

      // Cashier session events
      socket.on("cashier-checked-in", (data) => {
        console.log(`SOCKET_HANDLER: Cashier checked in: ${data.cashierId}`);
        const cashier = this.activeCashiers.get(data.cashierId);
        if (cashier) {
          cashier.active = true;
          cashier.sessionData = data.sessionData;
          cashier.checkInTime = new Date();
          this.activeCashiers.set(data.cashierId, cashier);

          this.broadcastToSupervisors("cashier-checked-in", data);
          this.broadcastToSupervisors(
            "cashier-list-updated",
            Array.from(this.activeCashiers.values())
          );
        }
      });

      socket.on("cashier-checked-out", (data) => {
        console.log(`SOCKET_HANDLER: Cashier checked out: ${data.cashierId}`);
        this.handleCashierCheckout(data.cashierId, data);
      });

      socket.on("cashier-auto-checked-out", (data) => {
        console.log(`SOCKET_HANDLER: Cashier auto checked out: ${data.cashierId}`);
        this.handleCashierCheckout(data.cashierId, data);
      });

      socket.on("cashier-logged-out", (data) => {
        console.log(`SOCKET_HANDLER: Cashier logged out: ${data.cashierId}`);
        this.handleCashierLogout(data.cashierId, data);
      });

      // Screen sharing events
      socket.on("start-screen-sharing", (data) => {
        console.log(`SOCKET_HANDLER: Screen sharing start requested by: ${data.cashierId}`);
        this.handleScreenSharingStart(data.cashierId, socket);
      });

      socket.on("stop-screen-sharing", (data) => {
        console.log(`SOCKET_HANDLER: Screen sharing stop requested by: ${data.cashierId}`);
        this.handleScreenSharingStop(data.cashierId);
      });

      socket.on("screen-share-ready", (data) => {
        console.log(`SOCKET_HANDLER: Screen share ready for: ${data.cashierId}`);
        this.handleScreenShareReady(data.cashierId, data.peerId);
      });

      socket.on("screen-share-stopped", (data) => {
        console.log(`SOCKET_HANDLER: Screen share stopped notification: ${data.cashierId}`);
        this.handleScreenSharingStop(data.cashierId);
      });

      // Screen view requests
      socket.on("request-screen-view", (data) => {
        console.log(`SOCKET_HANDLER: Screen view requested by ${data.viewerId} for cashier ${data.cashierId}`);
        this.handleScreenViewRequest(data, socket);
      });

      socket.on("stop-screen-view", (data) => {
        console.log(`SOCKET_HANDLER: Screen view stopped by ${data.viewerId} for cashier ${data.cashierId}`);
        this.handleScreenViewStop(data);
      });

      // Order events
      socket.on("order-placed", (data) => {
        console.log(`SOCKET_HANDLER: Order placed by cashier ${socket.userId}:`, data.orderId);
        this.broadcastToSupervisors("order-placed", {
          ...data,
          cashierId: socket.userId,
          timestamp: new Date(),
        });
      });

      // Messages
      socket.on("send-message", (data) => {
        console.log(`SOCKET_HANDLER: Message from ${socket.userId} to ${data.targetUserId}`);
        const targetUser = this.findUserSocket(data.targetUserId);
        if (targetUser) {
          this.io.to(targetUser.socketId).emit("message-received", {
            ...data,
            timestamp: new Date(),
          });
        }
      });

      // Disconnect handler
      socket.on("disconnect", (reason) => {
        console.log(`SOCKET_HANDLER: User disconnected: ${socket.userId} - Reason: ${reason}`);

        if (socket.userRole === "cashier") {
          this.handleCashierDisconnect(socket.userId, reason);
        } else {
          this.supervisors.delete(socket.userId);
          console.log(`SOCKET_HANDLER: Supervisor removed: ${socket.userId}`);
        }

        this.cleanupUserConnections(socket.userId);
      });

      // Send connection confirmation
      socket.emit("connection-confirmed", {
        socketId: socket.id,
        userId: socket.userId,
        role: userRole,
        timestamp: new Date()
      });
    });

    // Cleanup intervals
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 5 * 60 * 1000);

    setInterval(() => {
      console.log(`SOCKET_HANDLER: Active connections - Cashiers: ${this.activeCashiers.size}, Supervisors: ${this.supervisors.size}`);
    }, 60 * 1000);
  }

  // Screen sharing handlers
  handleScreenSharingStart(cashierId, socket) {
    console.log(`SOCKET_HANDLER: Starting screen sharing for cashier: ${cashierId}`);
    
    const cashier = this.activeCashiers.get(cashierId);
    if (cashier) {
      cashier.hasScreenShare = true;
      cashier.screenShareStartTime = new Date();
      this.activeCashiers.set(cashierId, cashier);

      // Store screen sharing session
      this.screenShareSessions.set(cashierId, {
        cashierId,
        active: true,
        startTime: new Date(),
        viewers: new Set(),
        peerId: null,
        socket: socket
      });

      // Notify cashier to start sharing
      socket.emit("screen-share-start-request", {
        cashierId,
        timestamp: new Date(),
      });

      // Broadcast to supervisors
      this.broadcastToSupervisors("screen-share-started", {
        cashierId,
        cashierName: cashier.username,
        timestamp: new Date(),
      });

      this.broadcastToSupervisors(
        "cashier-list-updated",
        Array.from(this.activeCashiers.values())
      );

      // Send success response
      socket.emit('screen-share-started', { 
        cashierId, 
        success: true,
        message: 'Screen sharing started successfully'
      });

      console.log(`SOCKET_HANDLER: Screen sharing started for: ${cashierId}`);
    } else {
      console.log(`SOCKET_HANDLER: Cashier not found for screen sharing: ${cashierId}`);
      socket.emit('screen-share-failed', { 
        cashierId, 
        error: 'Cashier not found or not active' 
      });
    }
  }

  handleScreenShareReady(cashierId, peerId) {
    console.log(`SOCKET_HANDLER: Screen share ready for cashier: ${cashierId}, peerId: ${peerId}`);
    
    const shareSession = this.screenShareSessions.get(cashierId);
    if (shareSession) {
      shareSession.ready = true;
      shareSession.peerId = peerId;
      this.screenShareSessions.set(cashierId, shareSession);

      // Notify any pending viewers
      this.notifyPendingViewers(cashierId);

      // Broadcast to supervisors
      this.broadcastToSupervisors("screen-share-ready", {
        cashierId,
        peerId,
        timestamp: new Date(),
      });
      
      console.log(`SOCKET_HANDLER: Screen share ready for: ${cashierId}`);
    }
  }

  handleScreenSharingStop(cashierId) {
    console.log(`SOCKET_HANDLER: Stopping screen sharing for cashier: ${cashierId}`);

    // Update cashier status
    const cashier = this.activeCashiers.get(cashierId);
    if (cashier) {
      cashier.hasScreenShare = false;
      delete cashier.screenShareStartTime;
      this.activeCashiers.set(cashierId, cashier);
    }

    // Clean up screen sharing session
    const shareSession = this.screenShareSessions.get(cashierId);
    if (shareSession) {
      // Notify all viewers that screen sharing ended
      shareSession.viewers.forEach(viewerId => {
        const viewer = this.findUserSocket(viewerId);
        if (viewer) {
          this.io.to(viewer.socketId).emit("screen-share-stop-request", {
            cashierId,
            reason: "Screen sharing ended by cashier"
          });
        }
      });

      // Notify cashier to stop sharing
      if (shareSession.socket) {
        shareSession.socket.emit("screen-share-stop-request", {
          cashierId,
          timestamp: new Date()
        });
      }
    }

    this.screenShareSessions.delete(cashierId);

    // Clean up any active connections for this cashier
    for (const [connectionId, connection] of this.activeConnections.entries()) {
      if (connection.cashierId === cashierId) {
        this.activeConnections.delete(connectionId);
      }
    }

    // Broadcast to supervisors
    this.broadcastToSupervisors("screen-share-ended", {
      cashierId,
      timestamp: new Date(),
    });

    this.broadcastToSupervisors(
      "cashier-list-updated",
      Array.from(this.activeCashiers.values())
    );

    console.log(`SOCKET_HANDLER: Screen sharing stopped for: ${cashierId}`);
  }

  handleScreenViewRequest(data, viewerSocket) {
    const { viewerId, cashierId, viewerPeerId } = data;
    console.log(`SOCKET_HANDLER: Processing screen view request from ${viewerId} to ${cashierId}`);

    const shareSession = this.screenShareSessions.get(cashierId);
    const cashier = this.activeCashiers.get(cashierId);

    if (!shareSession || !shareSession.active) {
      console.log(`SOCKET_HANDLER: Screen sharing not available for cashier: ${cashierId}`);
      viewerSocket.emit("screen-view-failed", {
        error: "Screen sharing not available for this cashier"
      });
      return;
    }

    if (!cashier || !cashier.active) {
      console.log(`SOCKET_HANDLER: Cashier not active: ${cashierId}`);
      viewerSocket.emit("screen-view-failed", {
        error: "Cashier is not active"
      });
      return;
    }

    // Add viewer to the session
    shareSession.viewers.add(viewerId);
    this.screenShareSessions.set(cashierId, shareSession);

    // Create active connection
    const connectionId = `${viewerId}-${cashierId}`;
    this.activeConnections.set(connectionId, {
      viewerId,
      cashierId,
      startTime: new Date(),
      type: "screen-view"
    });

    // Store view request
    this.screenViewRequests.set(connectionId, {
      viewerId,
      cashierId,
      viewerPeerId,
      timestamp: new Date()
    });

    // Notify cashier about the view request
    if (shareSession.socket) {
      shareSession.socket.emit("screen-view-request", {
        viewerId,
        cashierId,
        viewerPeerId,
        connectionId
      });
    }

    // If screen share is ready, notify viewer immediately
    if (shareSession.ready && shareSession.peerId) {
      viewerSocket.emit("screen-view-ready", {
        cashierId,
        cashierPeerId: shareSession.peerId,
        timestamp: new Date()
      });
    }

    console.log(`SOCKET_HANDLER: Screen view request processed for ${viewerId} -> ${cashierId}`);
  }

  handleScreenViewStop(data) {
    const { viewerId, cashierId } = data;
    console.log(`SOCKET_HANDLER: Stopping screen view for ${viewerId} from ${cashierId}`);

    const shareSession = this.screenShareSessions.get(cashierId);
    if (shareSession) {
      shareSession.viewers.delete(viewerId);
      this.screenShareSessions.set(cashierId, shareSession);
    }

    // Remove active connection
    const connectionId = `${viewerId}-${cashierId}`;
    this.activeConnections.delete(connectionId);
    this.screenViewRequests.delete(connectionId);

    // Notify cashier that viewer left
    const cashier = this.activeCashiers.get(cashierId);
    if (cashier && shareSession && shareSession.socket) {
      shareSession.socket.emit("screen-view-stop", {
        viewerId
      });
    }

    console.log(`SOCKET_HANDLER: Screen view stopped for ${viewerId} from ${cashierId}`);
  }

  notifyPendingViewers(cashierId) {
    const shareSession = this.screenShareSessions.get(cashierId);
    if (!shareSession) return;

    shareSession.viewers.forEach(viewerId => {
      const viewer = this.findUserSocket(viewerId);
      if (viewer) {
        this.io.to(viewer.socketId).emit("screen-view-ready", {
          cashierId,
          cashierPeerId: shareSession.peerId,
          timestamp: new Date()
        });
      }
    });
    
    console.log(`SOCKET_HANDLER: Notified ${shareSession.viewers.size} pending viewers for ${cashierId}`);
  }

  // Utility methods
  async determineUserRole(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        console.log(`SOCKET_HANDLER: User not found: ${userId}`);
        return "unknown";
      }
      
      if (user.role === "supervisor") return "supervisor";
      if (user.role === "cashier") return "cashier";
      
      console.log(`SOCKET_HANDLER: Unknown user role: ${user.role} for user: ${userId}`);
      return "unknown";
    } catch (error) {
      console.error(`SOCKET_HANDLER: Error determining user role for ${userId}:`, error);
      return "unknown";
    }
  }

  findUserSocket(userId) {
    const cashier = this.activeCashiers.get(userId);
    if (cashier) return cashier;

    const supervisor = this.supervisors.get(userId);
    if (supervisor) return supervisor;

    return null;
  }

  handleCashierCheckout(cashierId, data) {
    this.handleScreenSharingStop(cashierId);

    const cashier = this.activeCashiers.get(cashierId);
    if (cashier) {
      cashier.active = false;
      cashier.checkOutTime = new Date();
      this.activeCashiers.set(cashierId, cashier);
    }

    this.broadcastToSupervisors("cashier-checked-out", {
      ...data,
      timestamp: new Date(),
    });
    
    this.broadcastToSupervisors(
      "cashier-list-updated",
      Array.from(this.activeCashiers.values())
    );
    
    console.log(`SOCKET_HANDLER: Cashier checkout processed: ${cashierId}`);
  }

  handleCashierLogout(cashierId, data) {
    this.handleScreenSharingStop(cashierId);
    this.activeCashiers.delete(cashierId);

    this.broadcastToSupervisors("cashier-logged-out", {
      ...data,
      timestamp: new Date(),
    });
    
    this.broadcastToSupervisors(
      "cashier-list-updated",
      Array.from(this.activeCashiers.values())
    );
    
    console.log(`SOCKET_HANDLER: Cashier logout processed: ${cashierId}`);
  }

  handleCashierDisconnect(cashierId, reason) {
    console.log(`SOCKET_HANDLER: Processing cashier disconnect: ${cashierId}, reason: ${reason}`);
    
    this.handleScreenSharingStop(cashierId);
    this.activeCashiers.delete(cashierId);

    this.broadcastToSupervisors("cashier-disconnected", {
      cashierId,
      reason,
      timestamp: new Date(),
    });
    
    this.broadcastToSupervisors(
      "cashier-list-updated",
      Array.from(this.activeCashiers.values())
    );
    
    console.log(`SOCKET_HANDLER: Cashier disconnect processed: ${cashierId}`);
  }

  cleanupUserConnections(userId) {
    console.log(`SOCKET_HANDLER: Cleaning up connections for user: ${userId}`);
    
    // Clean up screen sharing sessions
    if (this.screenShareSessions.has(userId)) {
      this.handleScreenSharingStop(userId);
    }

    // Clean up screen view requests
    for (const [requestId, request] of this.screenViewRequests.entries()) {
      if (request.viewerId === userId || request.cashierId === userId) {
        this.screenViewRequests.delete(requestId);
      }
    }

    // Clean up active connections
    for (const [connectionId, connection] of this.activeConnections.entries()) {
      if (connection.viewerId === userId || connection.cashierId === userId) {
        this.activeConnections.delete(connectionId);
      }
    }
    
    console.log(`SOCKET_HANDLER: Cleanup completed for user: ${userId}`);
  }

  cleanupExpiredRequests() {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [requestId, request] of this.screenViewRequests.entries()) {
      if (request.timestamp < cutoff) {
        this.screenViewRequests.delete(requestId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`SOCKET_HANDLER: Cleaned up ${cleanedCount} expired screen view requests`);
    }
  }

  broadcastToSupervisors(event, data) {
    let broadcastCount = 0;
    this.supervisors.forEach(({ socketId }) => {
      this.io.to(socketId).emit(event, data);
      broadcastCount++;
    });
    
    if (broadcastCount > 0) {
      console.log(`SOCKET_HANDLER: Broadcasted '${event}' to ${broadcastCount} supervisors`);
    }
  }

  broadcastToCashiers(event, data) {
    let broadcastCount = 0;
    this.activeCashiers.forEach(({ socketId }) => {
      this.io.to(socketId).emit(event, data);
      broadcastCount++;
    });
    
    if (broadcastCount > 0) {
      console.log(`SOCKET_HANDLER: Broadcasted '${event}' to ${broadcastCount} cashiers`);
    }
  }

  // Admin/Status methods
  getStatus() {
    return {
      activeCashiers: Array.from(this.activeCashiers.values()),
      supervisors: Array.from(this.supervisors.values()),
      
      screenShareSessions: Array.from(this.screenShareSessions.values()),
      activeConnections: Array.from(this.activeConnections.values()),
      screenViewRequests: Array.from(this.screenViewRequests.values()),
      totalConnections: this.io.engine.clientsCount,
      timestamp: new Date(),
    };
  }
}

module.exports = SocketHandler;