import React from 'react'
import ReactDOM from 'react-dom/client'
// HashRouter (URLs like /#/machinery) so deep links never 404 on GitHub Pages —
// same choice as MachTrek.
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './auth/AuthContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)
