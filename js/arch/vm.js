
const WELCOME = "Welcome back to basic!"
const VERSION = "Rebasic Version 0.1"
const READY  = "Ready..."

const COMMAND   = 1
const LET       = 2
const DIM       = 3
const MAP       = 4
const IF        = 5
const FOR       = 6
const NEXT      = 7
const RETURN    = 8
const END       = 9
const LET_EL    = 10
const READ      = 11

function vmPrint() {
    for (let i = 0; i < arguments.length; i++) {
        console.log(arguments[i])
    }
}

function vmInput() {
    for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i]

        if (typeof v === 'object' && v.id) {
            this.assign(v.id, 'not defined')
        } else {
            console.log(v)
        }
    }
}

const util = {
    isNumber: function(n) {
        return (typeof n === 'number' && !Number.isNaN(n))
    },
    expectNumber: function(n) {
        if (typeof n !== 'number'
                || Number.isNaN(n)) {
            throw `Number is expected: [${n}]`
        }
    },
    expectInteger: function(n) {
        if (typeof n !== 'number'
                || Number.isNaN(n)
                || !Number.isInteger(n)) {
            throw `Integer is expected: [${n}]`
        }
    },
    expectString: function(s) {
        if (typeof s === 'string') {
            throw `String is expected: [${s}]`
        }
    },
}

class Block {
    constructor() {
        this.code = []
    }

    push(op) {
        this.code.push(op)
    }

    length() {
        return this.code.length
    }
}

class Dim {

    constructor(name, rval) {
        this.name  = name
        this.sizes = []
        if (rval.list) {
            // multi-dimensional
            for (let i = 0; i < rval.list.length; i++) {
                const rv = rval.list[i]
                this.sizes.push( rv.get() )
            }
        } else {
            // assume one-dimension
            this.sizes.push( rval.get() )
        }
        this.dim = this.sizes.length

        let len = this.sizes[0] || -1
        for (let i = 1; i < this.sizes.length; i++) {
            len *= this.sizes[i]
        }
        this.len = len

        // setup values
        this.data = []
        for (let i = 0; i < len; i++) {
            this.data[i] = 0
        }

        //console.log(this.dim + ': ' + this.len)
        //console.dir(this.sizes)
    }

    get(at) {
        if (this.dim > 1) {
            // multi-dimentional array
            if (!Array.isArray(at) || this.dim !== at.length) {
                throw `index list of ${this.dim} elements is expected`
            }

            let j = 0
            for (let i = 0; i < at.length - 1; i++) {
                j += (at[i] - 1) * this.sizes[i]
            }

            j += at[at.length - 1]
            return this.data[j]

        } else {
            // one-dimentional array
            if (!util.isNumber(at)) throw `array index is expected`
            return this.data[at]
        }
    }

    set(at, val) {
        if (this.dim > 1) {
            // multi-dimentional array
            if (!Array.isArray(at) || this.dim !== at.length) {
                throw `index list of ${this.dim} elements is expected`
            }

            let j = 0
            for (let i = 0; i < at.length - 1; i++) {
                j += (at[i] - 1) * this.sizes[i]
            }

            j += at[at.length - 1]

            this.data[j] = val

        } else {
            // one-dimentional array
            if (!util.isNumber(at)) throw `array index is expected`
            this.data[at] = val
        }
    }

    toString() {
        return '[0, 0, 0...]'
    }
}

class Map {
    
    constructor(name) {
        this.name = name
        this.data = {}
    }

    get(key) {
        if (!key) throw `a map key is expected`
        return this.data[key] || -1
    }

    set(key, val) {
        if (!key) throw `a map key is expected`
        if (!val) throw `a value is expected`
        this.data[key] = val
    }

    toString() {
        return '{...}'
    }
}

class VM {

    constructor() {
        // export statement type constants
        this.COMMAND   = COMMAND
        this.LET       = LET
        this.DIM       = DIM
        this.MAP       = MAP
        this.IF        = IF
        this.FOR       = FOR
        this.NEXT      = NEXT
        this.RETURN    = RETURN
        this.END       = END
        this.LET_EL    = LET_EL
        this.READ      = READ
        // export classes
        this.Dim = Dim
        this.Map = Map

        this.MAX_CYCLES = 10000
        this.MAX_OUTPUTS = 10
        this.lastLine = 0
        this.ram = []
        this.lines = []

        this.label = {}
        this.command = {
            'goto': true,
            'gosub': true,
            'read': true,
            'restore': true,
            'print': vmPrint,
            'input': vmInput,
        }
        this.fun = {}
        this.scope = {}
        this.constant = {}

        this.pos = 0
        this.cycles = 0
        this.outputs = 0
        this.bstack = []
        this.rstack = []
        this.data = []
        this.dataPos = 0
        this.interrupted = false
        this.skipLookup = false
        this.util = util

        const vm = this
        this.inputHandler = function(cmd) {

            if (vm.interrupted && vm.resumeOnInput) {
                // vm waits for input
                vm.assign(vm.inputTarget, cmd)
                vm.interrupted = false
                vm.resume()

            } else {
                vm.processCommand(cmd)
            }
        }

        this.resume = function() {
            // main vm execution cycle
            // execute current command sequence in a loop
            // interrupt and reschedule on outputs or cycles limit
            while(!vm.interrupted && vm.pos < vm.code.length) {
                vm.next(vm.code[vm.pos ++])

                if (vm.outputs > vm.MAX_OUTPUTS) {
                    vm.outputs = 0
                    setTimeout(vm.resume, 0)
                    return
                }
                if (vm.cycles > vm.MAX_CYCLES) {
                    vm.cycles = 0
                    setTimeout(vm.resume, 0)
                    return
                }
            }

            if (!vm.interrupted && !vm.loop) {
                vm.command.close()
            }
        }
    }

    placeLine(line, numberedOnly) {
        // check autonumber
        const dot = line.startsWith('.')
        // check line number
        let ln = parseInt(line)
        const number = !isNaN(ln)

        if (!dot && !number && numberedOnly) return false

        let cmdLine = line
        if (dot) {
            this.lastLine += 10
            ln = this.lastLine
            line = line.substring(1)
            line = ln + ' ' + line
        } else if (number) {
            const i = line.indexOf(' ')
            if (i >= 0) {
                cmdLine = line.substring(i+1).trim()
            } else {
                cmdLine = false
            }

            if (ln > this.lastLine) {
                this.lastLine = ln
            }
        } else {
            this.lastLine ++
            ln = this.lastLine
        }
        if (!cmdLine) this.lines[ln] = false // clear the line
        else this.lines[ln] = line

        return true
    }

    processCommand(cmd) {
        if (!cmd) return
        try {
            const placed = this.placeLine(cmd, true)

            if (!placed) {
                const lex = this.lexFromSource(
                        cmd, this.command.print)
                const code = this.parse(this, lex)
                this.run(code, 0)
            }

        } catch (e) {
            this.command.print('error: ' + e)
            if (this.opt.debug) {
                const stack = new Error().stack
                this.command.print(stack)
            }
            if (this.exitOnError) {
                process.exit(1)
            }
        }
    }

    markLabel(name, block, pos) {
        this.label[name] = {
            block: block,
            pos: pos,
        }
        //console.log(`${name}: #${pos}`)
    }

    val(v) {
        if (!v) return 'NIL'
        if (!v.get) {
            console.dir(v)
            throw 'wrong value!'
        }
        return v.get()
    }

    store(val) {
        this.data.push(val)
    }

    read(name) {
        console.dir(name)
        if (this.dataPos >= this.data.length) {
            throw 'no data left to read'
        }
        this.assign(name, this.data[this.dataPos++])
    }

    defineFun(name, fn) {
        this.fun[name] = fn
    }

    defineCmd(name, fn) {
        this.command[name] = fn
    }

    defineConst(name, val) {
        // handle possible number values
        if (!name.endsWith('$')) {
            const n = parseFloat(val)
            if (!isNaN(n)) val = n
        }
        this.scope[name] = val
        this.constant[name] = val
    }

    assign(name, val) {
        // handle possible number values
        if (!name.endsWith('$')) {
            const n = parseFloat(val)
            if (!isNaN(n)) val = n
        }
        this.scope[name] = val
    }

    load(name) {
        if (this.skipLookup) return { id: name }
        let val = this.scope[name]
        if (val === undefined) {
            throw `unknown identifier [${name}]`
        }
        return val
    }

    probe(name) {
        return this.scope[name]
    }

    locate(name) {
        if (this.skipLookup) return { id: name }
        // check variables
        let val = this.scope[name]
        if (val === undefined) {
            // check labels
            val = this.label[name]
            if (val) return name

            throw `unknown identifier [${name}]`
        }
        return val
    }

    locateElement(name, rval) {
        const variable = this.locate(name)
        if (!variable) throw `unknown structure [${name}]`

        if (!variable.get) {
            console.dir(variable)
            throw `can't locate element of [${name}]`
        }
        
        return variable.get( this.val(rval) )
    }

    assignElement(name, key, rval) {
        const variable = this.locate(name)
        if (!variable) throw `unknown structure [${name}]`

        variable.set( key.get(), rval.get() )
    }

    call(name, expr) {
        const v = this.val(expr)
        //console.log('calling ' + name + '(' + v + ')')
        const fn = this.fun[name]
        if (!fn) throw `unknown function ${name}()`

        if (Array.isArray(v)) {
            return fn.apply(this, v)
        } else {
            return fn.call(this, v)
        }
    }

    next(stmt) {
        if (!stmt) return
        this.cycles ++

        //console.log(stmt.toString())
        switch(stmt.type) {
            case COMMAND:
                // command
                const cmd = this.command[stmt.val]
                if (!cmd) throw `Unknown command [${stmt.val}]`

                // calculate param set
                let val
                if (stmt.opt) {
                    if (stmt.immediate) {
                        this.skipLookup = true
                        val = stmt.opt.get()
                        this.skipLookup = false
                    } else {
                        val = stmt.opt.get()
                    }
                }

                switch(stmt.val) {
                    case 'goto':
                        const label = this.label[val]
                        if (!label) {
                            throw `unknown label [${val}]`
                        }
                        this.code = label.block.code
                        this.pos = label.pos
                        break

                    case 'gosub':
                        const subLabel = this.label[val]
                        if (!subLabel) {
                            throw `unknown label [${val}]`
                        }
                        this.bstack.push(this.code)
                        this.rstack.push(this.pos)
                        this.code = subLabel.block.code
                        this.pos = subLabel.pos
                        break


                    case 'restore':
                        this.dataPos = 0
                        break

                    default:
                        if (Array.isArray(val)) {
                            cmd.apply(this, val)
                        } else {
                            cmd.call(this, val)
                        }
                }
                break

            case LET: 
                // assignment
                const varName = stmt.lval
                const rval = stmt.rval.get()
                this.assign(varName, rval)
                break

            case LET_EL:
                // set dim/map element
                this.assignElement(stmt.lval, stmt.ival, stmt.rval)
                break

            case DIM:
                // array definition
                const arrayName = stmt.lval
                const dimensions = stmt.rval
                this.assign(arrayName, new Dim(arrayName, dimensions))
                break

            case MAP:
                // map definition
                const mapName = stmt.lval
                this.assign(mapName, new Map(mapName))
                break

            case READ:
                console.log('!!!!')
                const opt = stmt.opt
                if (opt.list) {
                    for (let i = 0; i < opt.list.length; i++) {
                        this.read(opt.list[i].val)
                    }
                } else {
                    this.read(opt.val)
                }
                break

            case IF:
                // if - then - else
                const cond = stmt.cond.get()
                if (cond) {
                    this.next(stmt.lstmt)
                } else {
                    this.next(stmt.rstmt)
                }
                break

            case FOR:
                // for - to - step init
                this.assign(stmt.cvar, stmt.lval.get())
                break

            case NEXT:
                const cfor = stmt.forCommand
                let i = this.load(cfor.cvar)
                const step = cfor.step? cfor.step.get() : 1
                const to = cfor.rval.get()

                i += step
                this.assign(cfor.cvar, i)

                if (i <= to) {
                    this.pos = cfor.pos
                }
                break

            case RETURN:
                if (this.rstack.length === 0) {
                    // the end
                    this.pos = Number.MAX_SAFE_INTEGER
                } else {
                    this.code = this.bstack.pop()
                    this.pos = this.rstack.pop()
                }
                break

            case END:
                // the end of program
                this.pos = Number.MAX_SAFE_INTEGER
                break

            default:
                console.log('Unknown statement')
                console.log(stmt.toString())
                console.dir(stmt)
                break
        }
    }

    run(block, pos) {
        // execute all statements in the code sequence
        this.pos = pos? pos : 0
        this.code = block.code
        this.interrupted = false
        this.resume()
    }

    repl() {
        this.loop = true
        this.printWelcome()
    }

    interrupt() {
        this.interrupted = true
        this.resumeOnInput = false
        this.resumeOnTimeout = false
    }

    waitForInput() {
        this.interrupted = true
        this.resumeOnInput = true
    }

    stop() {
        if (!this.interrupted
                || this.resumeOnInput
                || this.resumeOnTimeout) {
            this.interrupt()
            this.command.print('interrupted...')
        }
    }

    source(from, to) {
        from = from || 0
        to = to || this.lines.length - 1

        let res = []
        for (let i = from; i <= to; i++) {
            const line = this.lines[i]
            if (line) res.push(line)
        }
        return res.join('\n')
        //return this.lines.filter(l => l).join('\n')
    }

    loadSource(src, silent) {
        this.clearScope()
        this.clearSource()

        let loaded = 0
        if (src) {
            const lines = src.split('\n').filter(l => l && !l.startsWith('#'))
            for (let i = 0; i < lines.length; i++) {
                if (this.placeLine(lines[i], false)) loaded ++
            }
        }
        if (!silent) this.command.print(`loaded ${loaded} lines`)
    }

    exec(cmd) {
        this.inputHandler(cmd)
    }

    clearScope() {
        const scope = {}
        Object.keys(this.constant).forEach(k => {
            const v = this.constant[k]
            scope[k] = v
        })
        this.scope = scope
        this.ram = []
    }

    clearSource() {
        this.lines = []
        this.lastLine = 0
    }

    printWelcome() {
        this.command.print(WELCOME)
        this.command.print(VERSION)
        this.command.print(READY)
    }
}

function vmFactory() {
    const vm = new VM()
    vm.Block = Block

    return vm
}

if (module) {
    module.exports = vmFactory
} else {
    this.jbas? this.jbas.vmFactory = vmFactory : this.jbas = {
        vmFactory
    }
}
