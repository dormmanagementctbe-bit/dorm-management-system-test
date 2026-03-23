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
exports.create = create;
exports.list = list;
exports.getMy = getMy;
exports.getById = getById;
exports.review = review;
exports.runAllocation = runAllocation;
const application_dto_1 = require("./application.dto");
const appService = __importStar(require("./application.service"));
const helpers_1 = require("../../utils/helpers");
async function create(req, res, next) {
    try {
        const dto = application_dto_1.createApplicationSchema.parse(req.body);
        const application = await appService.createApplication(req.user.id, dto);
        (0, helpers_1.sendSuccess)(res, application, "Application submitted", 201);
    }
    catch (err) {
        next(err);
    }
}
async function list(req, res, next) {
    try {
        const { applications, meta } = await appService.listApplications(req.query);
        (0, helpers_1.sendPaginated)(res, applications, meta);
    }
    catch (err) {
        next(err);
    }
}
async function getMy(req, res, next) {
    try {
        const applications = await appService.getMyApplications(req.user.id);
        (0, helpers_1.sendSuccess)(res, applications);
    }
    catch (err) {
        next(err);
    }
}
async function getById(req, res, next) {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const application = await appService.getApplicationById(id);
        (0, helpers_1.sendSuccess)(res, application);
    }
    catch (err) {
        next(err);
    }
}
async function review(req, res, next) {
    try {
        const dto = application_dto_1.reviewApplicationSchema.parse(req.body);
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const application = await appService.reviewApplication(id, req.user.id, dto);
        (0, helpers_1.sendSuccess)(res, application);
    }
    catch (err) {
        next(err);
    }
}
async function runAllocation(req, res, next) {
    try {
        const result = await appService.runAllocation(req.user.id);
        (0, helpers_1.sendSuccess)(res, result, `Allocation complete: ${result.allocated} allocated, ${result.waitlisted} waitlisted`);
    }
    catch (err) {
        next(err);
    }
}
