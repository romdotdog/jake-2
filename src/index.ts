import { readFileSync } from "fs";
import path from "path";
import Lexer from "./lexer.js";
import Parser from "./parser.js";
import { Lower } from "./lower.js";

const filePath = path.relative(process.cwd(), process.argv[2]);
const src = readFileSync(filePath, { encoding: "utf-8" });
const lexer = new Lexer(src, filePath);
const ast = new Parser(lexer).parse();
const ir = new Lower(ast, lexer).lower();