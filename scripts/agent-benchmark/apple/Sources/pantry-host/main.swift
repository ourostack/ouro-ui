import AppIntents
import Foundation

// The host of the apple-app-intents arm (scripts/agent-benchmark/arms/apple.mjs): one JSON object per line on stdin,
// one JSON object per line on stdout.
//   {"list": true}                          -> {"intents": [action ids that have an App Intent]}
//   {"action": "<id>", "args": {...}}       -> {"result": {...}} | {"error": "..."} | {"refused": {...}}, plus "items":
//                                              the kitchen's items afterwards, so the runner checks the same state.
// An action runs by constructing its generated App Intent and calling perform() in process. It does not go through
// Siri or Shortcuts. A person-only action has no App Intent, so nothing here can run it: the host answers with the
// generated typed refusal (OuroActions.refusal(for:)).

let intentIds = [
    "get_shopping_list", "add_shopping_list_item", "set_shopping_list_item_checked", "search_recipes", "add_recipe_to_shopping_list",
]

func decode<Input: Decodable>(_ type: Input.Type, _ args: Any) throws -> Input {
    try JSONDecoder().decode(type, from: try JSONSerialization.data(withJSONObject: args))
}

@MainActor
func run(_ action: String, _ args: Any, _ pantry: Pantry) async throws {
    switch action {
    case "get_shopping_list": _ = try await GetShoppingListIntent(try decode(GetShoppingListInput.self, args)).perform()
    case "add_shopping_list_item": _ = try await AddShoppingListItemIntent(try decode(AddShoppingListItemInput.self, args)).perform()
    case "set_shopping_list_item_checked": _ = try await SetShoppingListItemCheckedIntent(try decode(SetShoppingListItemCheckedInput.self, args)).perform()
    case "search_recipes": _ = try await SearchRecipesIntent(try decode(SearchRecipesInput.self, args)).perform()
    case "add_recipe_to_shopping_list": _ = try await AddRecipeToShoppingListIntent(try decode(AddRecipeToShoppingListInput.self, args)).perform()
    default: throw PantryError(message: "No App Intent has the id \"\(action)\".")
    }
}

@MainActor
func handle(_ line: String, _ pantry: Pantry) async -> [String: Any] {
    guard let request = (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any] else {
        return ["error": "Each line must be a JSON object."]
    }
    if request["list"] != nil { return ["intents": intentIds] }
    guard let action = request["action"] as? String else { return ["error": "A request needs an action."] }
    var reply: [String: Any] = [:]
    if !intentIds.contains(action), let refusal = OuroActions.refusal(for: action) {
        reply["refused"] = [
            "code": refusal.code, "exit": refusal.exit, "thing": refusal.thing, "problem": refusal.problem,
            "message": refusal.message, "reason": refusal.reason, "how": refusal.how,
        ]
        return reply
    }
    pantry.last = nil
    do {
        try await run(action, request["args"] ?? [String: Any](), pantry)
        let data = pantry.last ?? Data("{}".utf8)
        reply["result"] = (try? JSONSerialization.jsonObject(with: data)) ?? [String: Any]()
    } catch let error as PantryError {
        reply["error"] = error.message
    } catch let error as DecodingError {
        reply["error"] = "The arguments do not fit the intent: \(error)"
    } catch {
        reply["error"] = "\(error)"
    }
    let items = (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(pantry.items))) ?? []
    reply["items"] = items
    return reply
}

let pantry = await MainActor.run { () -> Pantry in
    let pantry = Pantry()
    pantry.bind()
    return pantry
}
while let line = readLine() {
    if line.trimmingCharacters(in: .whitespaces).isEmpty { continue }
    let reply = await handle(line, pantry)
    let data = (try? JSONSerialization.data(withJSONObject: reply, options: [.withoutEscapingSlashes])) ?? Data("{\"error\":\"unencodable reply\"}".utf8)
    FileHandle.standardOutput.write(data + Data("\n".utf8))
}
