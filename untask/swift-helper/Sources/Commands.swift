import Foundation

// MARK: - Helpers

/// Read all of stdin and decode as JSON.
func readStdinJSON<T: Decodable>(_ type: T.Type) throws -> T {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    return try JSONDecoder().decode(type, from: data)
}

/// Encode a value as JSON and print to stdout.
func printJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [] // compact, single line
    let data = try! encoder.encode(value)
    print(String(data: data, encoding: .utf8)!)
}

// MARK: - Commands

func runRequestAccess(bridge: EventKitBridge) async {
    do {
        let granted = try await bridge.requestAccess()
        printJSON(AccessResult(granted: granted))
    } catch {
        printJSON(ErrorResult(error: error.localizedDescription))
    }
}

func runCheckAccess(bridge: EventKitBridge) {
    let status = bridge.checkAccess()
    printJSON(AccessStatus(status: status))
}

func runEnsureList(bridge: EventKitBridge) {
    do {
        let input = try readStdinJSON(EnsureListInput.self)
        let listId = try bridge.ensureList(name: input.name)
        printJSON(ListResult(listId: listId))
    } catch {
        printJSON(ErrorResult(error: error.localizedDescription))
    }
}

func runCreate(bridge: EventKitBridge) {
    do {
        let input = try readStdinJSON(CreateInput.self)
        let result = try bridge.createReminder(
            listId: input.listId,
            title: input.title,
            notes: input.notes,
            dueDate: input.dueDate,
            priority: input.priority
        )
        printJSON(CreateResult(reminderId: result.reminderId))
    } catch {
        printJSON(ErrorResult(error: error.localizedDescription))
    }
}

func runUpdate(bridge: EventKitBridge) {
    do {
        let input = try readStdinJSON(UpdateInput.self)
        try bridge.updateReminder(
            reminderId: input.reminderId,
            title: input.title,
            notes: input.notes,
            dueDate: input.dueDate,
            priority: input.priority,
            isCompleted: input.isCompleted
        )
        printJSON(OkResult(ok: true))
    } catch {
        printJSON(ErrorResult(error: error.localizedDescription))
    }
}

func runDelete(bridge: EventKitBridge) {
    do {
        let input = try readStdinJSON(DeleteInput.self)
        try bridge.deleteReminder(reminderId: input.reminderId)
        printJSON(OkResult(ok: true))
    } catch {
        printJSON(ErrorResult(error: error.localizedDescription))
    }
}

func runComplete(bridge: EventKitBridge) {
    do {
        let input = try readStdinJSON(CompleteInput.self)
        try bridge.completeReminder(reminderId: input.reminderId)
        printJSON(OkResult(ok: true))
    } catch {
        printJSON(ErrorResult(error: error.localizedDescription))
    }
}

func runBatchCreate(bridge: EventKitBridge) {
    do {
        let input = try readStdinJSON(BatchCreateInput.self)
        let results = try bridge.batchCreate(items: input)
        printJSON(results)
    } catch {
        printJSON(ErrorResult(error: error.localizedDescription))
    }
}

func runFetchAll(bridge: EventKitBridge) {
    do {
        let input = try readStdinJSON(FetchAllInput.self)
        let reminders = try bridge.fetchAllReminders(listId: input.listId)
        printJSON(reminders)
    } catch {
        printJSON(ErrorResult(error: error.localizedDescription))
    }
}

func runWatch(bridge: EventKitBridge) {
    bridge.watchChanges {
        printJSON(WatchEvent(event: "store_changed"))
        // Flush stdout so the Node.js parent receives the line immediately
        fflush(stdout)
    }
}
