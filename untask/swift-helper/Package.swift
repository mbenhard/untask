// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "UntaskHelper",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "UntaskHelper",
            path: "Sources",
            linkerSettings: [
                .linkedFramework("EventKit")
            ]
        )
    ]
)
