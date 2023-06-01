import * as AST from "./ast.js";
import * as IR from "./ir.js";
import Lexer, { Span } from "./lexer.js";

export class Lower {
    private scope = new Scope();
    private error(span: Span, message: string) {
        span.assert();
        this.lexer.print(span, message);
    }

    constructor(public ast: AST.Root, public lexer: Lexer) {}

    public lower() {
        for (const item of this.ast.items) {
            this.item(item);
        }
    }

    private item(item: AST.FunctionDeclaration | AST.Global) {
        if (item instanceof AST.FunctionDeclaration) {
            this.functionDecl(item);
        } else if (item instanceof AST.Global) {
            this.global(item);
        }
    }

    private type(atom: AST.Atom | null): IR.HOType {
        if (atom === null) {
            return new IR.Never();
        }
        const result = this.atom(atom);
        if (Array.isArray(result)) {
            return result[1];
        } else if (result instanceof IR.Product) {
            if (!result.coerceToType()) {
                this.error(atom.span, "expected type, got product term");
                return new IR.Never();
            }
        } else if (result instanceof IR.Term) {
            this.error(atom.span, "expected type");
            return new IR.Never();
        }
        return result;
    }

    private push<T>(f: () => T): T {
        this.scope = this.scope.push();
        const res = f();
        this.scope = this.scope.pop();
        return res;
    }

    private atom(atom: AST.Atom): IR.Term {
        if (atom instanceof AST.Dash) {
            this.error(atom.span, "- is not allowed in this position");
        } else if (atom instanceof AST.Kind) {
            return new IR.Universe(atom.i);
        } else if (atom instanceof AST.Mut) {
            this.error(atom.span, "mut is not allowed in this position");
        } else if (atom instanceof AST.Refl) {
            this.error(atom.span, "TODO: identity type");
        } else if (atom instanceof AST.Cast) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Field) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Binary) {
            if (atom.kind === AST.BinOp.Arrow) {
                return this.push(() => new IR.FnType(this.type(atom.left), this.type(atom.right)));
            } else {
                this.error(atom.span, "TODO: calls");
            }
        } else if (atom instanceof AST.Unary) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Call) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.TypeCall) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Product) {
            let isTerm: boolean | undefined = false;
            const fields: IR.Term[] = [];
            for (let field of atom.fields) {
                if (field === null) return new IR.Unreachable(null);
                if (field instanceof AST.Ascription) {
                    this.error(atom.span, "TODO: functions");
                    field = field.ty;
                    if (field === null) return new IR.Unreachable(null);
                }
                const res = this.atom(field);
                if (res instanceof IR.Product) {
                    if (!isTerm) {
                        isTerm = undefined;
                    }
                } else if (!res.isPrototypicalType()) {
                    isTerm = true;
                }
            }
            const prod = new IR.Product(fields, undefined);
            if (isTerm === true) {
                if (!prod.coerceToTerm()) throw new Error();
            } else if (isTerm === false) {
                if (!prod.coerceToType()) throw new Error();
            }
            return prod;
        } else if (atom instanceof AST.IntegerLiteral) {
            return new IR.Integer(undefined, atom.value);
        } else if (atom instanceof AST.NumberLiteral) {
            return new IR.Float(undefined, atom.value);
        } else if (atom instanceof AST.Ident) {
            const res = this.scope.find(atom.span.link(this.lexer.getSource()));
            if (res === undefined) {
                this.error(atom.span, "not found");
                return new IR.Unreachable(null);
            }
            return res;
        }

        throw new Error();
    }

    private pattern2(expr: AST.Atom, ty: AST.Atom): [string, IR.DefBinding][] {
        const type = this.type(ty);
        if (expr instanceof AST.Product) {
            this.error(ty.span, "TODO: calls");
            throw new Error();
        } else if (expr instanceof AST.Ident) {
            const binding = new IR.DefBinding(type);
            return [[expr.span.link(this.lexer.getSource()), binding]];
        }
        throw new Error();
    }

    private pattern1(buffer: AST.Atom[], atom: AST.Atom): [string, IR.DefBinding][] | undefined {
        if (atom instanceof AST.Ascription) {
            if (atom.expr !== null) buffer.push(atom.expr);
            if (atom.ty === null) return undefined;
            const ty = atom.ty;
            const bindings = buffer.flatMap(v => this.pattern2(v, ty));
            return bindings;
        } else {
            buffer.push(atom);
            return undefined;
        }
    }

    private functionDecl(fn: AST.FunctionDeclaration) {
        this.scope = this.scope.push();
        const paramsDefs: IR.DefBinding[] = [];
        let buffer: AST.Atom[] = [];
        const addPatterns = (patterns: Array<AST.Atom | null>) => {
            for (const pattern of patterns) {
                if (pattern === null) continue;
                const res = this.pattern1(buffer, pattern);
                if (res === undefined) continue;
                for (const [name, binding] of res) {
                    this.scope.set(name, new IR.Binding(binding));
                    paramsDefs.push(binding);
                }
            }
            if (buffer.length > 0) {
                this.error(buffer.pop()!.span, "expected type");
            }
            buffer = [];
        };

        if (fn.sig.ty) addPatterns(fn.sig.ty);
        addPatterns(fn.sig.params);
        let returnTy = fn.sig.returnTy;
        if (returnTy === null) return;
        if (fn.body === null) return;
        let body: AST.Statement[] | AST.Implements | AST.Atom;
        if (fn.body === undefined) {
            if (returnTy instanceof AST.Binary && returnTy.kind === AST.BinOp.Eq) {
                if (returnTy.right === null || returnTy.left === null) return;
                body = returnTy.right;
                returnTy = returnTy.left;
            } else {
                this.error(fn.span, "not yet implemented");
                return;
            }
        } else {
            body = fn.body;
        }

    }

    private block(stmts: AST.Statement[]): IR.Block {
        
    }

    private global(global: AST.Global) {}
}

class Scope {
    private parent: Scope | null = null;
    private variables: Map<string, IR.Term> = new Map();

    public get(name: string) {
        return this.variables.get(name);
    }

    public set(name: string, value: IR.Term) {
        this.variables.set(name, value);
    }

    public find(name: string): IR.Term | undefined {
        return this.get(name) ?? this.parent?.find(name);
    }

    public push(): Scope {
        const scope = new Scope();
        scope.parent = this;
        return scope;
    }

    public pop(): Scope {
        if (this.parent === null) throw new Error();
        return this.parent;
    }
}
