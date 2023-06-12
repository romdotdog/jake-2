export class Program {
    constructor(public fns: Fn[]) {}
}

interface Subtyping {
    isSubtypeOf(type: HOType): boolean;
}

function regularizeNominality<T>(type: HOType, f: (type: HOType) => T): T {
    // anonymous can be coerced to nominal
    if (type instanceof Constant) {
        return f(type.initializer);
    }
    // anonymous can be coerced to anonymous
    return f(type);
}

export type HOType = Value<Universe> & Subtyping;
export type HOTConstant<V extends HOType> = Constant<Universe, V>;
export abstract class Term<T extends HOType = HOType> {
    constructor(public pure: boolean) {}

    abstract get type(): T | HOTConstant<T>;

    public abstract coerce(type: HOType): Term | undefined;

    public isInferrable(): this is Value<HOType> {
        return this.type !== undefined;
    }

    public isPrototypicalType(): this is HOType {
        return this.type instanceof Universe;
    }
}

export abstract class Value<T extends HOType> extends Term<T> {}

export abstract class Lazy<T extends HOType> extends Value<T> {
    protected abstract inferType(): T;

    constructor(pure: boolean, protected cachedType: T | HOTConstant<T> | null) {
        super(pure);
    }

    get type(): T | HOTConstant<T> {
        if (this.cachedType) return this.cachedType;
        const res = this.inferType();
        this.cachedType = res;
        return res;
    }
}

export class Unreachable<T extends HOType> extends Value<T> {
    constructor(protected cachedType: T | HOTConstant<T> | (T extends Sum ? null : never)) {
        super(true);
    }

    public static never(): Unreachable<Sum> {
        return new Unreachable<Sum>(null);
    }

    public coerce<T extends HOType>(type: T): Unreachable<T> {
        return new Unreachable(type);
    }

    get type(): T | HOTConstant<T> {
        if (this.cachedType) return this.cachedType;
        // if this.cachedType === null, T extends Sum
        this.cachedType = new Sum(null, []) as unknown as T;
        return this.cachedType;
    }
}

export class Fn extends Lazy<FnType> {
    constructor(cachedType: FnType | HOTConstant<FnType> | null, public param: DefBinding, public body: Block) {
        super(true, cachedType);
    }

    public coerce(type: HOType): Fn | undefined {
        if (this.type.isSubtypeOf(type)) {
            return new Fn(type, this.param, this.body);
        }
    }

    protected inferType(): FnType {
        return new FnType(null, this.body.pure, this.param.type, this.body.type);
    }
}

export class Number extends Value<NumberType> {
    constructor(private cachedType: NumberType | HOTConstant<NumberType>, public value: bigint) {
        super(true);
    }

    public coerce(type: HOType): Number | undefined {
        if (this.type.isSubtypeOf(type)) {
            // TODO(unsoundness): range checks
            this.cachedType = type;
            return this;
        }
    }

    get type(): NumberType | HOTConstant<NumberType> {
        return this.cachedType;
    }
}

export class Float extends Value<FloatType> {
    constructor(private cachedType: FloatType | HOTConstant<FloatType>, public value: number) {
        super(true);
    }

    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type)) {
            // TODO(unsoundness): range checks
            this.cachedType = type;
            return this;
        }
    }

    get type(): FloatType | HOTConstant<FloatType> {
        return this.cachedType;
    }
}

export class NumberType extends Lazy<Universe> {
    constructor(protected cachedType: Universe | HOTConstant<Universe> | null) {
        super(true, cachedType);
    }

    public coerce(type: HOType): Term | undefined {
        throw new Error();
    }

    public isSubtypeOf(type: HOType): type is NumberType | HOTConstant<NumberType> {
        return regularizeNominality(type, type => type instanceof NumberType);
    }

    protected inferType(): Universe {
        return new Universe(null, 0);
    }
}

export class FloatType extends NumberType {
    public coerce(type: HOType): Term | undefined {
        throw new Error();
    }

    public isSubtypeOf(type: HOType): type is FloatType | HOTConstant<FloatType> {
        return regularizeNominality(type, type => type instanceof FloatType);
    }
}

export class I32 extends NumberType {
    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type)) {
            return new I32(type);
        }
    }

    public isSubtypeOf(type: HOType): type is I32 {
        return regularizeNominality(type, type => type instanceof I32);
    }
}

export class I64 extends NumberType {
    public isSubtypeOf(type: HOType): type is I64 {
        return regularizeNominality(type, type => type instanceof I64);
    }
}

export class U32 extends NumberType {
    public isSubtypeOf(type: HOType): type is U32 {
        return regularizeNominality(type, type => type instanceof U32);
    }
}

export class U64 extends NumberType {
    public isSubtypeOf(type: HOType): type is U64 {
        return regularizeNominality(type, type => type instanceof U64);
    }
}

export class F32 extends FloatType {
    public isSubtypeOf(type: HOType): type is F32 {
        return regularizeNominality(type, type => type instanceof F32);
    }
}

export class F64 extends FloatType {
    public isSubtypeOf(type: HOType): type is F64 {
        return regularizeNominality(type, type => type instanceof F64);
    }
}

export class DefBinding extends Value<Universe> {
    private cachedBinding: Binding | null = null;

    constructor(public hoType: HOType) {
        super(true);
    }

    public coerce(type: HOType): Term | undefined {
        // impossible; no term associated with this type
        throw new Error();
    }

    public isSubtypeOf(type: HOType): boolean {
        return this.hoType.isSubtypeOf(type);
    }

    get type(): Universe | HOTConstant<Universe> {
        return this.hoType.type;
    }

    get binding(): Binding {
        if (this.cachedBinding !== null) return this.cachedBinding;
        this.cachedBinding = new Binding(this);
        return this.cachedBinding;
    }
}

export class Binding extends Value<HOType> {
    public name: string | null = null;

    constructor(public def: DefBinding) {
        super(true);
    }

    public coerce(type: HOType): Term | undefined {
        throw new Error();
    }

    public isSubtypeOf(type: HOType): boolean {
        // generics are only subtypes of themselves
        // @ts-ignore
        return this === type;
    }

    get type(): HOType {
        return this.def.hoType;
    }
}

export class FnType extends Lazy<Universe> {
    constructor(
        cachedType: Universe | HOTConstant<Universe> | null,
        public pureFunction: boolean,
        public source: HOType,
        public target: HOType
    ) {
        super(true, cachedType);
    }

    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type)) {
            return new FnType(type, this.pureFunction, this.source, this.target);
        }
    }

    public isSubtypeOf(type: HOType): type is FnType {
        return regularizeNominality(type, type => {
            if (type instanceof FnType) {
                if (type.pure && !this.pure) return false;
                // contravariant in the argument, covariant in the return
                return type.source.isSubtypeOf(this.source) && this.target.isSubtypeOf(this.target);
            }
            return false;
        });
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

function fieldsAssignable(source: HOType[], target: HOType[]) {
    if (source.length < target.length) return false;
    for (let i = 0; i < target.length; i++) {
        if (!source[i].isSubtypeOf(target[i])) {
            return false;
        }
    }
    return true;
}

// either [...] (type) or *
export class AmbiguousProductType extends Lazy<Universe> {
    constructor(public fields: HOType[]) {
        super(true, null);
    }

    public isSubtypeOf(type: HOType): boolean {
        return regularizeNominality(type, type => {
            if (type instanceof Universe) {
                return true;
            } else if (type instanceof Product) {
                return fieldsAssignable(this.fields, type.fields as HOType[]);
            }
            return false;
        });
    }

    public coerce(type: HOType): Term | undefined {
        throw new Error();
    }

    protected inferType(): Universe {
        return new Universe(null, 1);
    }
}

type ProductTypes = AmbiguousProductType | Product<Universe> | Universe;
export class Product<T extends ProductTypes> extends Value<T> {
    private cachedType: T | HOTConstant<T>;

    constructor(
        cachedType: T | HOTConstant<T> | (AmbiguousProductType | Product<Universe> extends T ? null : never),
        public fields: Term[]
    ) {
        super(fields.every(f => f.pure));
        if (cachedType === null) {
            const types = fields.map(f => f.type);
            if (fields.every(f => f.isPrototypicalType())) {
                // since cachedType is null, AmbiguousProductType must extend T
                this.cachedType = new AmbiguousProductType(types) as T;
            } else {
                // since cachedType is null, Product<Universe> must extend T
                this.cachedType = new Product(null, types) as T;
            }
        } else {
            this.cachedType = cachedType;
        }
    }

    public isSubtypeOf(type: HOType): boolean {
        if (!this.isPrototypicalType) return false;
        return regularizeNominality(type, type => {
            if (type instanceof Product) {
                return fieldsAssignable(this.fields as HOType[], type.fields as HOType[]);
            }
            return false;
        });
    }

    public coerce(type: HOType): Term | undefined {
        return regularizeNominality(type, unwrappedType => {
            if (unwrappedType instanceof Product && this.type.isSubtypeOf(unwrappedType)) {
                return new Product(type as Product<Universe> | HOTConstant<Product<Universe>>, this.fields);
            } else if (unwrappedType instanceof Universe && this.type.isSubtypeOf(unwrappedType)) {
                return new Product(type as Universe | HOTConstant<Universe>, this.fields);
            }
        });
    }

    get type(): T | HOTConstant<T> {
        return this.cachedType;
    }
}

export class Sum extends Lazy<Universe> {
    constructor(protected cachedType: Universe | HOTConstant<Universe> | null, public summands: HOType[]) {
        super(true, cachedType);
    }

    public static never(): Sum {
        return new Sum(null, []);
    }

    public static create(cachedType: Universe | HOTConstant<Universe> | null, summands: HOType[]): HOType {
        const sum = new Sum(cachedType, summands);
        return sum.updateRedundancy();
    }

    public add(types: HOType[]): HOType {
        this.summands.push(...types);
        return this.updateRedundancy();
    }

    private updateRedundancy(): HOType {
        for (let i = 0; i < this.summands.length; ) {
            const summand = this.summands[i];
            if (summand instanceof Sum) {
                this.summands.splice(i, 1, ...summand.summands);
            } else {
                i += 1;
            }
        }

        for (let i = 0; i < this.summands.length; ) {
            const summand = this.summands[i];
            let isRedundant = false;
            for (const otherSummand of this.summands) {
                if (summand.isSubtypeOf(otherSummand)) {
                    isRedundant = true;
                    break;
                }
            }
            if (isRedundant) {
                this.summands.splice(i, 1);
            } else {
                i += 1;
            }
        }

        if (this.summands.length === 1) {
            return this.summands[0];
        } else {
            return this;
        }
    }

    public coerce(type: HOType): Term<HOType> | undefined {
        if (this.type.isSubtypeOf(type)) {
            return Sum.create(type, this.summands);
        }
    }

    public isSubtypeOf(type: HOType): boolean {
        return regularizeNominality(type, type => {
            return this.summands.every(s => s.isSubtypeOf(type));
        });
    }

    protected inferType(): Universe {
        return new Universe(null, 0);
    }
}

export class Universe extends Lazy<Universe> {
    constructor(protected cachedType: Universe | HOTConstant<Universe> | null, public level: number) {
        super(true, cachedType);
    }

    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type)) {
            return new Universe(type, this.level);
        }
    }

    public isSubtypeOf(type: HOType): type is Universe | HOTConstant<Universe> {
        return regularizeNominality(type, type => {
            return type instanceof Universe && type.level >= this.level;
        });
    }

    public mostGeneral(other: Universe) {
        return this.level < other.level ? other : this;
    }

    protected inferType(): Universe {
        return new Universe(null, this.level + 1);
    }
}

export class Phi<T extends HOType = HOType> extends Term<T> {
    cachedType: T | HOTConstant<T>;
    constructor(
        pure: boolean,
        cachedType: T | HOTConstant<T> | (Sum extends T ? null : never),
        public locals: Local<T>[]
    ) {
        super(pure);
        locals = locals.flatMap(l => (l.initializer instanceof Phi ? l.initializer.locals : l));
        if (cachedType === null) {
            // Sum extends T
            this.cachedType = Sum.create(
                null,
                locals.map(l => l.type)
            ) as T;
        } else {
            this.cachedType = cachedType;
        }
    }

    public coerce(type: HOType): Term<HOType> | undefined {
        const newLocals = [];
        for (const local of this.locals) {
            const coercion = local.coerce(type);
            if (coercion === undefined) return undefined;
            newLocals.push(coercion);
        }
        return new Phi(this.pure, type, newLocals);
    }

    get type(): T | HOTConstant<T> {
        return this.locals[0].type;
    }
}

export class Local<T extends HOType = HOType> extends Value<T> {
    constructor(public initializer: Term<T>) {
        super(initializer.pure);
    }

    public coerce(type: HOType): Local | undefined {
        const inner = this.initializer.coerce(type);
        if (inner !== undefined) {
            return new Local(inner);
        }
    }

    get type() {
        return this.initializer.type;
    }
}

export class Constant<T extends HOType, V extends Value<T>> extends Local<T> {
    constructor(public initializer: V) {
        super(initializer);
    }

    public coerce(type: HOType): Constant<HOType, Value<HOType>> | undefined {
        const inner = this.initializer.coerce(type);
        if (inner !== undefined) {
            return new Constant(inner);
        }
    }

    public isSubtypeOf(type: HOType): type is T extends Universe ? Constant<T, V> : HOType {
        // nominal types can only be subtypes of themselves
        // @ts-ignore
        return this === type;
    }

    get type(): T | HOTConstant<T> {
        return this.initializer.type;
    }
}

export class Block extends Value<HOType> {
    constructor(public branch: Branch, protected cachedType: HOType | HOTConstant<HOType>) {
        super(branch.pure);
    }

    public coerce(type: HOType): Term<HOType> | undefined {
        if (this.type.isSubtypeOf(type)) {
            return new Block(this.branch, type);
        }
    }

    get type(): HOType | HOTConstant<HOType> {
        return this.cachedType;
    }

    public static trivial(term: Value<HOType>): Block {
        return new Block(new Branch(term.pure, [new Return(term)]), term.type);
    }
}

export class Branch {
    constructor(public pure: boolean, public body: Statement[]) {}
}

export type Statement = InitializeLocal | Return | SideEffect | If;

export class InitializeLocal {
    constructor(public local: Local) {}
}

export class SideEffect {
    constructor(public term: Term & { pure: false }) {}
}

export class If {
    constructor(public cond: Term, public t: Branch, public f: Branch) {}
}

export class Return {
    constructor(public term: Term) {}
}
