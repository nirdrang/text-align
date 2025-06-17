"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var promises_1 = require("fs/promises");
var path_1 = require("path");
var buffer_1 = require("buffer");
function readJsonlFile(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var lines;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, promises_1.default.readFile(filePath, 'utf-8')];
                case 1:
                    lines = (_a.sent()).split(/\r?\n/).filter(Boolean);
                    return [2 /*return*/, lines.map(function (line) { return JSON.parse(line); })];
            }
        });
    });
}
function getLectureNumber(custom_id) {
    var parts = custom_id.split('_');
    return parts[1];
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var args, hebrewFile, openaiFile, cacheDir, hebrewParagraphs, openaiResponses, heByCustomId, _i, hebrewParagraphs_1, h, he, enByCustomId, _a, openaiResponses_1, r, en, lectureGroups, _b, _c, custom_id, lecture, _d, _e, _f, lecture, custom_ids, _g, _h, _j, lecture, custom_ids, records, _k, custom_ids_1, custom_id, he, en, key, outPath, content;
        var _l, _m, _o;
        return __generator(this, function (_p) {
            switch (_p.label) {
                case 0:
                    args = process.argv.slice(2);
                    if (args.length < 2) {
                        console.error('Usage: tsx scripts/generate_cache_from_batches.ts <hebrew_jsonl> <openai_jsonl>');
                        process.exit(1);
                    }
                    hebrewFile = path_1.default.resolve(args[0]);
                    openaiFile = path_1.default.resolve(args[1]);
                    cacheDir = path_1.default.resolve('cache');
                    // Ensure cache directory exists
                    return [4 /*yield*/, promises_1.default.mkdir(cacheDir, { recursive: true })];
                case 1:
                    // Ensure cache directory exists
                    _p.sent();
                    return [4 /*yield*/, readJsonlFile(hebrewFile)];
                case 2:
                    hebrewParagraphs = _p.sent();
                    return [4 /*yield*/, readJsonlFile(openaiFile)];
                case 3:
                    openaiResponses = _p.sent();
                    heByCustomId = new Map();
                    for (_i = 0, hebrewParagraphs_1 = hebrewParagraphs; _i < hebrewParagraphs_1.length; _i++) {
                        h = hebrewParagraphs_1[_i];
                        he = ((_l = h.body.messages.find(function (m) { return m.role === 'user'; })) === null || _l === void 0 ? void 0 : _l.content) || '';
                        heByCustomId.set(h.custom_id, he);
                    }
                    enByCustomId = new Map();
                    for (_a = 0, openaiResponses_1 = openaiResponses; _a < openaiResponses_1.length; _a++) {
                        r = openaiResponses_1[_a];
                        if (r.response && r.response.status_code === 200) {
                            en = ((_o = (_m = r.response.body.choices[0]) === null || _m === void 0 ? void 0 : _m.message) === null || _o === void 0 ? void 0 : _o.content) || '';
                            enByCustomId.set(r.custom_id, en);
                        }
                    }
                    lectureGroups = new Map();
                    for (_b = 0, _c = heByCustomId.keys(); _b < _c.length; _b++) {
                        custom_id = _c[_b];
                        lecture = getLectureNumber(custom_id);
                        if (!lectureGroups.has(lecture))
                            lectureGroups.set(lecture, []);
                        lectureGroups.get(lecture).push(custom_id);
                    }
                    console.log('Lectures found:', Array.from(lectureGroups.keys()));
                    for (_d = 0, _e = lectureGroups.entries(); _d < _e.length; _d++) {
                        _f = _e[_d], lecture = _f[0], custom_ids = _f[1];
                        console.log("Lecture ".concat(lecture, ": ").concat(custom_ids.length, " paragraphs"));
                    }
                    _g = 0, _h = lectureGroups.entries();
                    _p.label = 4;
                case 4:
                    if (!(_g < _h.length)) return [3 /*break*/, 7];
                    _j = _h[_g], lecture = _j[0], custom_ids = _j[1];
                    records = [];
                    for (_k = 0, custom_ids_1 = custom_ids; _k < custom_ids_1.length; _k++) {
                        custom_id = custom_ids_1[_k];
                        he = heByCustomId.get(custom_id) || '';
                        en = enByCustomId.get(custom_id) || '';
                        if (!he) {
                            console.warn("Missing Hebrew for custom_id: ".concat(custom_id));
                        }
                        if (!enByCustomId.has(custom_id)) {
                            console.warn("Missing English for custom_id: ".concat(custom_id));
                        }
                        key = buffer_1.Buffer.from(he, 'utf-8').toString('base64');
                        records.push({ key: key, he: he, en: en });
                    }
                    outPath = path_1.default.join(cacheDir, "".concat(lecture, ".jsonl"));
                    content = records.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n';
                    return [4 /*yield*/, promises_1.default.writeFile(outPath, content, 'utf-8')];
                case 5:
                    _p.sent();
                    console.log("Wrote ".concat(records.length, " records to ").concat(outPath));
                    _p.label = 6;
                case 6:
                    _g++;
                    return [3 /*break*/, 4];
                case 7: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
