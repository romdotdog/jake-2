export class Program {
    constructor(public fns: Fn[]) {}
}

export type HOType = Term & Typed<Universe>;
export abstract class Term {
    constructor(public pure: boolean) {}

    get type(): HOType | undefined {
        return undefined;
    }

    public isInferrable(): this is Typed<HOType> {
        return this.type !== undefined;
    }

    public isPrototypicalType(): this is HOType {
        return this.type instanceof Universe;
    }
}

export abstract class Value extends Term {}

export abstract class Typed<T extends HOType> extends Value {
    abstract get type(): T | Constant<T>;
}

export abstract class Lazy<T extends HOType> extends Typed<T> {
    protected abstract inferType(): T;

    constructor(pure: boolean, protected cachedType: T | Constant<T> | null) {
        super(pure);
    }

    get type(): T | Constant<T> {
        if (this.cachedType) return this.cachedType;
        const res = this.inferType();
        this.cachedType = res; // if this.cachedType is null, then I extends T
        return this.cachedType;
    }
}

export class Unreachable<T extends HOType> extends Typed<T> {
    constructor(protected cachedType: T | Constant<T> | (T extends Never ? null : never)) {
        super(true);
    }

    get type(): T | Constant<T> {
        if (this.cachedType) return this.cachedType;
        // if this.cachedType === null, T extends Never
        this.cachedType = new Never() as unknown as T;
        return this.cachedType;
    }
}

export class Fn extends Lazy<FnType> {
    constructor(public param: DefBinding, public body: Block) {
        super(true, null);
    }

    protected inferType(): FnType {
        return new FnType(this.body.pure, this.param.type, this.body.type);
    }
}

export class Integer extends Value {
    constructor(private cachedType: IntegerType | undefined, public value: bigint) {
        super(true);
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

export class Float extends Value {
    constructor(private cachedType: FloatType | undefined, public value: number) {
        super(true);
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
        super(true, null);
    }

    protected inferType(): Universe {
        return new Universe(null, 1);
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

export class DefBinding extends Typed<Universe> {
    private cachedBinding: Binding | null = null;

    constructor(public hoType: HOType) {
        super(true);
    }

    get type(): Universe | Constant<Universe> {
        return this.hoType.type;
    }

    get binding(): Binding {
        if (this.cachedBinding !== null) return this.cachedBinding;
        this.cachedBinding = new Binding(this);
        return this.cachedBinding;
    }
}

export class Binding extends Typed<HOType> {
    public name: string | null = null;

    constructor(public def: DefBinding) {
        super(true);
    }

    get type(): HOType {
        return this.def.hoType;
    }
}

export class FnType extends Lazy<Universe> {
    constructor(public pureFunction: boolean, public source: HOType, public target: HOType) {
        super(true, null);
    }

    protected inferType(): Universe {
        let l = this.source.type;
        while (!(l instanceof Universe)) {
            l = l.type;
        }
        let r = this.target.type;
        while (!(r instanceof Universe)) {
            r = r.type;
        }
        return l.mostGeneral(r);
    }
}

export class Product extends Value {
    constructor(public fields: Term[]) {
        super(fields.every(f => f.pure));
    }
}

export class ProductTerm extends Lazy<ProductType> {
    constructor(cachedType: ProductType | Constant<ProductType> | null, public fields: Typed<HOType>[]) {
        super(
            fields.every(f => f.pure),
            cachedType
        );
    }

    protected inferType(): ProductType {
        return new ProductType(
            null,
            this.fields.map(f => f.type)
        );
    }
}

export class ProductType extends Lazy<Universe> {
    constructor(cachedType: Universe | Constant<Universe> | null, public fields: HOType[]) {
        super(true, cachedType);
    }

    protected inferType(): Universe {
        return new Universe(null, 1);
    }
}

export class Never extends Lazy<Universe> {
    constructor() {
        super(true, null);
    }

    protected inferType(): Universe {
        return new Universe(null, 1);
    }
}

export class Universe extends Lazy<Universe> {
    constructor(protected cachedType: Universe | Constant<Universe> | null, public level: number) {
        super(true, cachedType);
    }

    public mostGeneral(other: Universe) {
        return this.level < other.level ? other : this;
    }

    protected inferType(): Universe {
        return new Universe(null, this.level + 1);
    }
}

export class Local extends Value {
    constructor(public initializer: Term) {
        super(initializer.pure);
    }

    get type() {
        return this.initializer.type;
    }
}

export class Constant<T extends HOType> extends Local {
    constructor(public initializer: T) {
        super(initializer);
    }

    get type(): typeof this.initializer.type {
        return this.initializer.type;
    }
}

export class Block {
    constructor(public body: Statement[], public type: HOType, public pure: boolean) {}

    public static trivial(term: Typed<HOType>): Block {
        return new Block([new Return(term)], term.type, term.pure);
    }
}

export type Statement = InitializeLocal | Return;

export class InitializeLocal {
    constructor(public local: Local) {}
}

export class SideEffect {
    constructor(public term: Term) {}
}

export class Return {
    constructor(public term: Term) {}
}
