import AppIntents
import Foundation

struct PantryError: Error { let message: String }

struct Item: Codable {
    var id: String
    var name: String
    var quantity: Double?
    var unit: String?
    var checked: Bool

    // Optionals encode as null, as the JavaScript store's items do.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(quantity, forKey: .quantity)
        try c.encode(unit, forKey: .unit)
        try c.encode(checked, forKey: .checked)
    }
}

struct Ingredient { let name: String; let quantity: Double; let unit: String? }
struct Recipe { let id: String; let title: String; let ingredients: [Ingredient] }

/// The kitchen of fixture/store.mjs's SEED, in memory, with its handlers bound to the generated actions.
@MainActor
final class Pantry {
    var items: [Item] = [
        Item(id: "i1", name: "eggs", quantity: 12, unit: nil, checked: false),
        Item(id: "i2", name: "spinach", quantity: 1, unit: "bag", checked: false),
        Item(id: "i3", name: "lemons", quantity: 3, unit: nil, checked: false),
        Item(id: "i4", name: "parmesan", quantity: 100, unit: "g", checked: false),
        Item(id: "i5", name: "olive oil", quantity: 1, unit: "bottle", checked: true),
    ]
    let recipes: [Recipe] = [
        Recipe(id: "r1", title: "Charred Lemon Orzo", ingredients: [
            Ingredient(name: "orzo", quantity: 250, unit: "g"), Ingredient(name: "lemons", quantity: 2, unit: nil),
            Ingredient(name: "garlic", quantity: 3, unit: "cloves"), Ingredient(name: "parmesan", quantity: 50, unit: "g"),
            Ingredient(name: "basil", quantity: 1, unit: "bunch"),
        ]),
        Recipe(id: "r2", title: "Charred Corn Salad", ingredients: [
            Ingredient(name: "corn", quantity: 4, unit: "ears"), Ingredient(name: "feta", quantity: 150, unit: "g"),
            Ingredient(name: "limes", quantity: 2, unit: nil),
        ]),
        Recipe(id: "r3", title: "Miso Mushroom Toast", ingredients: [
            Ingredient(name: "mushrooms", quantity: 300, unit: "g"), Ingredient(name: "white miso", quantity: 2, unit: "tbsp"),
            Ingredient(name: "sourdough", quantity: 1, unit: "loaf"),
        ]),
        Recipe(id: "r4", title: "Weeknight Chickpea Curry", ingredients: [
            Ingredient(name: "chickpeas", quantity: 2, unit: "cans"), Ingredient(name: "coconut milk", quantity: 1, unit: "can"),
            Ingredient(name: "spinach", quantity: 1, unit: "bag"),
        ]),
    ]
    var nextId = 6
    /// What the handler last returned, since an App Intent's own result carries only a dialog.
    var last: Data?

    private func addItem(name: String, quantity: Double?, unit: String?) throws -> Item {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { throw PantryError(message: "An item needs a name.") }
        if let quantity, !quantity.isFinite || quantity < 0 { throw PantryError(message: "Quantity must be a number of 0 or more.") }
        let cleanUnit = unit?.trimmingCharacters(in: .whitespacesAndNewlines)
        let item = Item(id: "i\(nextId)", name: trimmed, quantity: quantity, unit: (cleanUnit?.isEmpty ?? true) ? nil : cleanUnit, checked: false)
        nextId += 1
        items.append(item)
        return item
    }

    private func recipe(_ id: String) throws -> Recipe {
        guard let found = recipes.first(where: { $0.id == id }) else {
            throw PantryError(message: "No recipe has the id \"\(id)\". Search the recipes for the ids.")
        }
        return found
    }

    private func json<T: Encodable>(_ value: T) throws -> String {
        String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }

    private func finish<T: Encodable>(_ output: T) throws -> T {
        last = try JSONEncoder().encode(output)
        return output
    }

    func bind() {
        GetShoppingListAction.perform = { [self] _ in try finish(GetShoppingListOutput(items: try json(items))) }
        AddShoppingListItemAction.perform = { [self] input in
            let item = try addItem(name: input.name, quantity: input.quantity, unit: input.unit)
            return try finish(AddShoppingListItemOutput(id: item.id, name: item.name))
        }
        SetShoppingListItemCheckedAction.perform = { [self] input in
            guard let index = items.firstIndex(where: { $0.id == input.id }) else {
                throw PantryError(message: "No item has the id \"\(input.id)\". Read the list for the ids.")
            }
            items[index].checked = input.checked
            return try finish(SetShoppingListItemCheckedOutput())
        }
        SearchRecipesAction.perform = { [self] input in
            let words = input.query.lowercased().split(whereSeparator: { $0.isWhitespace }).map(String.init)
            let matches = recipes.filter { r in words.allSatisfy { r.title.lowercased().contains($0) } }
            let rows = matches.map { ["id": $0.id, "title": $0.title] }
            let data = try JSONSerialization.data(withJSONObject: rows, options: [.withoutEscapingSlashes])
            return try finish(SearchRecipesOutput(recipes: String(decoding: data, as: UTF8.self)))
        }
        AddRecipeToShoppingListAction.perform = { [self] input in
            let found = try recipe(input.recipeId)
            for i in found.ingredients { _ = try addItem(name: i.name, quantity: i.quantity, unit: i.unit) }
            return try finish(AddRecipeToShoppingListOutput(added: found.ingredients.count))
        }
    }
}
