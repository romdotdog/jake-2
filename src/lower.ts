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
        if (!result.isPrototypicalType()) {
            this.error(atom.span, "expected type, got term");
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
            return new IR.Universe(null, atom.i);
        } else if (atom instanceof AST.Mut) {
            this.error(atom.span, "mut is not allowed in this position");
        } else if (atom instanceof AST.Refl) {
            this.error(atom.span, "TODO: identity type");
        } else if (atom instanceof AST.Cast) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Field) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Binary) {
            const isArrow = atom.kind === AST.BinOp.Arrow;
            if (isArrow || atom.kind == AST.BinOp.FatArrow) {
                return this.push(() => new IR.FnType(isArrow, this.type(atom.left), this.type(atom.right)));
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
                if (res.type === undefined) {
                    isTerm = undefined;
                } else if (!res.isPrototypicalType()) {
                    isTerm = true;
                }
                fields.push(res);
            }
            let prod: IR.Term;
            if (isTerm === true) {
                prod = new IR.ProductTerm(null, fields as IR.Typed<IR.HOType>[]);
            } else if (isTerm === false) {
                prod = new IR.ProductType(null, fields as IR.HOType[]);
            } else {
                prod = new IR.Product(fields);
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

    private pattern(pattern: AST.Atom, param: IR.Term): [string, IR.Local][] {
        if (pattern instanceof AST.Product) {
            // TODO: calls
            throw new Error();
        } else if (pattern instanceof AST.Ident) {
            const name = pattern.span.link(this.lexer.getSource());
            if (param instanceof IR.Binding && param.name === null) {
                param.name = name;
            }
            return [[name, new IR.Local(param)]];
        }
        throw new Error();
    }

    private parameters(buffer: AST.Atom[], atom: AST.Atom): [AST.Atom, IR.DefBinding][] | undefined {
        if (atom instanceof AST.Ascription) {
            if (atom.expr !== null) buffer.push(atom.expr);
            if (atom.ty === null) return undefined;
            const ty = this.type(atom.ty);
            return buffer.map(v => [v, new IR.DefBinding(ty)]);
        }
        buffer.push(atom);
        return undefined;
    }

    private functionDecl(fn: AST.FunctionDeclaration) {
        this.scope = this.scope.push();
        const blockBody: IR.Statement[] = [];
        const paramDefs: IR.DefBinding[] = [];
        let buffer: AST.Atom[] = [];
        const addPatterns = (patterns: Array<AST.Atom | null>) => {
            for (const pattern of patterns) {
                if (pattern === null) continue;
                const res = this.parameters(buffer, pattern);
                if (res === undefined) continue;
                for (const [pattern, def] of res) {
                    paramDefs.push(def);
                    for (const [name, local] of this.pattern(pattern, def.binding)) {
                        this.scope.set(name, local);
                    }
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

        const block = this.block(blockBody, body);
        let firstParamDef = paramDefs.pop() ?? new IR.DefBinding(IR.Product.type([]));
        let fnTerm = new IR.Fn(firstParamDef, block);
        let nextParamDef: IR.DefBinding | undefined;
        while ((nextParamDef = paramDefs.pop()) !== undefined) {
            fnTerm = new IR.Fn(nextParamDef, IR.Block.trivial(fnTerm));
        }
        const name = fn.sig.name.link(this.lexer.getSource());
        this.scope.set(name, new IR.Local(fnTerm));
    }

    private exprAsBlock(body: IR.Statement[], atom: AST.Atom): IR.Block {
        const term = this.atom(atom);
        body.push(new IR.Return(term));
    }

    private block(body: IR.Statement[], stmts: AST.Statement[]): IR.Block {
        for (const stmt of stmts) {
            if (stmt instanceof AST.Let) {
                let pattern = stmt.pattern;
                let type: IR.HOType;
                if (pattern === null) continue;
                let init: IR.Term;
                if (stmt.expr === undefined) {
                    if (stmt.pattern instanceof AST.Binary && stmt.pattern.kind === AST.BinOp.Eq) {
                        if (stmt.pattern.left === null || stmt.pattern.right === null) continue;
                        pattern = stmt.pattern.left;
                        init = this.atom(stmt.pattern.right);
                    } else {
                        this.error(stmt.span, "let statement needs initializer");
                        continue;
                    }
                } else {
                    if (stmt.expr === null) continue;
                    init = this.atom(stmt.expr);
                }
                if (pattern instanceof AST.Ascription) {
                    if (pattern.expr === null) continue;
                    type = this.type(pattern.ty);
                    pattern = pattern.expr;
                }
                for (const [name, term] of this.pattern(pattern, init)) {
                    const local = new IR.Local(term);
                    this.scope.set(name, local);
                    body.push(new IR.InitializeLocal(local));
                }
                // TODO: typecheck
            }
        }
    }

    private global(global: AST.Global) {}
}

class Scope {
    private parent: Scope | null = null;
    private i = 0;
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
        scope.i = this.i;
        return scope;
    }

    public pop(): Scope {
        if (this.parent === null) throw new Error();
        return this.parent;
    }
}
