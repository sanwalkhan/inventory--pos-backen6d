const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

    req.user = decoded;

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please login again.",
      });
    }

    res.status(401).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Access denied. Not authenticated.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
      });
    }

    next();
  };
};
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1] // Extract token from "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded // This sets req.user so your controller can access it
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    })
  }
}
const getOrganizationId = (req) => {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    throw new Error("No token provided")
  }

  const token = authHeader.split(" ")[1]
  const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")
 
  if (!decoded.organizationId) {
    throw new Error("Invalid token: organizationId not found")
  }

  return decoded.organizationId
}

module.exports = { authenticate, authorize, authenticateToken, getOrganizationId };
