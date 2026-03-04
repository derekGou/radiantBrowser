import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
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

console.log('Console interception initialized')

ReactDOM.createRoot(
  document.getElementById('root')!
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
