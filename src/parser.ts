import Lexer, { Span, Token } from "./lexer.js";
import * as AST from "./ast.js";

export default class Parser {
    private lookahead: Token;
    private buffer: number | bigint | string | null = null;
    private start = 0;
    private end = 0;
    private source = new AST.Root([]);
    private quiet = false;
    private ignoreGt = false;

    private error(span: Span, message: string, important = false) {
        if (!(important || this.quiet)) {
            span.assert();
            this.lexer.print(span, message);
        }
    }

    private from(start: number): Span {
        return new Span(start, this.end);
    }

    private get span(): Span {
        return this.from(this.start);
    }

    private get lookaheadSpan(): Span {
        return new Span(this.lexer.start, this.lexer.p);
    }

    private next() {
        this.buffer = this.lexer.buffer;
        this.start = this.lexer.start;
        this.end = this.lexer.p;
        this.lookahead = this.lexer.next();
    }

    // unbounded lookahead. reserved for A<B> and A<B, C>(1)
    private fork<T>(f: () => T | null): T | null {
        const { buffer, start, end } = this;
        const { buffer: lexerBuffer, start: lexerStart, p: lexerP } = this.lexer;
        this.quiet = true;
        const result = f();
        this.quiet = false;
        if (result === null) {
            this.buffer = buffer;
            this.start = start;
            this.end = end;
            this.lexer.buffer = lexerBuffer;
            this.lexer.start = lexerStart;
            this.lexer.p = lexerP;
        }
        return result;
    }

    constructor(private lexer: Lexer) {
        this.lookahead = this.lexer.next();
    }

    private eat(token: Token): boolean {
        if (this.lookahead == token) {
            this.next();
            return true;
        }
        return false;
    }

    private readString(): string {
        return <string>this.buffer;
    }

    private readStringLiteral(): AST.StringLiteral {
        return new AST.StringLiteral(this.span, this.readString());
    }

    private comma<T>(f: () => T): T[] {
        const result: T[] = [];
        do {
            result.push(f());
        } while (this.eat(Token.Comma));
        return result;
    }

    private enclose<T>(open: Token, close: Token, f: () => T): T | null {
        if (this.eat(open)) {
            if (this.eat(close)) {
                return null;
            }
            const result = f();
            if (!this.eat(close)) {
                this.error(this.lookaheadSpan, "expected closing delimiter");
            }
            return result;
        } else {
            this.error(this.lookaheadSpan, "expected opening delimiter");
        }
        return null;
    }

    private literal(): AST.Atom | null {
        if (this.eat(Token.Ident)) {
            return new AST.Ident(this.span);
        } else if (this.eat(Token.Number)) {
            if (typeof this.buffer == "number") {
                return new AST.NumberLiteral(this.span, this.buffer);
            } else if (typeof this.buffer == "bigint") {
                return new AST.IntegerLiteral(this.span, this.buffer);
            } else {
                throw new Error("buffer error");
            }
        } else if (this.eat(Token.String)) {
            return new AST.StringLiteral(this.span, <string>this.buffer);
        } else if (this.eat(Token.LeftParen)) {
            const atom = this.atom();
            if (!this.eat(Token.RightParen)) {
                this.error(this.lookaheadSpan, "expected `)`");
            }
            return atom;
        } else if (this.eat(Token.LeftBracket)) {
            const start = this.start;
            if (this.eat(Token.RightBracket)) {
                return new AST.Product(this.from(start), []);
            }
            const array = this.atomArray();
            if (!this.eat(Token.RightBracket)) {
                this.error(this.lookaheadSpan, "expected `]`");
            }
            return new AST.Product(this.from(start), array);
        } else if (this.eat(Token.Never)) {
            return new AST.Never(this.span);
        } else if (this.eat(Token.Asterisk)) {
            const start = this.start;
            let i = 1;
            while (this.eat(Token.Asterisk)) i++;
            return new AST.Kind(this.from(start), i);
        } else if (this.eat(Token.Minus)) {
            return new AST.Dash(this.span);
        }
        this.error(this.lookaheadSpan, "invalid expression");
        return null;
    }

    private simpleAtom(base: AST.Atom | null): AST.Atom | null {
        const start = this.start;
        if (this.eat(Token.LeftParen)) {
            const array = this.atomArray();
            if (!this.eat(Token.RightParen)) {
                this.error(this.span, "expected `)` to terminate call");
            }
            return this.simpleAtom(new AST.Call(this.from(start), base, null, array));
        } else if (this.eat(Token.Colon)) {
            const ty = this.atom();
            return new AST.Ascription(this.from(start), base, ty);
        } else if (this.eat(Token.PipeArrow)) {
            const body = this.atom();
            return new AST.Lambda(this.from(start), base, body);
        } else if (this.eat(Token.Period)) {
            if (!this.eat(Token.Ident)) {
                this.error(this.span, "expected identifier after period");
                return null;
            }
            return this.simpleAtom(new AST.Field(this.from(start), base, new AST.Ident(this.span)));
        } else if (this.lookahead == Token.LeftAngle) {
            // Here be dragons 🐉
            type Speculation = [tyArray: AST.Atom[], args: AST.Atom[] | null] | null;
            const speculation: Speculation = this.fork(() => {
                this.next();

                const tyArray = [];
                do {
                    this.ignoreGt = true;
                    const ty = this.atom();
                    this.ignoreGt = false;
                    if (ty === null) {
                        return null;
                    }
                    tyArray.push(ty);
                } while (this.eat(Token.Comma));
                if (!this.eat(Token.RightAngle)) {
                    return null;
                }
                let args = null;
                if (this.eat(Token.LeftParen)) {
                    args = [];
                    do {
                        const atom = this.atom();
                        if (atom === null) {
                            return null;
                        }
                        args.push(atom);
                    } while (this.eat(Token.Comma));
                    if (!this.eat(Token.RightParen)) {
                        this.error(this.lookaheadSpan, "expected `)`");
                    }
                }
                return [tyArray, args];
            });
            if (speculation !== null) {
                const [tyArray, args] = speculation;
                if (args === null) {
                    return this.simpleAtom(new AST.TypeCall(this.from(start), base, tyArray));
                } else {
                    return this.simpleAtom(new AST.Call(this.from(start), base, tyArray, args));
                }
            }
        }
        return base;
    }

    private primaryAtom(): AST.Atom | null {
        const start = this.start;
        const op = unOps.get(this.lookahead);
        if (op !== undefined) {
            this.next();
            const atom = this.primaryAtom();
            return new AST.Unary(this.from(start), op, atom);
        }
        if (this.eat(Token.LeftAngle)) {
            this.ignoreGt = true;
            const ty = this.atom();
            this.ignoreGt = false;
            if (!this.eat(Token.RightAngle)) {
                this.error(this.lookaheadSpan, "expected `>`");
            }
            const atom = this.primaryAtom();
            return new AST.Cast(this.from(start), ty, atom);
        }
        return this.simpleAtom(this.literal());
    }

    private subatom(start: number, left: AST.Atom | null, minPrec: number): AST.Atom | null {
        while (true) {
            const opInfo = binOps.get(this.lookahead);
            if (opInfo == null) break;
            const [op, prec] = opInfo;
            if (this.ignoreGt && op == AST.BinOp.Gt) break;
            if (prec >= minPrec) {
                this.next();
                const rightStart = this.start;
                let right = this.primaryAtom();
                while (true) {
                    const nOpInfo = binOps.get(this.lookahead);
                    if (nOpInfo == null) break;
                    const [nOp, nPrec] = nOpInfo;
                    if (this.ignoreGt && nOp == AST.BinOp.Gt) break;
                    if (nPrec > prec) {
                        right = this.subatom(rightStart, right, prec + 1);
                    } else if (nOp == AST.BinOp.Arrow && nPrec == prec) {
                        right = this.subatom(rightStart, right, prec);
                    } else {
                        break;
                    }
                }

                left = new AST.Binary(this.from(start), op, left, right);
            }
        }
        return left;
    }

    private atom(): AST.Atom | null {
        const start = this.start;
        const mut = this.eat(Token.Mut);
        const pure = this.eat(Token.Pure);
        const refl = this.eat(Token.Refl);
        let atom = this.subatom(this.start, this.primaryAtom(), 0);
        if (refl) {
            atom = new AST.Refl(this.from(start), atom);
        }
        if (pure) {
            atom = new AST.Pure(this.from(start), atom);
        }
        if (mut) {
            atom = new AST.Mut(this.from(start), atom);
        }
        return atom;
    }

    private atomArray(): Array<AST.Atom | null> {
        return this.comma(() => this.atom());
    }

    private eatSemi() {
        if (!this.eat(Token.Semicolon)) {
            this.error(this.lookaheadSpan, "`;` expected");
        }
    }

    private let_(start: number): AST.Let | null {
        const pattern = this.atom();
        if (this.eat(Token.Equals)) {
            const atom = this.atom();
            this.eatSemi();
            return new AST.Let(this.from(start), pattern, atom);
        } else {
            this.error(this.span, "`=` expected - `let` statements require initializers");
        }
        this.eatSemi();
        return null;
    }

    private if_(start: number): AST.If | null {
        const cond = this.atom();
        const body = this.statements();
        let else_: AST.Statement[] | AST.If | undefined = undefined;
        if (this.eat(Token.Else)) {
            if (this.eat(Token.If)) {
                const let_ = this.if_(this.start);
                if (let_ === null) {
                    return null;
                }
                else_ = let_;
            } else {
                else_ = this.statements();
            }
        }
        return new AST.If(this.from(start), cond, body, else_);
    }

    private statement(): AST.Statement | null {
        const start = this.start;
        if (this.eat(Token.Let)) {
            return this.let_(start);
        } else if (this.eat(Token.Return)) {
            let atom = undefined;
            if (!this.eat(Token.Semicolon)) {
                atom = this.atom();
                this.eatSemi();
            }
            return new AST.Return(this.from(start), atom);
        } else if (this.eat(Token.If)) {
            return this.if_(start);
        }

        const atom = this.atom();
        const opKind = assignOps.get(this.lookahead);
        if (opKind) {
            const right = this.atom();
            this.eatSemi();
            return new AST.Assign(this.from(start), opKind, atom, right);
        }
        this.eatSemi();
        return atom;
    }

    private recoverStatements() {
        while (!statementRecovery.has(this.lookahead)) {
            this.next();
        }
    }

    private statements(): AST.Statement[] {
        const statements = [];
        if (this.eat(Token.LeftBrace)) {
            while (!this.eat(Token.RightBrace)) {
                const statement = this.statement();
                if (statement == null) {
                    this.recoverStatements();
                    continue;
                }
                statements.push(statement);
                if (this.lookahead == Token.EOF) {
                    this.error(this.span, "expected `}` as part of block");
                    break;
                }
            }
        } else {
            this.error(this.lookaheadSpan, "expected `{` as part of block");
        }
        return statements;
    }

    private function_(start: number, exported: boolean): AST.Item | null {
        if (this.eat(Token.Ident)) {
            const name = this.span;
            let ty = undefined;
            if (this.eat(Token.LeftAngle)) {
                this.ignoreGt = true;
                ty = this.atomArray();
                this.ignoreGt = false;
                if (!this.eat(Token.RightAngle)) {
                    this.error(this.lookaheadSpan, "expected `>`");
                }
            }
            const params =
                this.enclose(Token.LeftParen, Token.RightParen, () => {
                    return this.comma(() => {
                        return this.atom();
                    });
                }) ?? [];
            let returnTy = undefined;
            if (this.eat(Token.Colon)) {
                returnTy = this.atom();
            }
            const sigSpan = this.from(start);
            const signature = new AST.FunctionSignature(exported, name, ty !== null ? ty : undefined, params, returnTy);
            let body: AST.Statement[] | AST.Atom | null;
            if (this.eat(Token.From)) {
                body = this.atom();
                this.eatSemi();
            } else if (this.eat(Token.Equals)) {
                body = this.atom();
                this.eatSemi();
            } else {
                body = this.statements();
            }
            return new AST.FunctionDeclaration(sigSpan, this.from(start), signature, body);
        } else {
            this.error(this.span, "expected identifier for function");
        }
        return null;
    }

    private recoverTopLevel() {
        while (!topLevelRecovery.has(this.lookahead)) {
            this.next();
        }
    }

    private topLevel() {
        const start = this.start;
        const exported = this.eat(Token.Export);
        if (this.eat(Token.Function)) {
            const function_ = this.function_(start, exported);
            if (function_ == null) {
                this.recoverTopLevel();
                return;
            }
            this.source.items.push(function_);
        } else if (this.eat(Token.Let)) {
            const let_ = this.let_(start);
            if (let_ == null) {
                this.recoverTopLevel();
                return;
            }
            this.source.items.push(new AST.Global(this.from(start), exported, let_));
        } else {
            this.error(this.span, "expected `function` or `type` after export");
            this.recoverTopLevel();
            return;
        }
    }

    public parse(): AST.Root {
        while (this.lookahead != Token.EOF) {
            this.topLevel();
        }
        return this.source;
    }
}

const assignOps = new Map([
    [Token.Equals, AST.BinOp.Id],
    [Token.AsteriskEquals, AST.BinOp.Mul],
    [Token.SlashEquals, AST.BinOp.Div],
    [Token.PercentEquals, AST.BinOp.Mod],
    [Token.PlusEquals, AST.BinOp.Add],
    [Token.MinusEquals, AST.BinOp.Sub],
    [Token.LeftAngleLeftAngleEquals, AST.BinOp.Shl],
    [Token.RightAngleRightAngleEquals, AST.BinOp.Shr],
    [Token.AmpersandEquals, AST.BinOp.And],
    [Token.PipeEquals, AST.BinOp.Or],
    [Token.CaretEquals, AST.BinOp.Xor]
]);

const binOps = new Map([
    [Token.Asterisk, [AST.BinOp.Mul, 10]],
    [Token.Slash, [AST.BinOp.Div, 10]],
    [Token.Percent, [AST.BinOp.Mod, 10]],
    [Token.Plus, [AST.BinOp.Add, 11]],
    [Token.Minus, [AST.BinOp.Sub, 11]],
    [Token.LeftAngleLeftAngle, [AST.BinOp.Shl, 12]],
    [Token.RightAngleRightAngle, [AST.BinOp.Shr, 13]],
    [Token.LeftAngle, [AST.BinOp.Lt, 14]],
    [Token.LeftAngleEquals, [AST.BinOp.Le, 14]],
    [Token.RightAngle, [AST.BinOp.Gt, 14]],
    [Token.RightAngleEquals, [AST.BinOp.Ge, 14]],
    [Token.EqualsEquals, [AST.BinOp.Eq, 15]],
    [Token.ExclamationEquals, [AST.BinOp.Ne, 15]],
    [Token.Ampersand, [AST.BinOp.And, 16]],
    [Token.Pipe, [AST.BinOp.Or, 17]],
    [Token.Caret, [AST.BinOp.Xor, 18]],
    [Token.Arrow, [AST.BinOp.Arrow, 19]]
]);

const unOps = new Map([
    [Token.Exclamation, AST.UnOp.LNot],
    [Token.Tilde, AST.UnOp.BNot],
    [Token.Minus, AST.UnOp.Neg]
]);

const statementRecovery = new Set([Token.Semicolon, Token.RightBrace, Token.EOF]);
const topLevelRecovery = new Set([Token.Function, Token.Let, Token.Type, Token.Export, Token.EOF]);
