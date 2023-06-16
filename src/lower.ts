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
        console.log(this.scope);
    }

    private item(item: AST.FunctionDeclaration | AST.Global) {
        if (item instanceof AST.FunctionDeclaration) {
            this.functionDecl(item);
        } else if (item instanceof AST.Global) {
            this.global(item);
        }
    }

    private type(atom: AST.Atom | null): IR.HOType {
        const result = this.atom(atom, false);
        if (!IR.isType(result)) {
            this.error(atom!.span, "expected type, got term"); // sum types and unreachable are always types
            return IR.Sum.never();
        }
        return result;
    }

    private innerCall(span: Span, fnType: IR.HOType, arg: IR.Term, ctx: IR.UnificationContext): boolean {
        if (IR.Sum.isNever(fnType)) {
            return false;
        }
        if (!(fnType instanceof IR.FnType)) {
            this.error(span, "base does not have a call signature");
            return false;
        }
        const inferred = fnType.infer();
        if (inferred) {
            return this.innerCall(span, inferred, arg, ctx);
        }
        if (arg.type.isSubtypeOf(fnType.source, ctx)) {
            return true;
        }
        this.error(span, "type mismatch");
        return false;
    }

    private call(span: Span, fn: IR.Term, argAtom: AST.Atom | null, ctx: IR.UnificationContext = new Map()): IR.Term {
        // TODO: dash
        const defs: IR.DefBinding[] = [];
        const arg = this.atom(argAtom);
        if (this.innerCall(span, fn.type, arg, ctx)) {
            while(true) {
                const fnType = fn.type as IR.FnType;
                if (fnType.source instanceof IR.DefBinding) {
                    const inferred = ctx.get(fnType.source);
                    if (inferred !== undefined) {
                        fn = new IR.Call(fn, inferred);
                        continue;
                    } else if (fnType.source.inferrable) {
                        const def = new IR.DefBinding(fnType.source);
                        def.name = fnType.source.name;
                        def.inferrable = true;
                        defs.push(def);
                        fn = new IR.Call(fn, def.binding);
                        continue;
                    }
                }
                fn = new IR.Call(fn, arg);
                let nextDef: IR.DefBinding | undefined;
                while ((nextDef = defs.pop()) !== undefined) {
                    fn = new IR.Fn(nextDef, IR.Block.trivial(fn));
                }
                return fn;
            }
        }
        return new IR.Unreachable();
    }

    private atom(atom: AST.Atom | null, term?: boolean): IR.Term {
        if (atom === null) {
            if (term === false) {
                return IR.Sum.never();
            } else {
                return new IR.Unreachable();
            }
        } else if (atom instanceof AST.Dash) {
            this.error(atom.span, "- is not allowed in this position");
        } else if (atom instanceof AST.Kind) {
            return new IR.Universe(atom.i - 1);
        } else if (atom instanceof AST.Mut) {
            this.error(atom.span, "mut is not allowed in this position");
        } else if (atom instanceof AST.Refl) {
            this.error(atom.span, "TODO: identity type");
        } else if (atom instanceof AST.Cast) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Field) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Binary) {
            let binary: AST.Atom | null = atom;
            let isArrow: boolean;
            const parameters: [boolean, IR.HOType][] = [];
            const rootScope = this.scope;
            while (binary instanceof AST.Binary && ((isArrow = binary.kind === AST.BinOp.Arrow) || binary.kind == AST.BinOp.FatArrow)) {
                this.scope = this.scope.push();
                parameters.push([isArrow, this.type(binary.left)])
                binary = binary.right;
            }

            if (parameters.length > 0) {
                for (const parameter of parameters) {
                    if (parameter instanceof IR.DefBinding) {
                        parameter.markInferrable();
                    }
                }
                let fnType = this.type(binary);
                let nextParamDef: [boolean, IR.HOType] | undefined;
                while ((nextParamDef = parameters.pop()) !== undefined) {
                    fnType = new IR.FnType(nextParamDef[0], nextParamDef[1], fnType);
                }
                this.scope = rootScope;
                return fnType;
            }

            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Unary) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Call) {
            let fn = this.atom(atom.base, true);
            for (const arg of atom.args) {
                fn = this.call(atom.span, fn, arg);
            } 
            return fn;
        } else if (atom instanceof AST.TypeCall) {
            this.error(atom.span, "TODO: calls");
        } else if (atom instanceof AST.Product) {
            let isTerm: boolean | undefined = false;
            const fields: IR.Term[] = [];
            for (let field of atom.fields) {
                if (field === null) return IR.Unreachable.never();
                if (field instanceof AST.Ascription) {
                    this.error(atom.span, "TODO: functions");
                    field = field.ty;
                    if (field === null) return IR.Unreachable.never();
                }
                const res = this.atom(field);
                if (res.type === undefined) {
                    isTerm = undefined;
                } else if (!IR.isType(res)) {
                    isTerm = true;
                }
                fields.push(res);
            }
            let prod: IR.Term;
            if (isTerm === true || term === true) {
                prod = new IR.Product(
                    fields as IR.Term[],
                    new IR.Product(
                        fields.map(f => f.type),
                        new IR.Universe(0)
                    )
                );
            } else if (isTerm === false || term === false) {
                prod = new IR.Product(fields as IR.HOType[], new IR.Universe(0));
            } else {
                prod = new IR.Product(fields);
            }
            return prod;
        } else if (atom instanceof AST.IntegerLiteral) {
            return new IR.Number(new IR.NumberType(), atom.value);
        } else if (atom instanceof AST.NumberLiteral) {
            return new IR.Float(new IR.FloatType(), atom.value);
        } else if (atom instanceof AST.Ident) {
            const res = this.scope.find(atom.span.link(this.lexer.getSource()));
            if (res === undefined) {
                this.error(atom.span, "not found");
                return IR.Unreachable.never();
            }
            if (res instanceof IR.DefBinding) {
                return res.binding;
            }
            return res;
        }

        throw new Error();
    }

    private pattern(pattern: AST.Atom, param: IR.Term): [string, IR.Term][] {
        if (pattern instanceof AST.Product) {
            // TODO: calls
            throw new Error();
        } else if (pattern instanceof AST.Ident) {
            const name = pattern.span.link(this.lexer.getSource());
            if (param instanceof IR.DefBinding && param.name === undefined) {
                param.name = name;
            }
            return [[name, param]];
        }
        throw new Error();
    }

    private parameters(buffer: AST.Atom[], atom: AST.Atom): [AST.Atom, IR.DefBinding][] | undefined {
        if (atom instanceof AST.Ascription) {
            if (atom.expr !== null) buffer.push(atom.expr);
            if (atom.ty === null) return undefined;
            const ty = this.type(atom.ty);
            return buffer.splice(0, buffer.length).map(v => [v, new IR.DefBinding(ty)]);
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
                    for (const [name, term] of this.pattern(pattern, def)) {
                        this.scope.set(name, term);
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

        for (const def of paramDefs) {
            def.markInferrable();
        }

        let returnTy = fn.sig.returnTy;
        if (returnTy === null || fn.body === null) return;
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

        if (body instanceof AST.Implements) throw new Error();
        let block = Array.isArray(body) ? this.block(body, blockBody) : this.exprAsBlock(blockBody, body);
        if (returnTy !== undefined) {
            const type = this.type(returnTy);
            const res = block.coerce(type);
            if (res !== undefined) {
                block = res;
            } else {
                this.error(returnTy.span, "type mismatch");
            }
        }
        let firstParamDef = paramDefs.pop() ?? new IR.DefBinding(IR.Product.void());
        let fnTerm = new IR.Fn(firstParamDef, block);
        let nextParamDef: IR.DefBinding | undefined;
        while ((nextParamDef = paramDefs.pop()) !== undefined) {
            fnTerm = new IR.Fn(nextParamDef, IR.Block.trivial(fnTerm));
        }
        this.scope = this.scope.pop()
        const name = fn.sig.name.link(this.lexer.getSource());
        this.scope.set(name, new IR.Local(fnTerm));
    }

    private exprAsBlock(body: IR.Statement[], atom: AST.Atom): IR.Block {
        const term = this.atom(atom);
        body.push(new IR.Return(term));
        return new IR.Block(new IR.Branch(term.pure, body), term.type);
    }

    private branch(stmts: AST.Statement[], returnType: Cell<IR.HOType>, body: IR.Statement[] = []): [branch: IR.Branch, returned: boolean] {
        let pure = true;
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
                    const coercion = init.coerce(type);
                    if (coercion === undefined) {
                        this.error(stmt.span, "type mismatch");
                        init = IR.Unreachable.never();
                    } else {
                        init = coercion;
                    }
                    pattern = pattern.expr;
                }
                pure &&= init.pure;
                for (const [name, term] of this.pattern(pattern, init)) {
                    const local = new IR.Local(term);
                    this.scope.set(name, local);
                    body.push(new IR.InitializeLocal(local));
                }
            } else if (stmt instanceof AST.Assign) {
                if (stmt.left === null || stmt.right === null) continue;
                const init = this.atom(stmt.right);
                pure &&= init.pure;
                for (let [name, term] of this.pattern(stmt.left, init)) {
                    const local = this.scope.find(name);
                    if (local === undefined || !(local instanceof IR.Local)) continue;
                    let newTerm = term.coerce(local.type);
                    if (newTerm === undefined) {
                        this.error(stmt.span, "type mismatch");
                        term = IR.Unreachable.never();
                        newTerm = term;
                    }
                    const newLocal = new IR.Local(term);
                    const newCoercedLocal = new IR.Local(newTerm);
                    body.push(new IR.InitializeLocal(newLocal));
                    this.scope.set(name, newLocal);
                    if (!this.scope.has(name)) {
                        this.scope.assign(name, local, newCoercedLocal);
                    }
                }
            } else if (stmt instanceof AST.Return) {
                if (stmt.expr === null) continue;
                let init: IR.Term;
                if (stmt.expr === undefined) {
                    init = IR.Product.unit();
                } else {
                    init = this.atom(stmt.expr);
                }
                returnType.set(IR.Sum.create([returnType.get(), init.type]));
                pure &&= init.pure;
                body.push(new IR.Return(init));
                return [new IR.Branch(pure, body), true];
            } else if (stmt instanceof AST.If) {
                if (stmt.cond === null) continue;
                const cond = this.atom(stmt.cond);
                pure &&= cond.pure;

                const trueScope = this.scope.push(cond.pure);
                this.scope = trueScope;
                const [trueBranch] = this.branch(stmt.body, returnType);
                this.scope = trueScope.pop();

                let falseBranchStmts: AST.Statement[];
                if (stmt.else_ === undefined) {
                    falseBranchStmts = [];
                } else if (stmt.else_ instanceof AST.If) {
                    falseBranchStmts = [stmt.else_];
                } else {
                    falseBranchStmts = stmt.else_;
                }

                const falseScope = this.scope.push(cond.pure);
                this.scope = falseScope;
                const [falseBranch] = this.branch(falseBranchStmts, returnType);
                this.scope = falseScope.pop();

                body.push(new IR.If(cond, trueBranch, falseBranch));
                pure &&= trueBranch.pure;
                pure &&= falseBranch.pure;

                this.scope.fuse(trueScope, falseScope);
            }
        }
        return [new IR.Branch(pure, body), false];
    }

    private block(stmts: AST.Statement[], body: IR.Statement[]): IR.Block {
        const returnType: Cell<IR.HOType> = new Cell(IR.Sum.never()); // TODO: fix
        const [branch, returned] = this.branch(stmts, returnType, body);
        if (!returned) {
            const init = IR.Product.unit();
            returnType.set(IR.Sum.create([returnType.get(), init.type]));
            body.push(new IR.Return(init));
        }
        return new IR.Block(branch, returnType.get());
    }

    private global(global: AST.Global) {}
}

class Cell<T> {
    constructor(private inner: T) {}

    public get() {
        return this.inner;
    }

    public set(x: T) {
        this.inner = x;
    }
}

class Scope {
    private parent: Scope | null = null;
    private i = 0;
    private variables: Map<string, IR.Term> = new Map();
    private assignments: Map<string, [oldLocal: IR.Local, newLocal: IR.Local]> = new Map();
    private pure = true;

    public fuse(b1: Scope, b2: Scope) {
        for (const [name, [oldLocal, newLocal]] of b1.assignments.entries()) {
            let alternateLocal: IR.Local;
            let alternateAssignment = b2.assignments.get(name);
            if (alternateAssignment === undefined) {
                alternateLocal = oldLocal;
            } else {
                alternateLocal = alternateAssignment[1];
            }
            this.set(name, new IR.Phi(b1.pure && b2.pure, [newLocal, alternateLocal]));
        }
        for (const [name, [oldLocal, newLocal]] of b2.assignments.entries()) {
            let alternateAssignment = b1.assignments.get(name);
            if (alternateAssignment === undefined) {
                this.set(name, new IR.Phi(b1.pure && b2.pure, [oldLocal, newLocal]));
            }
        }
    }

    public has(name: string) {
        return this.variables.has(name);
    }

    public get(name: string) {
        return this.variables.get(name);
    }

    public set(name: string, value: IR.Term) {
        this.variables.set(name, value);
    }

    public assign(name: string, oldLocal: IR.Local, newLocal: IR.Local) {
        this.assignments.set(name, [oldLocal, newLocal]);
    }

    public find(name: string): IR.Term | undefined {
        return this.get(name) ?? this.parent?.find(name);
    }

    public push(pure: boolean = true): Scope {
        const scope = new Scope();
        scope.parent = this;
        scope.i = this.i;
        scope.pure = pure;
        return scope;
    }

    public pop(): Scope {
        if (this.parent === null) throw new Error();
        return this.parent;
    }
}
