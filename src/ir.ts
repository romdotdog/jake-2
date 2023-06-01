export class Program {
    constructor(public fns: Fn[]) {}
}

export abstract class Term {
    private cachedUniverse: Universe | null = null;
    constructor(private cachedType: HOType | null) {}

    protected abstract inferType(): HOType;
    protected abstract inferUniverse(): Universe;

    get type(): HOType {
        if (this.cachedType) return this.cachedType;
        this.cachedType = this.inferType();
        return this.cachedType;
    }

    get universe(): Universe {
        if (this.cachedUniverse) return this.cachedUniverse;
        this.cachedUniverse = this.inferUniverse();
        return this.cachedUniverse;
    }
}

export class Fn extends Term {
    constructor(public param: HOType, public body: Block) {
        super(null);
    }

    protected inferType(): HOType {
        return new FnType(this.param.type, this.body.type);
    }

    protected inferUniverse(): Universe {
        return new Universe(0);
    }
}

export class Integer extends Term {
    constructor(type: HOType, public value: bigint) {
        super(type);
    }

    protected inferType(): HOType {
        return this.universe;
    }

    protected inferUniverse(): Universe {
        return new Universe(0);
    }
}

export class Float extends Term {
    constructor(type: HOType, public value: number) {
        super(type);
    }

    protected inferType(): HOType {
        return this.universe;
    }

    protected inferUniverse(): Universe {
        return new Universe(0);
    }
}

export abstract class HOType extends Term {
    constructor(cachedType: HOType | null) {
        super(cachedType);
    }

    public abstract betaReduce(binding: Binding, target: HOType): HOType;
}

export class Binding extends HOType {
    constructor(private hoType: HOType) {
        super(hoType);
    }

    protected inferType(): HOType {
        return this.hoType;
    }

    protected inferUniverse(): Universe {
        return this.hoType.universe.infimum();
    }

    public betaReduce(binding: Binding, target: HOType): HOType {
        if (this === binding) return target;
        return this;
    }
}

export class FnType extends HOType {
    constructor(public source: HOType, public target: HOType) {
        super(null);
    }

    protected inferType(): HOType {
        return this.universe;
    }

    protected inferUniverse(): Universe {
        return this.source.universe.mostGeneral(this.target.universe);
    }

    public betaReduce(binding: Binding, target: HOType): FnType {
        return new FnType(this.source.betaReduce(binding, target), this.target.betaReduce(binding, target));
    }
}

export class Product extends HOType {
    constructor(public fields: HOType[]) {
        super(null);
    }

    protected inferType(): HOType {
        return this.universe;
    }

    protected inferUniverse(): Universe {
        return this.fields.reduce<Universe>((acc, v) => acc.mostGeneral(v.universe), this.fields[0].universe);
    }

    public betaReduce(binding: Binding, target: HOType): HOType {
        return new Product(this.fields.map(v => v.betaReduce(binding, target)));
    }
}

export class Universe extends HOType {
    constructor(public level: number) {
        super(null);
    }

    public infimum() {
        if (this.level === 0) {
            throw new Error();
        }
        return new Universe(this.level - 1);
    }

    public mostGeneral(other: Universe) {
        return this.level < other.level ? other : this;
    }

    protected inferType(): HOType {
        return this.universe;
    }

    protected inferUniverse(): Universe {
        return new Universe(this.level + 1);
    }

    public betaReduce(binding: Binding, target: HOType): this {
        return this;
    }
}

export class Local extends Term {
    constructor(public initializer: Term) {
        super(initializer.type);
    }

    protected inferType(): HOType {
        return this.initializer.type;
    }

    protected inferUniverse(): Universe {
        return this.initializer.type.universe.infimum();
    }
}

export class Block {
    constructor(public body: Statement[], public type: HOType) {}
}

export type Statement = InitializeLocal | Return;

export class InitializeLocal {
    constructor(public local: Local) {}
}

export class Return {
    constructor(public term: Term) {}
}
