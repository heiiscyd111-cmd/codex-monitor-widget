# Codex Monitor

Codex Monitor exposes Codex usage and task activity as a desktop widget with core feature parity across supported operating systems and explicit release-specific limitations.

## Language

**Core feature parity**:
The same monitoring, status, quota, foreground-widget, and menu behavior on every supported operating system, excluding documented limitations of an unsigned build.
_Avoid_: Full platform parity, Identical implementation

**Windows portable release**:
The existing Windows x64 unpack-and-run release, which remains the compatibility baseline for behavior and distribution.
_Avoid_: Windows installer

**Internal macOS build**:
An unsigned macOS package intended for team use; manual trust approval is required, completion notifications are unavailable, and login startup is best-effort.
_Avoid_: Production macOS release, Fully equivalent macOS release

**macOS architecture build**:
One of the separately published Apple Silicon or Intel ZIP packages containing the macOS application.
_Avoid_: Universal build

**Supported macOS environment**:
A Mac running macOS 14 or later on Apple Silicon or Intel, with either the official Codex desktop application or a Homebrew Codex runtime installed.
_Avoid_: Legacy macOS environment

**Menu-bar widget**:
The macOS presentation of Codex Monitor, available through a conventional left-click menu and floating widget without a persistent Dock icon.
_Avoid_: Dock application

**Codex runtime**:
The CLI used to run the local Codex app server: prefer the official desktop application's bundled CLI, then fall back to a Homebrew-installed CLI at a known platform path.
_Avoid_: Shell-dependent PATH lookup

**CLI-only mode**:
A macOS installation with a Homebrew Codex runtime but no desktop application; quota and local task monitoring remain available, while desktop launch, foreground, and deep-link integration do not.
_Avoid_: Full desktop mode

**Cross-platform release**:
A single tagged release containing the unchanged Windows portable release and both macOS architecture builds.
_Avoid_: Platform-specific release
