export class Program {
    constructor(public fns: Fn[]) {}
}

interface Subtyping {
    isSubtypeOf(type: HOType, ctx: UnificationContext): boolean;
    isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean;
}

export type UnificationContext = Map<DefBinding, HOType>;
export type BetaReductionContext = Map<DefBinding, DefBinding>;

function assert(cond: boolean) {
    if (!cond) throw new Error();
}

export type HOType = Omit<Value, 'betaReduce'> & Subtyping & { betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): HOType };
export abstract class Term {
    constructor(public pure: boolean) {}

    public abstract get type(): HOType;

    public abstract coerce(type: HOType): Term | undefined;

    public abstract betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): Term;
}

export abstract class Value extends Term {}

export abstract class Lazy extends Value {
    protected abstract inferType(): HOType;

    constructor(pure: boolean, protected cachedType?: HOType) {
        super(pure);
    }

    get type(): HOType {
        if (this.cachedType !== undefined) return this.cachedType;
        this.cachedType = this.inferType();
        return this.cachedType;
    }
}

export class Universe extends Lazy {
    constructor(public level: number, protected cachedType?: HOType) {
        super(true, cachedType);
    }

    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type, new Map())) {
            return new Universe(this.level, type);
        }
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        return false;
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if(type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof Universe && type.level >= this.level;
    }

    public mostGeneral(other: Universe) {
        return this.level < other.level ? other : this;
    }

    protected inferType(): Universe {
        return new Universe(this.level + 1);
    }

    public betaReduce(def: DefBinding, sub: Term): HOType {
        return this;
    }
}

const kind = new Universe(0);
export function isKind(x: HOType): boolean {
    return kind.isSubtypeOf(x, new Map());
}

export function isType(x: Term): x is HOType {
    return isKind(x.type);
}

export class Unreachable extends Value {
    constructor(protected cachedType?: HOType) {
        super(true);
    }

    public static never(): Unreachable {
        return new Unreachable();
    }

    public coerce(type: HOType): Unreachable {
        return new Unreachable(type);
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        return true;
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        return true;
    }

    public betaReduce(def: DefBinding, sub: Term): HOType {
        return this;
    }

    get type(): HOType {
        if (this.cachedType) return this.cachedType;
        // if this.cachedType === null, T extends Sum
        this.cachedType = new Sum([]);
        return this.cachedType;
    }
}

export class Fn extends Lazy {
    constructor(public param: DefBinding, public body: Block, cachedType?: HOType) {
        super(true, cachedType);
    }

    public coerce(type: HOType): Fn | undefined {
        if (this.type.isSubtypeOf(type, new Map())) {
            return new Fn(this.param, this.body, type);
        }
    }

    public betaReduce(def: DefBinding, sub: Term): Term {
        return this;
    }

    public isType(): false {
        return false;
    }

    protected inferType(): FnType {
        return new FnType(this.body.branch.pure, this.param, this.body.type);
    }
}

export class Number extends Value {
    constructor(private cachedType: HOType, public value: bigint) {
        super(true);
    }

    public coerce(type: HOType): Number | undefined {
        if (this.type.isSubtypeOf(type, new Map())) {
            // TODO(unsoundness): range checks
            this.cachedType = type;
            return this;
        }
    }

    public betaReduce(def: DefBinding, sub: Term): Term {
        return this;
    }

    get type(): HOType {
        return this.cachedType;
    }
}

export class Float extends Value {
    constructor(private cachedType: HOType, public value: number) {
        super(true);
    }

    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type, new Map())) {
            // TODO(unsoundness): range checks
            this.cachedType = type;
            return this;
        }
    }

    public betaReduce(def: DefBinding, sub: Term): Term {
        return this;
    }

    get type(): HOType {
        return this.cachedType;
    }
}

export class NumberType extends Lazy {
    constructor(protected cachedType?: HOType) {
        super(true, cachedType);
    }

    public coerce(type: HOType): Term | undefined {
        throw new Error();
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        return false;
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof NumberType;
    }

    public betaReduce(def: DefBinding, sub: Term): HOType {
        return this;
    }

    protected inferType(): Universe {
        return new Universe(0);
    }
}

export class FloatType extends NumberType {
    public coerce(type: HOType): Term | undefined {
        throw new Error();
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof FloatType;
    }
}

export class I32 extends NumberType {
    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type, new Map())) {
            return new I32(type);
        }
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof I32;
    }
}

export class I64 extends NumberType {
    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof I64;
    }
}

export class U32 extends NumberType {
    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof U32;
    }
}

export class U64 extends NumberType {
    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof U64;
    }
}

export class F32 extends FloatType {
    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof F32;
    }
}

export class F64 extends FloatType {
    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return type instanceof F64;
    }
}

export class DefBinding extends Value {
    private cachedBinding?: Binding;
    public inferrable?: boolean;
    public name?: string;

    constructor(public hoType: HOType) {
        super(true);
    }

    public markInferrable() {
        this.inferrable = this.cachedBinding !== undefined;
    }

    public coerce(type: HOType): Term | undefined {
        // impossible; no term associated with this type
        throw new Error();
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        return type.isSubtypeOf(this.hoType, ctx);
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx) || this.hoType.isSubtypeOf(type, ctx)) {
            ctx.set(this, type);
            return true;
        }
        return false;
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): HOType {
        const newDefBinding = new DefBinding(this.hoType.betaReduce(def, sub, ctx));
        newDefBinding.inferrable = this.inferrable;
        newDefBinding.name = this.name;
        ctx.set(this, newDefBinding);
        return newDefBinding;
    }

    get type(): HOType {
        return this.hoType.type;
    }

    get binding(): Binding {
        if (this.cachedBinding !== undefined) return this.cachedBinding;
        this.cachedBinding = new Binding(this);
        return this.cachedBinding;
    }
}

export class Binding extends Value {
    constructor(public def: DefBinding) {
        super(true);
    }

    public coerce(type: HOType): Term | undefined {
        throw new Error();
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        // two cases:
        // A <: *B*, where A: C and B: C and ctx.get(A.def) = B.def
        // u32 <: *A*, where A: *
        if (type.type.isSubtypeOf(this.type, ctx)) {
            if (type instanceof Binding) {
                const existingSub = ctx.get(type.def);
                if (existingSub === this.def) {
                    return true;
                }
            } else {
                const existingSub = ctx.get(this.def);
                if (existingSub) {
                    return type.isSubtypeOf(existingSub, ctx);
                } else {
                    ctx.set(this.def, type);
                    return true;
                }
            }
        }
        return false;
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;

        // *A* <: u32
        // if A is free, then assign A to u32
        if (this.type.isSubtypeOf(type.type, ctx)) {
            const existingSub = ctx.get(this.def);
            if (existingSub) {
                return existingSub.isSubtypeOf(type, ctx);
            } else {
                ctx.set(this.def, type);
                return true;
            }
        }

        // generics are only subtypes of themselves
        // @ts-ignore
        return this === type;
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): HOType {
        if (this.def === def) {
            return sub as HOType;
        }
        return ctx.get(this.def)?.binding ?? this;
    }

    get type(): HOType {
        return this.def.hoType;
    }
}

export class FnType extends Lazy {
    constructor(
        public pureFunction: boolean,
        public source: HOType,
        public target: HOType,
        cachedType?: HOType,
    ) {
        super(true, cachedType);
    }

    public infer(): FnType | undefined {
        if (this.source instanceof DefBinding && this.source.inferrable === true) {
            return this.target as FnType;
        }
    }

    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type, new Map())) {
            return new FnType(this.pureFunction, this.source, this.target, type);
        }
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        return false;
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        if (type instanceof FnType) {
            if (type.pure && !this.pure) return false;
            // contravariant in the argument, covariant in the return
            return type.source.isSubtypeOf(this.source, ctx) && this.target.isSubtypeOf(type.target, ctx);
        }
        return false;
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): HOType {
        return new FnType(this.pureFunction, this.source.betaReduce(def, sub, ctx), this.target.betaReduce(def, sub, ctx), this.cachedType);
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

function fieldsAssignable(source: HOType[], target: HOType[], ctx: UnificationContext) {
    if (source.length < target.length) return false;
    for (let i = 0; i < target.length; i++) {
        if (!source[i].isSubtypeOf(target[i], ctx)) {
            return false;
        }
    }
    return true;
}

// either [...] (type) or *
export class AmbiguousProductType extends Lazy {
    constructor(public fields: HOType[]) {
        super(true);
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        if (type instanceof Universe) {
            return type.level === 0;
        }
        return false;
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        if (type instanceof Universe) {
            return true;
        } else if (type instanceof Product) {
            return fieldsAssignable(this.fields, type.fields as HOType[], ctx);
        }
        return false;
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): HOType {
        throw new Error();
    }

    public coerce(type: HOType): Term | undefined {
        throw new Error();
    }

    protected inferType(): Universe {
        return new Universe(1);
    }
}

export class Product extends Value {
    private cachedType: HOType;

    constructor(        
        public fields: Term[],
        cachedType?: HOType,
    ) {
        super(fields.every(f => f.pure));
        if (cachedType === undefined) {
            const types = fields.map(f => f.type);
            if (fields.every(f => isType(f))) {
                this.cachedType = new AmbiguousProductType(types);
            } else {
                this.cachedType = new Product(types);
            }
        } else {
            this.cachedType = cachedType;
        }
    }

    public static unit() {
        return new Product([], Product.void());
    }

    public static void() {
        return new Product([], new Universe(0));
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {        
        return false;
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (!isType(this)) return false;
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        if (type instanceof Product) {
            return fieldsAssignable(this.fields as HOType[], type.fields as HOType[], ctx);
        }
        return false;
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): HOType {
        return new Product(this.fields.map(f => f.betaReduce(def, sub, ctx)), this.cachedType);
    }

    public coerce(type: HOType): Term | undefined {
        // TODO: fix
        if (this.type.isSubtypeOf(type, new Map())) {
            return new Product(this.fields, type);
        }
    }

    get type(): HOType {
        return this.cachedType;
    }
}

export class Sum extends Lazy {
    constructor(public summands: HOType[], protected cachedType?: HOType) {
        super(true, cachedType);
    }

    public static isNever(type: HOType) {
        return type instanceof Sum && type.summands.length === 0;
    }

    public static never(): Sum {
        return new Sum([]);
    }

    public static create(summands: HOType[], cachedType?: HOType): HOType {
        summands = summands.slice();

        for (let i = 0; i < summands.length; ) {
            const summand = summands[i];
            if (summand instanceof Sum) {
                summands.splice(i, 1, ...summand.summands);
            } else {
                i += 1;
            }
        }

        for (let i = 0; i < summands.length; ) {
            const summand = summands[i];
            let isRedundant = false;
            for (const otherSummand of summands) {
                if (summand.isSubtypeOf(otherSummand, new Map())) {
                    isRedundant = true;
                    break;
                }
            }
            if (isRedundant) {
                summands.splice(i, 1);
            } else {
                i += 1;
            }
        }

        if (summands.length === 1) {
            return summands[0];
        } else {
            return new Sum(summands, cachedType)
        }
    }


    public coerce(type: HOType): Term | undefined {
        if (this.type.isSubtypeOf(type, new Map())) {
            return Sum.create(this.summands, type);
        }
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        return this.summands.some(s => type.isSubtypeOf(s, ctx));
    }

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if (type.isSupertypeOfOnly(this, ctx)) return true;
        return this.summands.every(s => s.isSubtypeOf(type, ctx));
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): HOType {
        return new Sum(this.summands.map(s => s.betaReduce(def, sub, ctx)), this.cachedType);
    }

    protected inferType(): HOType {
        return Sum.create(this.summands.map(s => s.type));
    }
}


export class Phi extends Term {
    cachedType: HOType;
    constructor(
        pure: boolean,
        public locals: Local[],
        cachedType?: HOType,
    ) {
        super(pure);
        locals = locals.flatMap(l => (l.initializer instanceof Phi ? l.initializer.locals : l)); // probably won't work
        if (cachedType === undefined) {
            // Sum extends T
            this.cachedType = Sum.create(
                locals.map(l => l.type)
            );
        } else {
            this.cachedType = cachedType;
        }
    }

    public coerce(type: HOType): Term | undefined {
        const newLocals = [];
        for (const local of this.locals) {
            const coercion = local.coerce(type);
            if (coercion === undefined) return undefined;
            newLocals.push(coercion);
        }
        return new Phi(this.pure, newLocals, type);
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): Term {
        return this;
    }

    get type(): HOType {
        return this.cachedType;
    }
}

export class Call extends Lazy {
    private underlyingFnType: FnType;
    constructor(public fn: Term, public argument: Term, cachedType?: HOType) {
        let underlyingFnType: FnType;
        if (fn.type instanceof FnType) {
            underlyingFnType = fn.type;
        } else if (fn.type instanceof Constant && fn.type.initializer instanceof FnType) {
            underlyingFnType = fn.type.initializer;
        } else {
            throw new Error();
        }
        super(underlyingFnType.pureFunction, cachedType);
        this.underlyingFnType = underlyingFnType;
    }

    public coerce(type: HOType): Term | undefined {
        const newFn = this.fn.coerce(new FnType(this.underlyingFnType.pureFunction, this.underlyingFnType.source, type));
        if (newFn !== undefined) {
            return new Call(newFn, this.argument, type);
        }
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): Term {
        return this;
    }

    protected inferType(): HOType {
        if (this.underlyingFnType.source instanceof DefBinding) {
            return this.underlyingFnType.target.betaReduce(this.underlyingFnType.source, this.argument, new Map());
        }
        return this.underlyingFnType.target;
    }
}

export class Local extends Value {
    constructor(public initializer: Term) {
        super(initializer.pure);
    }

    public coerce(type: HOType): Local | undefined {
        const inner = this.initializer.coerce(type);
        if (inner !== undefined) {
            return new Local(inner);
        }
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): Term {
        return this;
    }

    get type() {
        return this.initializer.type;
    }
}

export class Constant<V extends Value> extends Local {
    constructor(public initializer: V) {
        super(initializer);
    }

    public coerce(type: HOType): Constant<Value> | undefined {
        const inner = this.initializer.coerce(type);
        if (inner !== undefined) {
            return new Constant(inner);
        }
    }

    public isSupertypeOfOnly(type: HOType, ctx: UnificationContext): boolean {
        return isType(this.initializer) && type.isSubtypeOf(this.initializer, ctx);
    }        

    public isSubtypeOf(type: HOType, ctx: UnificationContext): boolean {
        if(type.isSupertypeOfOnly(this, ctx)) return true;
        // nominal types can only be subtypes of themselves
        // @ts-ignore
        return this === type;
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): HOType {
        return this;
    }

    get type(): HOType {
        return this.initializer.type;
    }
}

export class Block extends Value {
    constructor(public branch: Branch, protected cachedType: HOType) {
        super(branch.pure);
    }

    public coerce(type: HOType): Block | undefined {
        if (this.type.isSubtypeOf(type, new Map())) {
            return new Block(this.branch, type);
        }
    }

    get type(): HOType {
        return this.cachedType;
    }

    public betaReduce(def: DefBinding, sub: Term, ctx: BetaReductionContext): Term {
        return this;
    }

    public static trivial(term: Value): Block {
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
