// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "pantry-host",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "pantry-host", path: "Sources/pantry-host", swiftSettings: [.swiftLanguageMode(.v5)]),
    ]
)
