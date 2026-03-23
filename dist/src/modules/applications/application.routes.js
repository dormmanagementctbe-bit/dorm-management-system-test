"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicationRouter = void 0;
const express_1 = require("express");
const appController = __importStar(require("./application.controller"));
const auth_middleware_1 = require("../../middleware/auth.middleware");
const role_middleware_1 = require("../../middleware/role.middleware");
exports.applicationRouter = (0, express_1.Router)();
exports.applicationRouter.use(auth_middleware_1.authenticate);
// Student routes
exports.applicationRouter.post("/", (0, role_middleware_1.requireRole)("STUDENT"), appController.create);
exports.applicationRouter.get("/my", (0, role_middleware_1.requireRole)("STUDENT"), appController.getMy);
// Admin routes
exports.applicationRouter.get("/", (0, role_middleware_1.requireRole)("ADMIN", "SUPER_ADMIN"), appController.list);
exports.applicationRouter.post("/run-allocation", (0, role_middleware_1.requireRole)("ADMIN", "SUPER_ADMIN"), appController.runAllocation);
exports.applicationRouter.get("/:id", appController.getById);
exports.applicationRouter.put("/:id/review", (0, role_middleware_1.requireRole)("ADMIN", "SUPER_ADMIN"), appController.review);
