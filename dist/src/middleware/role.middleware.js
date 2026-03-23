"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
const helpers_1 = require("../utils/helpers");
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            (0, helpers_1.sendError)(res, "Unauthorized", 401);
            return;
        }
        if (!roles.includes(req.user.role)) {
            (0, helpers_1.sendError)(res, "Insufficient permissions", 403);
            return;
        }
        next();
    };
}
