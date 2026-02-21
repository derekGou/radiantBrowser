#ifdef _WIN32
#include <windows.h>
#include <iostream>
#include <atomic>

// VK codes for modifiers
const int MOD_SHIFT = VK_SHIFT;
const int MOD_CTRL = VK_CONTROL;
const int MOD_ALT = VK_MENU;
const int MOD_WIN = VK_LWIN;

std::atomic<HWND> targetWindow(nullptr);
HHOOK hookHandle = nullptr;

bool isModifierPressed(int vk) {
    return (GetAsyncKeyState(vk) & 0x8000) != 0;
}

LRESULT CALLBACK KeyboardHookProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION && wParam == WM_KEYDOWN) {
        KBDLLHOOKSTRUCT* pKeyboard = reinterpret_cast<KBDLLHOOKSTRUCT*>(lParam);
        
        if (pKeyboard->vkCode == VK_ESCAPE) {
            bool hasShift = isModifierPressed(VK_SHIFT);
            bool hasCtrl = isModifierPressed(VK_CONTROL);
            bool hasAlt = isModifierPressed(VK_MENU);
            bool hasWin = isModifierPressed(VK_LWIN) || isModifierPressed(VK_RWIN);
            bool hasOtherModifiers = hasCtrl || hasAlt || hasWin;
            
            if (hasShift && !hasOtherModifiers) {
                std::cout << "Shift+Esc pressed" << std::endl;
                std::cout.flush();
                return 1; // Block and let Shift+Esc through
            } else {
                std::cout << "ESC_PRESSED" << std::endl;
                std::cout.flush();
                return 1; // Block plain Esc
            }
        }
    }
    
    return CallNextHookEx(hookHandle, nCode, wParam, lParam);
}

void SetupKeyboardHook() {
    hookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, KeyboardHookProc, nullptr, 0);
    
    if (hookHandle == nullptr) {
        std::cerr << "Failed to set keyboard hook" << std::endl;
        exit(1);
    }
    
    std::cout << "Keytap started" << std::endl;
    std::cout << "Keytap enabled" << std::endl;
    std::cout.flush();
}

void UnhookKeyboard() {
    if (hookHandle != nullptr) {
        UnhookWindowsHookEx(hookHandle);
        hookHandle = nullptr;
    }
}

int main() {
    // Disable output buffering
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    std::cout.sync_with_stdio(true);
    
    SetupKeyboardHook();
    
    // Message loop to keep the hook active
    MSG msg;
    while (GetMessage(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    
    UnhookKeyboard();
    return 0;
}

#else
#error "This program can only be compiled on Windows"
#endif
