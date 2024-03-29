#!/usr/bin/env node
"use strict"

//
// jam basic interpreter shell
//
const fs = require('fs')
const process = require('process')

const lexFromSource = require('./js/arch/lex.js')
const parse = require('./js/arch/parser.js')
const vmFactory = require('./js/arch/vm.js')

// universal libs
const core = require('./js/lib/core.js')
const func = require('./js/lib/func.js')
const math = require('./js/lib/math.js')
const str = require('./js/lib/str.js')

// system libs
const sys = require('./js/env/sys.js')
const io = require('./js/env/io.js')

// process args
const args = process.argv;

const opt = {}
const scripts = []

let cmd = 'repl'
let lastOption
for (let i = 2; i < args.length; i++) {
    let arg = args[i]

    if (arg === '--help' || arg === '-h'
            || arg === 'help' || arg === 'h') {
        cmd = 'help'
    } else if (arg === '--debug' || arg === '-d') {
        opt.debug = true
    } else {
        // expect script name
        if (arg.startsWith('-')) {
            throw new Error(`Unknown option [${arg}]`)
        }
        scripts.push(arg)
        cmd = 'run'
    }
}

function help() {
    console.log('Usage: rebasic [script]...')
    console.log('')
    console.log('Options:')
    console.log('    --debug or -d - show debug info like stack traces')
}

function setupVM() {
    const vm = vmFactory()
    vm.lexFromSource = lexFromSource
    vm.parse = parse
    vm.opt = opt

    for (let n in core) vm.defineCmd(n, core[n])
    for (let n in func) vm.defineFun(n, func[n])
    for (let n in io) vm.defineCmd(n, io[n])
    for (let n in sys) vm.defineCmd(n, sys[n])
    for (let n in math.fn) vm.defineFun(n, math.fn[n])
    for (let n in math.scope) vm.defineConst(n, math.scope[n])
    for (let n in str) vm.defineFun(n, str[n])

    // specific hooks to handle stdin/out
    vm.command.open() // open IO with io-specific procedure
    vm.command.input(vm.inputHandler)

    return vm
}

function setInterrupts(vm) {
    const interruptHanlder = function(sig) {
        vm.stop()
        if (vm.loop) vm.loop = false
        /*
        vm.command.print('...interrupted')
        if (!vm.interrupted) {
        } else {
        }
        */
        process.exit(1)
    }
    process.on('SIGINT', interruptHanlder)
    process.on('SIGTERM', interruptHanlder)
    process.on('SIGHUP', interruptHanlder)
    process.on('SIGBREAK', interruptHanlder)
}

function run() {
    const vm = setupVM()
    setInterrupts(vm)

    scripts.forEach(origin => {
        const src = fs.readFileSync(origin, 'utf8')

        // manually parse and run with vm
        //const lex = lexFromSource(src, vm.command.print)
        //const code = parse(vm, lex)
        //vm.run(code, 0)
        
        // load source silently and execute "run"
        vm.loadSource(src, true)
        vm.exitOnError = true
        vm.processCommand('run')
    })
}

function repl() {
    const vm = setupVM()
    setInterrupts(vm)
    vm.repl()
}


switch(cmd) {
    case 'run': run(); break;
    case 'repl': repl(); break;
    case 'help': help(); break;
}
