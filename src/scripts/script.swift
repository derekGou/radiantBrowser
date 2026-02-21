import Cocoa
import Carbon
import CoreGraphics
import Darwin
private func configureUnbufferedIO() {
    setbuf(stdout, nil)
    setbuf(stderr, nil)
}


var eventTap: CFMachPort?
let targetPid = pid_t(Int32(CommandLine.arguments.dropFirst().first ?? "") ?? 0)

private func eventTapCallback(
    _ proxy: CGEventTapProxy,
    _ type: CGEventType,
    _ event: CGEvent,
    _ refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    if targetPid != 0 {
        let frontmostPid = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
        if frontmostPid != targetPid {
            return Unmanaged.passUnretained(event)
        }
    }

    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let eventTap = eventTap {
            CGEvent.tapEnable(tap: eventTap, enable: true)
        }
        return Unmanaged.passUnretained(event)
    }

    if type == .keyDown {
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags
        let hasShift = flags.contains(.maskShift)
        let hasOtherModifiers = flags.contains(.maskCommand) || 
                               flags.contains(.maskAlternate) || 
                               flags.contains(.maskControl) || 
                               flags.contains(.maskAlphaShift)

        if keyCode == kVK_Escape {
            if hasShift && !hasOtherModifiers {
                print("Shift+Esc pressed")
                return Unmanaged.passUnretained(event)
            } else {
                print("ESC_PRESSED")
                return nil
            }
        }
    }

    return Unmanaged.passUnretained(event)
}

func startKeyListener() {
    print("Keytap starting")
    eventTap = CGEvent.tapCreate(
        tap: .cgSessionEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,
        eventsOfInterest: CGEventMask(
            (1 << CGEventType.keyDown.rawValue) |
            (1 << CGEventType.flagsChanged.rawValue)
        ),
        callback: eventTapCallback,
        userInfo: nil
    )

    guard let eventTap = eventTap else {
        print("Failed to create event tap.")
        exit(1)
    }

    let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
    CGEvent.tapEnable(tap: eventTap, enable: true)
    print("Keytap enabled")
}

private func installSignalHandlers() {
    signal(SIGTERM) { _ in
        CFRunLoopStop(CFRunLoopGetCurrent())
    }
    signal(SIGINT) { _ in
        CFRunLoopStop(CFRunLoopGetCurrent())
    }
}

configureUnbufferedIO()
installSignalHandlers()
startKeyListener()
CFRunLoopRun()