import Foundation

// Disable stdout buffering so every printJSON line is flushed immediately.
setbuf(stdout, nil)

let bridge = EventKitBridge()
let args = CommandLine.arguments

guard args.count >= 2 else {
    printJSON(ErrorResult(error: "Usage: UntaskHelper <command>"))
    exit(1)
}

let command = args[1]

// Wrap in a Task to support async commands, then use dispatchMain()
// to keep the run loop alive for the --watch command.
Task {
    switch command {
    case "--request-access":
        await runRequestAccess(bridge: bridge)
    case "--check-access":
        runCheckAccess(bridge: bridge)
    case "--ensure-list":
        runEnsureList(bridge: bridge)
    case "--create":
        runCreate(bridge: bridge)
    case "--update":
        runUpdate(bridge: bridge)
    case "--delete":
        runDelete(bridge: bridge)
    case "--complete":
        runComplete(bridge: bridge)
    case "--batch-create":
        runBatchCreate(bridge: bridge)
    case "--fetch-all":
        runFetchAll(bridge: bridge)
    case "--watch":
        // watchChanges blocks on RunLoop.main, so it never returns.
        // We call it on the main thread below via dispatchMain().
        break
    default:
        printJSON(ErrorResult(error: "Unknown command: \(command)"))
        exit(1)
    }

    // For --watch, start the watcher on the main thread.
    if command == "--watch" {
        DispatchQueue.main.async {
            runWatch(bridge: bridge)
        }
    } else {
        // All other commands exit after printing their result.
        exit(0)
    }
}

// Keep the process alive. Required for async Task execution and for --watch.
dispatchMain()
