import React from 'react'
import ReactDOM from 'react-dom/client'
import NewTab from './components/newtab/newtab'
import Settings from './components/settings/settings'
import './index.css'

// Intercept console logs and send to main process
const consoleMethods = ['log', 'error', 'warn', 'info', 'debug'] as const

consoleMethods.forEach((method) => {
    const original = console[method]
    console[method] = (...args: any[]) => {
        // Call original console method first
        original.apply(console, args)
        
        // Convert arguments to serializable format
        const serialized = args.map((arg) => {
            if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
                return arg
            }
            try {
                return JSON.stringify(arg)
            } catch {
                return String(arg)
            }
        })

        // Send to main process if IPC is available
        try {
            if (window.electron?.ipc?.send) {
                window.electron.ipc.send('console:log', { method, args: serialized })
            }
        } catch (e) {
            original.apply(console, ['[Console interception error]', e])
        }
    }
})

function getPageFromLocation() {
    const url = new URL(window.location.href)
    const hashPage = url.hash.replace('#', '').trim()
    if (hashPage) return hashPage

    if (url.host) return url.host

    const path = url.pathname.replace('/', '').trim()
    return path || 'newtab'
}

const page = getPageFromLocation()
const Component = page === 'settings' ? Settings : NewTab

ReactDOM.createRoot(
  document.getElementById('root')!
).render(
  <React.StrictMode>
    <div className="flex flex-col w-full h-full bg-[#06070D]">
      <div className="flex-1 overflow-auto no-bar">
        <Component />
      </div>
    </div>
  </React.StrictMode>
)
