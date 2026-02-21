import React from 'react'
import ReactDOM from 'react-dom/client'
import Settings from './components/settings/settings'
import './index.css'

ReactDOM.createRoot(
  document.getElementById('root')!
).render(
  <React.StrictMode>
    <div className="flex flex-col w-full h-full bg-[#06070D]">
      <div className="flex-1 overflow-auto no-bar">
        <Settings />
      </div>
    </div>
  </React.StrictMode>
)
