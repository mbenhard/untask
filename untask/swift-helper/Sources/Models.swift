import Foundation

// MARK: - Input types

struct EnsureListInput: Codable {
    let name: String
}

struct CreateInput: Codable {
    let listId: String
    let title: String
    let notes: String?
    let dueDate: String?
    let priority: Int?
}

struct UpdateInput: Codable {
    let reminderId: String
    let title: String?
    let notes: String?
    let dueDate: String?
    let priority: Int?
    let isCompleted: Bool?
}

struct DeleteInput: Codable {
    let reminderId: String
}

struct CompleteInput: Codable {
    let reminderId: String
}

typealias BatchCreateInput = [CreateInput]

struct FetchAllInput: Codable {
    let listId: String
}

// MARK: - Output types

struct AccessResult: Codable {
    let granted: Bool
}

struct AccessStatus: Codable {
    let status: String
}

struct ListResult: Codable {
    let listId: String
}

struct CreateResult: Codable {
    let reminderId: String
}

typealias BatchCreateResult = [CreateResult]

struct OkResult: Codable {
    let ok: Bool
}

struct FetchedReminder: Codable {
    let reminderId: String
    let externalId: String?
    let title: String
    let notes: String?
    let dueDate: String?
    let priority: Int
    let isCompleted: Bool
}

struct ErrorResult: Codable {
    let error: String
}

struct WatchEvent: Codable {
    let event: String
}
