import { readFileSync } from "fs";
import path from "path";
import Lexer from "./lexer.js";
import Parser from "./parser.js";

const filePath = path.relative(process.cwd(), process.argv[2]);
const src = readFileSync(filePath, { encoding: "utf-8" });
const lexer = new Lexer(src);
const ast = new Parser(lexer, filePath).parse();
console.log(ast);
