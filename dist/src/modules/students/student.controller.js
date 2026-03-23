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
exports.list = list;
exports.getById = getById;
exports.update = update;
exports.getAllocation = getAllocation;
const student_dto_1 = require("./student.dto");
const studentService = __importStar(require("./student.service"));
const helpers_1 = require("../../utils/helpers");
async function list(req, res, next) {
    try {
        const { students, meta } = await studentService.listStudents(req.query);
        (0, helpers_1.sendPaginated)(res, students, meta);
    }
    catch (err) {
        next(err);
    }
}
async function getById(req, res, next) {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const student = await studentService.getStudentById(id);
        (0, helpers_1.sendSuccess)(res, student);
    }
    catch (err) {
        next(err);
    }
}
async function update(req, res, next) {
    try {
        const dto = student_dto_1.updateStudentSchema.parse(req.body);
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const student = await studentService.updateStudent(id, dto);
        (0, helpers_1.sendSuccess)(res, student);
    }
    catch (err) {
        next(err);
    }
}
async function getAllocation(req, res, next) {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const allocation = await studentService.getStudentAllocation(id);
        (0, helpers_1.sendSuccess)(res, allocation);
    }
    catch (err) {
        next(err);
    }
}
