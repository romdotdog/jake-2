import * as AST from "./ast.js";
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
        }
    }

    private item(item: AST.FunctionDeclaration | AST.Global) {
        if (item instanceof AST.FunctionDeclaration) {
            this.functionDecl(item);
        } else if (item instanceof AST.Global) {
            this.global(item);
        }
    }

    private functionDecl(fn: AST.FunctionDeclaration) {}

    private global(global: AST.Global) {
        
    }
}

abstract class Sort {
    private cachedUniverse: Universe | null = null;
    constructor(private cachedTy: Sort | null) {}

    protected abstract inferTy(): Sort;
    protected abstract inferUniverse(): Universe;

    get ty(): Sort {
        if (this.cachedTy) return this.cachedTy;
        this.cachedTy = this.inferTy();
        return this.cachedTy;
    }

    get universe(): Universe {
        if (this.cachedUniverse) return this.cachedUniverse;
        this.cachedUniverse = this.inferUniverse();
        return this.cachedUniverse;
    }
}

class Fn extends Sort {
    constructor(public source: Sort, public target: Sort) {
        super(null);
    }

    protected inferTy(): Sort {
        return this.universe;
    }

    protected inferUniverse(): Universe {
        return this.source.universe.mostGeneral(this.target.universe);
    }
}

class Universe extends Sort {
    constructor(public level: number) {
        super(null);
    }

    public mostGeneral(other: Universe) {
        if (this.level < other.level) {
            return other;
        } else {
            return this;
        }
    }

    protected inferTy(): Sort {
        return this.universe;
    }

    protected inferUniverse(): Universe {
        return new Universe(this.level + 1);
    }
}

type Binding = Constant | Variable;

class Constant {
    constructor(public value: Sort) {}
}

class Variable {
    constructor(public sort: Sort) {}
}

class Scope {
    private parent: Scope | null = null;
    private variables: Map<string, Binding> = new Map();

    constructor() {}

    public get(name: string) {
        return this.variables.get(name);
    }

    public find(name: string): Binding | undefined {
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
