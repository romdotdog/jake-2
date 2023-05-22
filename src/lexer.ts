// heavily based on llex.c
export default class Lexer {
    private lines: number[] = [];
    private srcLength: number;

    public buffer: string | bigint | number | null = null;
    public start = 0;
    public p = 0;
    constructor(private src: string) {
        this.srcLength = src.length;
    }

    public lineCol(x: number) {
        let lo = 0;
        let hi = this.lines.length;
        while (hi - lo > 1) {
            const mid = Math.floor((hi - lo) / 2) + lo;
            if (this.lines[lo] <= x && x < this.lines[mid]) {
                hi = mid;
            } else {
                lo = mid;
            }
        }

        const sol = this.lines[lo];
        return {
            line: hi,
            col: x - sol + 1,
            sol,
            eol: this.lines[hi] ?? this.p
        };
    }

    public print(x: Span, path: string, message: string) {
        const start = this.lineCol(x.start);
        const end = this.lineCol(x.end);
        const ecol = start.line === end.line ? end.col : start.eol;
        console.log(`${path}:${start.line}:${start.col}: ${message}`);
        console.log(this.src.substring(start.sol, start.eol));
        console.log(" ".repeat(start.col - 1) + "^".repeat(ecol - start.col));
    }

    public getSource() {
        return this.src;
    }

    private skip() {
        return ++this.p;
    }

    private get() {
        return this.src.charAt(this.skip());
    }

    private current() {
        return this.src.charAt(this.p);
    }

    private inclineNumber() {
        // assert \n, \r
        const current = this.get();
        if (isNewline(current)) {
            this.skip();
        }
        if (this.lines.length === 0 || this.p > this.lines[this.lines.length - 1]) {
            this.lines.push(this.p);
        }
    }

    private lookahead(f: () => boolean): boolean {
        const position = this.p;
        const success = f();
        if (!success) {
            this.p = position;
        }
        return success;
    }

    private orEOF(b: boolean) {
        return this.p >= this.srcLength || b;
    }

    private andNotEOF(b: boolean) {
        return this.p < this.srcLength && b;
    }

    private readNumeral() {
        // assert isDigit
        let float = false;
        let char;
        do {
            char = this.get();
        } while (this.andNotEOF(isDigitOrUnderscore(char)));
        if (char == ".") {
            const valid = this.lookahead(() => {
                char = this.get();
                if (isDigit(char)) {
                    float = true;
                    do {
                        char = this.get();
                    } while (this.andNotEOF(isDigitOrUnderscore(char)));
                    return true;
                }
                return false;
            });
            if (!valid) {
                return;
            }
        }
        if (char == "e" || char == "E") {
            this.lookahead(() => {
                char = this.get();
                if (isDigitPlusOrMinus(char)) {
                    float = true;
                    do {
                        char = this.get();
                    } while (this.andNotEOF(isDigit(char)));
                    return true;
                }
                return false;
            });
        }
        return float;
    }

    private bufferNumeral() {
        const start = this.p;
        const float = this.readNumeral();
        const str = this.src.substring(start, this.p);
        if (float) {
            this.buffer = parseFloat(str);
        } else {
            this.buffer = BigInt(str);
        }
    }

    private maybeTakeEquals(normalToken: Token, equalsToken: Token) {
        if (this.get() == "=") {
            this.skip();
            return equalsToken;
        }
        return normalToken;
    }

    public next(): Token {
        while (true) {
            const current = this.current();
            this.start = this.p;
            switch (current) {
                case "\n":
                case "\r": {
                    this.inclineNumber();
                    continue;
                }
                case "/": {
                    const current = this.get();
                    if (current == "/") {
                        while (!this.orEOF(isNewline(this.get())));
                    } else if (current == "*") {
                        while (true) {
                            while (this.andNotEOF(this.get() != "*"));
                            if (this.orEOF(this.get() == "/")) {
                                break;
                            }
                        }
                    } else if (current == "=") {
                        this.skip();
                        return Token.SlashEquals;
                    } else {
                        return Token.Slash;
                    }
                    continue;
                }
                case "*":
                    return this.maybeTakeEquals(Token.Asterisk, Token.AsteriskEquals);
                case "%":
                    return this.maybeTakeEquals(Token.Percent, Token.PercentEquals);
                case "+":
                    return this.maybeTakeEquals(Token.Plus, Token.PlusEquals);
                case "-": {
                    const current = this.get();
                    if (current == ">") {
                        this.skip();
                        return Token.Arrow;
                    } else if (current == "=") {
                        this.skip();
                        return Token.MinusEquals;
                    } else {
                        return Token.Minus;
                    }
                }
                case "<": {
                    const current = this.get();
                    if (current == "<") {
                        return this.maybeTakeEquals(Token.LeftAngleLeftAngle, Token.LeftAngleLeftAngleEquals);
                    } else if (current == "=") {
                        this.skip();
                        return Token.LeftAngleEquals;
                    } else {
                        return Token.LeftAngle;
                    }
                }
                case ">": {
                    const current = this.get();
                    if (current == ">") {
                        return this.maybeTakeEquals(Token.RightAngleRightAngle, Token.RightAngleRightAngleEquals);
                    } else if (current == "=") {
                        this.skip();
                        return Token.RightAngleEquals;
                    } else {
                        return Token.RightAngle;
                    }
                }
                case "=":
                    return this.maybeTakeEquals(Token.Equals, Token.EqualsEquals);
                case "!":
                    return this.maybeTakeEquals(Token.Exclamation, Token.ExclamationEquals);
                case "&":
                    return this.maybeTakeEquals(Token.Ampersand, Token.AmpersandEquals);
                case "|": {
                    const current = this.get();
                    if (current == "-") {
                        if (this.lookahead(() => this.get() === ">")) {
                            this.skip();
                            return Token.PipeArrow;
                        }
                        return Token.Pipe;
                    } else if (current == "=") {
                        this.skip();
                        return Token.PipeEquals;
                    } else {
                        return Token.Pipe;
                    }
                }
                case "^":
                    return this.maybeTakeEquals(Token.Caret, Token.CaretEquals);
                case "~":
                    return this.maybeTakeEquals(Token.Tilde, Token.TildeEquals);
                case "(": {
                    this.skip();
                    return Token.LeftParen;
                }
                case ")": {
                    this.skip();
                    return Token.RightParen;
                }
                case "[": {
                    this.skip();
                    return Token.LeftBracket;
                }
                case "]": {
                    this.skip();
                    return Token.RightBracket;
                }
                case "{": {
                    this.skip();
                    return Token.LeftBrace;
                }
                case "}": {
                    this.skip();
                    return Token.RightBrace;
                }
                case ":": {
                    this.skip();
                    return Token.Colon;
                }
                case ";": {
                    this.skip();
                    return Token.Semicolon;
                }
                case ".": {
                    const current = this.get();
                    if (current == ".") {
                        this.skip();
                        return Token.PeriodPeriod;
                    } else if (isDigit(current)) {
                        this.bufferNumeral();
                        return Token.Number;
                    }
                    return Token.Period;
                }
                case '"': {
                    const chunks: string[] = [];
                    let current = this.get();
                    let start = this.p;
                    let closed = true;
                    while (current != '"') {
                        if (isNewline(current)) {
                            closed = false;
                            break;
                        }
                        if (current == "\\") {
                            current = this.get();
                            const lookup = escape.get(current);
                            if (lookup) {
                                chunks.push(this.src.substring(start, this.p - 1));
                                chunks.push(lookup);
                                current = this.get();
                                start = this.p;
                            }
                            continue;
                        }
                        current = this.get();
                    }
                    chunks.push(this.src.substring(start, this.p));
                    this.buffer = chunks.join("");
                    if (closed) {
                        this.skip();
                    }
                    return closed ? Token.String : Token.UnclosedString;
                }
                case ",": {
                    this.skip();
                    return Token.Comma;
                }
                case "": {
                    return Token.EOF;
                }
                default: {
                    if (isSpace(current)) {
                        // assert not \n, \r
                        this.skip();
                        continue;
                    } else if (isDigit(current)) {
                        this.bufferNumeral();
                        return Token.Number;
                    }
                    const start = this.p;
                    while (!identifierStopSet.has(this.get()));
                    const buffer = this.src.substring(start, this.p);
                    const lookup = keywords.get(buffer);
                    if (lookup !== undefined) {
                        return lookup;
                    }
                    this.buffer = buffer;
                    return Token.Ident;
                }
            }
        }
    }
}

const escape = new Map([
    ["b", "\b"],
    ["f", "\f"],
    ["n", "\n"],
    ["r", "\r"],
    ["t", "\t"],
    ["v", "\v"],
    ['"', '"'],
    ["\\", "\\"]
]);
const whitespace = new Set([" ", "\n", "\t", "\v", "\f", "\r"]);
const identifierStopSet = new Set([
    "",
    "*",
    "/",
    "%",
    "+",
    "-",
    "<",
    ">",
    "=",
    "!",
    "&",
    "|",
    "^",
    "~",
    "(",
    ")",
    "{",
    "}",
    ":",
    ";",
    ".",
    ",",
    '"',
    ...whitespace
]);
function isSpace(char: string) {
    return whitespace.has(char);
}

function isDigit(char: string) {
    return char >= "0" && char <= "9";
}

function isDigitPlusOrMinus(char: string) {
    return isDigit(char) || char == "+" || char == "-";
}

function isDigitOrUnderscore(char: string) {
    return isDigit(char) || char == "_";
}

function isNewline(char: string) {
    return char == "\n" || char == "\r";
}

export enum Token {
    Function,
    As,
    Inline,
    Pure,
    Export,
    Host,
    Loop,
    Type,
    If,
    From,
    Let,
    Else,
    Mut,
    Never,
    Union,
    Return,
    Continue,
    With,
    Without,
    Asterisk,
    AsteriskEquals,
    Slash,
    SlashEquals,
    Percent,
    PercentEquals,
    Plus,
    PlusEquals,
    Minus,
    MinusEquals,
    Arrow,
    LeftAngle,
    LeftAngleEquals,
    LeftAngleLeftAngle,
    LeftAngleLeftAngleEquals,
    RightAngle,
    RightAngleEquals,
    RightAngleRightAngle,
    RightAngleRightAngleEquals,
    Equals,
    EqualsEquals,
    Exclamation,
    ExclamationEquals,
    Ampersand,
    AmpersandEquals,
    Pipe,
    PipeArrow,
    PipeEquals,
    Caret,
    CaretEquals,
    Tilde,
    TildeEquals,
    LeftParen,
    RightParen,
    LeftBracket,
    RightBracket,
    LeftBrace,
    RightBrace,
    Colon,
    Semicolon,
    Period,
    PeriodPeriod,
    Comma,
    String,
    UnclosedString,
    Number,
    Ident,
    EOF
}

export class Span {
    static None = new Span(1, 0);
    constructor(public start: number, public end: number) {}
    public link(src: string) {
        return src.substring(this.start, this.end);
    }

    public isNone(): boolean {
        return this.start > this.end;
    }

    public assert() {
        if (this.isNone()) {
            throw new Error();
        }
    }
}

const keywords = new Map([
    ["function", Token.Function],
    ["as", Token.As],
    ["inline", Token.Inline],
    ["export", Token.Export],
    ["loop", Token.Loop],
    ["type", Token.Type],
    ["if", Token.If],
    ["from", Token.From],
    ["let", Token.Let],
    ["else", Token.Else],
    ["never", Token.Never],
    ["mut", Token.Mut],
    ["pure", Token.Pure],
    ["union", Token.Union],
    ["return", Token.Return],
    ["continue", Token.Continue],
    ["with", Token.With],
    ["without", Token.Without]
]);
