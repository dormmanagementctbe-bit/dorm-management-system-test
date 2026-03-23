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
exports.register = register;
exports.login = login;
exports.getMe = getMe;
const auth_dto_1 = require("./auth.dto");
const authService = __importStar(require("./auth.service"));
const helpers_1 = require("../../utils/helpers");
async function register(req, res, next) {
    try {
        const dto = auth_dto_1.registerSchema.parse(req.body);
        const result = await authService.register(dto);
        (0, helpers_1.sendSuccess)(res, result, "Registration successful", 201);
    }
    catch (err) {
        next(err);
    }
}
async function login(req, res, next) {
    try {
        const dto = auth_dto_1.loginSchema.parse(req.body);
        const result = await authService.login(dto);
        (0, helpers_1.sendSuccess)(res, result, "Login successful");
    }
    catch (err) {
        next(err);
    }
}
async function getMe(req, res, next) {
    try {
        const user = await authService.getMe(req.user.id);
        (0, helpers_1.sendSuccess)(res, user);
    }
    catch (err) {
        next(err);
    }
}
