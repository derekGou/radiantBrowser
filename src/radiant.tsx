import React from 'react'
import ReactDOM from 'react-dom/client'
import NewTab from './components/newtab/newtab'
import Settings from './components/settings/settings'
import './index.css'

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
