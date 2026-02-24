import EventKit
import Foundation

final class EventKitBridge {
    private let store = EKEventStore()

    /// ISO 8601 formatter for date strings.
    private static let isoFormatter: ISO8601DateFormatter = {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fmt
    }()

    /// Fallback ISO 8601 formatter without fractional seconds.
    private static let isoFormatterNoFrac: ISO8601DateFormatter = {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime]
        return fmt
    }()

    /// Date-only formatter (yyyy-MM-dd).
    private static let dateOnlyFormatter: DateFormatter = {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.locale = Locale(identifier: "en_US_POSIX")
        return fmt
    }()

    /// Local ISO formatter without timezone (yyyy-MM-dd'T'HH:mm:ss).
    private static let localIsoFormatter: DateFormatter = {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        fmt.locale = Locale(identifier: "en_US_POSIX")
        return fmt
    }()

    /// Local ISO formatter without seconds (yyyy-MM-dd'T'HH:mm).
    private static let localIsoShortFormatter: DateFormatter = {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd'T'HH:mm"
        fmt.locale = Locale(identifier: "en_US_POSIX")
        return fmt
    }()

    // MARK: - Access

    /// Request full access to reminders. Uses the modern API on macOS 14+, falls back on older.
    func requestAccess() async throws -> Bool {
        if #available(macOS 14.0, *) {
            return try await store.requestFullAccessToReminders()
        } else {
            return try await store.requestAccess(to: .reminder)
        }
    }

    /// Check current authorization status without prompting.
    func checkAccess() -> String {
        let status = EKEventStore.authorizationStatus(for: .reminder)
        switch status {
        case .authorized, .fullAccess:
            return "authorized"
        case .denied, .restricted, .writeOnly:
            return "denied"
        case .notDetermined:
            return "not_determined"
        @unknown default:
            return "not_determined"
        }
    }

    // MARK: - Lists

    /// Find an existing reminder list by name, or create one if it doesn't exist.
    /// Returns the calendar identifier.
    func ensureList(name: String) throws -> String {
        // Search existing reminder calendars
        let calendars = store.calendars(for: .reminder)
        if let existing = calendars.first(where: { $0.title == name }) {
            return existing.calendarIdentifier
        }

        // Create a new reminder list
        let calendar = EKCalendar(for: .reminder, eventStore: store)
        calendar.title = name

        // Use the default reminder source, or fall back to any local source
        if let defaultSource = store.defaultCalendarForNewReminders()?.source {
            calendar.source = defaultSource
        } else if let localSource = store.sources.first(where: { $0.sourceType == .local }) {
            calendar.source = localSource
        } else if let anySource = store.sources.first {
            calendar.source = anySource
        } else {
            throw BridgeError.noSource
        }

        try store.saveCalendar(calendar, commit: true)
        return calendar.calendarIdentifier
    }

    // MARK: - Create

    /// Create a single reminder in the specified list.
    func createReminder(
        listId: String,
        title: String,
        notes: String?,
        dueDate: String?,
        priority: Int?
    ) throws -> (reminderId: String, externalId: String?) {
        guard let calendar = store.calendar(withIdentifier: listId) else {
            throw BridgeError.listNotFound(listId)
        }

        let reminder = EKReminder(eventStore: store)
        reminder.calendar = calendar
        reminder.title = title
        reminder.notes = notes

        if let priority = priority {
            reminder.priority = priority
        }

        if let dueDateString = dueDate {
            reminder.dueDateComponents = try parseDateComponents(dueDateString)
        }

        try store.save(reminder, commit: true)
        return (
            reminderId: reminder.calendarItemIdentifier,
            externalId: reminder.calendarItemExternalIdentifier
        )
    }

    // MARK: - Update

    /// Update an existing reminder. Only non-nil fields are changed.
    func updateReminder(
        reminderId: String,
        title: String?,
        notes: String?,
        dueDate: String?,
        priority: Int?,
        isCompleted: Bool?
    ) throws {
        guard let reminder = findReminder(byId: reminderId) else {
            throw BridgeError.reminderNotFound(reminderId)
        }

        if let title = title {
            reminder.title = title
        }
        if let notes = notes {
            reminder.notes = notes
        }
        if let priority = priority {
            reminder.priority = priority
        }
        if let isCompleted = isCompleted {
            reminder.isCompleted = isCompleted
            if isCompleted {
                reminder.completionDate = Date()
            } else {
                reminder.completionDate = nil
            }
        }
        if let dueDateString = dueDate {
            reminder.dueDateComponents = try parseDateComponents(dueDateString)
        }

        try store.save(reminder, commit: true)
    }

    // MARK: - Delete

    /// Delete a reminder permanently.
    func deleteReminder(reminderId: String) throws {
        guard let reminder = findReminder(byId: reminderId) else {
            throw BridgeError.reminderNotFound(reminderId)
        }
        try store.remove(reminder, commit: true)
    }

    // MARK: - Complete

    /// Mark a reminder as completed.
    func completeReminder(reminderId: String) throws {
        guard let reminder = findReminder(byId: reminderId) else {
            throw BridgeError.reminderNotFound(reminderId)
        }
        reminder.isCompleted = true
        reminder.completionDate = Date()
        try store.save(reminder, commit: true)
    }

    // MARK: - Fetch All

    /// Fetch all reminders in a given list. Uses a semaphore to bridge the callback API.
    func fetchAllReminders(listId: String) throws -> [FetchedReminder] {
        guard let calendar = store.calendar(withIdentifier: listId) else {
            throw BridgeError.listNotFound(listId)
        }

        let predicate = store.predicateForReminders(in: [calendar])
        let semaphore = DispatchSemaphore(value: 0)
        var result: [EKReminder]?

        store.fetchReminders(matching: predicate) { reminders in
            result = reminders
            semaphore.signal()
        }

        semaphore.wait()

        guard let reminders = result else {
            return []
        }

        return reminders.map { reminder in
            FetchedReminder(
                reminderId: reminder.calendarItemIdentifier,
                externalId: reminder.calendarItemExternalIdentifier,
                title: reminder.title ?? "",
                notes: reminder.notes,
                dueDate: formatDueDate(reminder.dueDateComponents),
                priority: reminder.priority,
                isCompleted: reminder.isCompleted,
                recurrenceRule: formatRecurrenceRule(reminder.recurrenceRules)
            )
        }
    }

    // MARK: - Batch Create

    /// Create multiple reminders in a single commit.
    func batchCreate(items: [CreateInput]) throws -> [CreateResult] {
        var results: [CreateResult] = []

        for item in items {
            guard let calendar = store.calendar(withIdentifier: item.listId) else {
                throw BridgeError.listNotFound(item.listId)
            }

            let reminder = EKReminder(eventStore: store)
            reminder.calendar = calendar
            reminder.title = item.title
            reminder.notes = item.notes

            if let priority = item.priority {
                reminder.priority = priority
            }

            if let dueDateString = item.dueDate {
                reminder.dueDateComponents = try parseDateComponents(dueDateString)
            }

            try store.save(reminder, commit: false)
            results.append(CreateResult(reminderId: reminder.calendarItemIdentifier))
        }

        try store.commit()
        return results
    }

    // MARK: - Watch

    /// Watch for EventKit store changes. This blocks on RunLoop.main and never returns.
    func watchChanges(onStoreChanged: @escaping () -> Void) {
        NotificationCenter.default.addObserver(
            forName: .EKEventStoreChanged,
            object: store,
            queue: .main
        ) { _ in
            onStoreChanged()
        }

        RunLoop.main.run()
    }

    // MARK: - Private helpers

    private func findReminder(byId identifier: String) -> EKReminder? {
        guard let item = store.calendarItem(withIdentifier: identifier) else {
            return nil
        }
        return item as? EKReminder
    }

    /// Parse an ISO 8601 date string into DateComponents.
    /// If the string is date-only (yyyy-MM-dd), sets the time to 09:00 local.
    private func parseDateComponents(_ dateString: String) throws -> DateComponents {
        let calendar = Calendar.current

        // Try full ISO 8601 with fractional seconds
        if let date = Self.isoFormatter.date(from: dateString) {
            return calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        }

        // Try ISO 8601 without fractional seconds
        if let date = Self.isoFormatterNoFrac.date(from: dateString) {
            return calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        }

        // Try local ISO format without timezone (yyyy-MM-dd'T'HH:mm:ss)
        if let date = Self.localIsoFormatter.date(from: dateString) {
            return calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        }

        // Try local ISO format without seconds (yyyy-MM-dd'T'HH:mm)
        if let date = Self.localIsoShortFormatter.date(from: dateString) {
            return calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        }

        // Try date-only format (yyyy-MM-dd) — default to 9:00 AM local
        if let date = Self.dateOnlyFormatter.date(from: dateString) {
            var components = calendar.dateComponents([.year, .month, .day], from: date)
            components.hour = 9
            components.minute = 0
            return components
        }

        throw BridgeError.invalidDate(dateString)
    }

    /// Format DateComponents back to an ISO 8601 string, or nil if components are insufficient.
    private func formatDueDate(_ components: DateComponents?) -> String? {
        guard let components = components else { return nil }
        guard let date = Calendar.current.date(from: components) else { return nil }
        return Self.isoFormatterNoFrac.string(from: date)
    }

    /// Convert EKRecurrenceRule to RRULE string (RFC 5545 format).
    private func formatRecurrenceRule(_ rules: [EKRecurrenceRule]?) -> String? {
        guard let rule = rules?.first else { return nil }

        var parts: [String] = []

        // FREQ is required
        let freq: String
        switch rule.frequency {
        case .daily: freq = "DAILY"
        case .weekly: freq = "WEEKLY"
        case .monthly: freq = "MONTHLY"
        case .yearly: freq = "YEARLY"
        @unknown default: return nil
        }
        parts.append("FREQ=\(freq)")

        // INTERVAL (default is 1, only include if > 1)
        if rule.interval > 1 {
            parts.append("INTERVAL=\(rule.interval)")
        }

        // BYDAY (days of week)
        if let daysOfTheWeek = rule.daysOfTheWeek, !daysOfTheWeek.isEmpty {
            let dayStrings = daysOfTheWeek.map { dayOfWeek -> String in
                let dayStr: String
                switch dayOfWeek.dayOfTheWeek {
                case .monday: dayStr = "MO"
                case .tuesday: dayStr = "TU"
                case .wednesday: dayStr = "WE"
                case .thursday: dayStr = "TH"
                case .friday: dayStr = "FR"
                case .saturday: dayStr = "SA"
                case .sunday: dayStr = "SU"
                @unknown default: dayStr = "??"
                }
                // Include week number if present (for "2nd Tuesday" type rules)
                let week = dayOfWeek.weekNumber
                if week != 0 {
                    return "\(week)\(dayStr)"
                }
                return dayStr
            }
            parts.append("BYDAY=\(dayStrings.joined(separator: ","))")
        }

        // COUNT or UNTIL (recurrence end)
        if let end = rule.recurrenceEnd {
            let count = end.occurrenceCount
            if count > 0 {
                parts.append("COUNT=\(count)")
            } else if let endDate = end.endDate {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime]
                parts.append("UNTIL=\(formatter.string(from: endDate))")
            }
        }

        return parts.joined(separator: ";")
    }
}

// MARK: - Errors

enum BridgeError: LocalizedError {
    case noSource
    case listNotFound(String)
    case reminderNotFound(String)
    case invalidDate(String)

    var errorDescription: String? {
        switch self {
        case .noSource:
            return "No calendar source available for creating reminder lists"
        case .listNotFound(let id):
            return "Reminder list not found: \(id)"
        case .reminderNotFound(let id):
            return "Reminder not found: \(id)"
        case .invalidDate(let str):
            return "Invalid date format: \(str). Expected ISO 8601 or yyyy-MM-dd"
        }
    }
}
