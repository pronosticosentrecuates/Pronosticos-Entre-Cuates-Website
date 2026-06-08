import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './style.css'

const rootElement = document.querySelector('#app')

if (!rootElement) {
  throw new Error('No se encontro el contenedor #app')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

