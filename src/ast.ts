import { Span } from "./lexer.js";

export class Root {
    constructor(public items: Item[]) {}
}

export type Statement = Let | Return | If | Assign | Atom | Item;

export class Let {
    constructor(public span: Span, public pattern: Atom | null, public expr: Atom | null) {}
}

export class If {
    constructor(
        public span: Span,
        public cond: Atom | null,
        public body: Statement[],
        public else_: Statement[] | If | undefined
    ) {}
}

export class Return {
    constructor(public span: Span, public expr: Atom | null | undefined) {}
}

export class Assign {
    constructor(public span: Span, public kind: BinOp, public left: Atom | null, public right: Atom | null) {}
}

export type Atom =
    | Dash
    | Kind
    | Mut
    | Refl
    | Pure
    | Cast
    | Ascription
    | Field
    | Binary
    | Unary
    | Call
    | TypeCall
    | Product
    | NumberLiteral
    | IntegerLiteral
    | StringLiteral
    | Ident;

export class Dash {
    constructor(public span: Span) {}
}

export class Kind {
    constructor(public span: Span, public i: number) {}
}

export class Mut {
    constructor(public span: Span, public expr: Atom | null) {}
}

export class Refl {
    constructor(public span: Span, public expr: Atom | null) {}
}

export class Pure {
    constructor(public span: Span, public expr: Atom | null) {}
}

export class Cast {
    constructor(public span: Span, public ty: Atom | null, public expr: Atom | null) {}
}

export class Lambda {
    constructor(public span: Span, public expr: Atom | null, public body: Atom | null) {}
}

export class Ascription {
    constructor(public span: Span, public expr: Atom | null, public ty: Atom | null) {}
}

export class Field {
    constructor(public span: Span, public expr: Atom | null, public ident: Ident) {}
}

export class Binary {
    constructor(public span: Span, public kind: BinOp, public left: Atom | null, public right: Atom | null) {}
}

export class Unary {
    constructor(public span: Span, public kind: UnOp, public right: Atom | null) {}
}

export class Call {
    constructor(
        public span: Span,
        public base: Atom | null,
        public ty: Atom[] | null,
        public args: Array<Atom | null>
    ) {}
}

export class TypeCall {
    constructor(public span: Span, public base: Atom | null, public ty: Atom[]) {}
}

export class Product {
    constructor(public span: Span, public fields: Array<Atom | null>) {}
}

export class NumberLiteral {
    constructor(public span: Span, public value: number) {}
}

export class IntegerLiteral {
    constructor(public span: Span, public value: bigint) {}
}

export class StringLiteral {
    constructor(public span: Span, public value: string) {}
}

export class Ident {
    constructor(public span: Span) {}
}

export class Never {
    constructor(public span: Span) {}
}

export class Global {
    constructor(public span: Span, public exported: boolean, public host: boolean, public let_: Let) {}
}

export type Item = FunctionDeclaration | Global;

export class FunctionSignature {
    constructor(
        public exported: boolean,
        public host: boolean,
        public name: Span,
        public ty: Array<Atom | null> | undefined,
        public params: Array<Atom | null>,
        public returnTy: Atom | null | undefined
    ) {}
}

export class FunctionDeclaration {
    constructor(
        public span: Span,
        public fullSpan: Span,
        public sig: FunctionSignature,
        public body: Statement[] | Atom | null
    ) {}

    get name(): Span {
        return this.sig.name;
    }

    get exported(): boolean {
        return this.sig.exported;
    }

    get host(): boolean {
        return this.sig.host;
    }
}

export enum UnOp {
    LNot,
    BNot,
    Neg
}

export enum BinOp {
    Id,
    Mul,
    Div,
    Mod,
    Add,
    Sub,
    Shl,
    Shr,
    Lt,
    Le,
    Gt,
    Ge,
    Eq,
    Ne,
    And,
    Or,
    Xor,
    Arrow
}

export const precedence = new Map([
    [BinOp.Mul, [10, false]],
    [BinOp.Div, [10, false]],
    [BinOp.Mod, [10, false]],
    [BinOp.Add, [9, false]],
    [BinOp.Sub, [9, false]],
    [BinOp.Lt, [8, false]],
    [BinOp.Le, [8, false]],
    [BinOp.Gt, [8, false]],
    [BinOp.Ge, [8, false]],
    [BinOp.Eq, [7, false]],
    [BinOp.Ne, [7, false]],
    [BinOp.And, [6, false]],
    [BinOp.Arrow, [5, true]],
    [BinOp.Or, [4, false]],
    [BinOp.Xor, [3, false]]
]);

function rev<K, V>(x: [K, V][]): [V, K][] {
    return x.map(([k, v]) => [v, k]);
}
const unOps: [string, UnOp][] = [
    ["lnot", UnOp.LNot],
    ["bnot", UnOp.BNot],
    ["neg", UnOp.Neg]
];

export const unOpToName = new Map(rev(unOps));
export const nameToUnOp = new Map(unOps);

const binOps: [string, BinOp][] = [
    ["mul", BinOp.Mul],
    ["div", BinOp.Div],
    ["mod", BinOp.Mod],
    ["add", BinOp.Add],
    ["sub", BinOp.Sub],
    ["lt", BinOp.Lt],
    ["le", BinOp.Le],
    ["gt", BinOp.Gt],
    ["ge", BinOp.Ge],
    ["eq", BinOp.Eq],
    ["ne", BinOp.Ne],
    ["and", BinOp.And],
    ["or", BinOp.Or],
    ["xor", BinOp.Xor]
];

export const binOpToName = new Map(rev(binOps));
export const nameToBinOp = new Map(binOps);
