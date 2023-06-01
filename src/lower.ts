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

    private type(atom: AST.Atom): IR.HOType | null {
        const result = this.atom(atom);
        if (Array.isArray(result)) {
            return result[1];
        } else if (result instanceof IR.Term) {
            this.error(atom.span, "expected type");
            return null;
        }
        return result;
    }

    private atom(atom: AST.Atom): IR.Term | IR.HOType | [IR.Term, IR.HOType] {}

    private pattern2(expr: AST.Atom, ty: AST.Atom): [IR.Binding[], IR.Term] {
        if (expr instanceof AST.Product) {
            if (ty instanceof AST.Product) {
                if (ty.fields.length < expr.fields.length) {
                }
            }
        }
    }

    private pattern1(buffer: AST.Atom[], atom: AST.Atom): IR.Binding[] | undefined {
        if (atom instanceof AST.Ascription) {
            if (atom.expr !== null) buffer.push(atom.expr);
            if (atom.ty === null) return undefined;
            const bindings = buffer.map(v => this.pattern2(v, atom.ty));
        } else {
            buffer.push(atom);
            return undefined;
        }
    }

    private functionDecl(fn: AST.FunctionDeclaration) {
        this.scope = this.scope.push();
        const parameters: IR.Binding = [];
        if (fn.sig.ty) {
            for (const pattern of fn.sig.ty) {
                if (pattern === null) continue;
            }
        }
    }

    private global(global: AST.Global) {}
}

class Scope {
    private parent: Scope | null = null;
    private variables: Map<string, IR.Term> = new Map();

    public get(name: string) {
        return this.variables.get(name);
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
