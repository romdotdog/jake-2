export class Program {
    constructor(public fns: Fn[]) {}
}

interface BetaReducible {
    betaReduce(binding: Binding, target: HOTypeB): HOTypeB;
}

export interface Typed<T> {
    get type(): T;
}

export type HOType = Term & Typed<Universe> & BetaReducible;
type HOTypeB = HOType | Binding;
export abstract class Term implements Typed<HOType | undefined> {
    get type(): HOType | undefined {
        return undefined;
    }

    public isPrototypicalType(): this is HOType {
        return this.type instanceof Universe;
    }
}

export abstract class Lazy<T extends HOType> extends Term implements Typed<T> {
    protected abstract inferType(): T;

    constructor(protected cachedType: T | null) {
        super();
    }

    get type(): T {
        if (this.cachedType) return this.cachedType;
        const res = this.inferType();
        this.cachedType = res;
        return res;
    }
}

export class Unreachable extends Lazy<Never> {
    constructor(protected cachedType: Never | null) {
        super(null);
    }

    protected inferType(): Never {
        return new Never();
    }
}

export class Fn extends Lazy<FnType> {
    constructor(public param: HOType, public body: Block) {
        super(null);
    }

    protected inferType(): FnType {
        return new FnType(this.param.type, this.body.type);
    }
}

export class Integer extends Term {
    constructor(private cachedType: IntegerType | undefined, public value: bigint) {
        super();
    }

    public coerceTo<T extends IntegerType>(type: T): this is Typed<T> {
        if (this.cachedType === null) {
            this.cachedType = type;
            return true;
        }
        return false;
    }

    get type(): IntegerType | undefined {
        return this.cachedType;
    }
}

export class Float extends Term {
    constructor(private cachedType: FloatType | undefined, public value: number) {
        super();
    }

    public coerceTo<T extends FloatType>(type: T): this is Typed<T> {
        if (this.cachedType === null) {
            this.cachedType = type;
            return true;
        }
        return false;
    }

    get type(): FloatType | undefined {
        return this.cachedType;
    }
}

export class NumberType extends Lazy<Universe> {
    constructor() {
        super(null);
    }

    protected inferType(): Universe {
        return new Universe(1);
    }

    public betaReduce(binding: Binding, target: HOTypeB): HOTypeB {
        return this;
    }
}

export class IntegerType extends NumberType {}
export class I32 extends IntegerType {}
export class I64 extends IntegerType {}
export class U32 extends IntegerType {}
export class U64 extends IntegerType {}

export class FloatType extends NumberType {}
export class F32 extends FloatType {}
export class F64 extends FloatType {}

export class DefBinding extends Term implements Typed<Universe> {
    public used = false;
    constructor(public hoType: HOType) {
        super();
    }

    get type(): Universe {
        return this.hoType.type;
    }

    public betaReduce(binding: Binding, target: HOTypeB): HOTypeB {
        return new DefBinding(this.hoType.betaReduce(binding, target) as HOType); // TODO: remove cast
    }
}

export class Binding extends Term implements Typed<HOType> {
    constructor(public def: DefBinding) {
        def.used = true;
        super();
    }

    get type(): HOType {
        return this.def.hoType;
    }

    public betaReduce(binding: Binding, target: HOTypeB): HOTypeB {
        if (this.def === binding.def) return target;
        return this;
    }
}

export class FnType extends Lazy<Universe> {
    constructor(public source: HOTypeB, public target: HOType) {
        super(null);
    }

    protected inferType(): Universe {
        let leftUniverse: Universe;
        if (this.source instanceof Binding) {
            leftUniverse = this.source.type.type;
        } else {
            leftUniverse = this.source.type;
        }
        return leftUniverse.mostGeneral(this.target.type);
    }

    public betaReduce(binding: Binding, target: HOTypeB): FnType {
        return new FnType(this.source.betaReduce(binding, target), this.target);
    }
}

type UncertainProduct = Product & { fields: Array<Typed<HOType> | UncertainProduct>; isTermFlag: undefined };
type ProductType = Product & { fields: Array<HOType>; isTermFlag: false } & Typed<Universe>;
type ProductTerm = Product & { fields: Array<Term & Typed<HOType>>; isTermFlag: true };
export class Product extends Term implements Typed<HOType | undefined> {
    private cachedType: HOType | null = null;
    constructor(public fields: Term[], public isTermFlag: boolean | undefined) {
        super();
    }

    private isTerm(): this is ProductTerm {
        return this.isTermFlag === true;
    }

    private isType(): this is ProductType {
        return this.isTermFlag === false;
    }

    private isUncertain(): this is UncertainProduct {
        return this.isTermFlag === undefined;
    }

    public coerceToType(): this is ProductType {
        if (!this.isUncertain()) return false;
        for (const field of this.fields) {
            if (field instanceof Product) {
                if (!field.coerceToType()) throw new Error();
            }
        }
        return true;
    }

    public coerceToTerm(): this is ProductTerm {
        if (!this.isUncertain()) return false;
        for (const field of this.fields) {
            if (field instanceof Product) {
                if (!field.coerceToTerm()) throw new Error();
            }
        }
        return true;
    }

    get type(): HOType | undefined {
        if (this.isTermFlag === undefined) return undefined;
        if (this.cachedType === null) {
            if (this.isTerm()) {
                const prod = new Product(
                    this.fields.map((f: Term & Typed<HOType>) => f.type),
                    false
                );
                if (prod.isType()) {
                    this.cachedType = prod;
                } else {
                    throw new Error();
                }
            } else if (this.isType()) {
                this.cachedType = this.fields.reduce(
                    (acc: Universe, f: HOType) => acc.mostGeneral(f.type),
                    new Universe(1)
                );
            } else {
                throw new Error();
            }
        }
        return this.cachedType;
    }

    public betaReduce(binding: Binding, target: HOTypeB): HOTypeB {
        if (this.isType()) {
            const prod = new Product(
                this.fields.map((v: HOType) => v.betaReduce(binding, target)),
                false
            );
            if (prod.isType()) {
                return prod;
            }
        }
        throw new Error();
    }
}

export class Never extends Lazy<Universe> {
    constructor() {
        super(null);
    }

    protected inferType(): Universe {
        return new Universe(1);
    }

    public betaReduce(binding: Binding, target: HOTypeB): HOTypeB {
        return this;
    }
}

export class Universe extends Lazy<Universe> {
    constructor(public level: number) {
        super(null);
    }

    public infimum() {
        if (this.level <= 1) {
            throw new Error();
        }
        return new Universe(this.level - 1);
    }

    public mostGeneral(other: Universe) {
        return this.level < other.level ? other : this;
    }

    protected inferType(): Universe {
        return new Universe(this.level + 1);
    }

    public betaReduce(binding: Binding, target: HOTypeB): HOTypeB {
        return this;
    }
}

export class Local extends Term {
    constructor(public initializer: Term) {
        super();
    }

    get type() {
        return this.initializer.type;
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
