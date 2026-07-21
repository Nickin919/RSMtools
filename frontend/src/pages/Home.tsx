import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const tools = [
  {
    title: 'Pricing contracts',
    description: 'Import WAGO quote PDFs, edit line items, and export CSV. Sign in only if you want to save.',
    to: '/contracts',
    requiresLogin: false,
    available: true,
  },
  {
    title: 'Product Finder',
    description: 'Search and browse the WAGO catalog.',
    to: '/product-finder',
    requiresLogin: false,
    available: true,
  },
  {
    title: '750 I/O Configurator',
    description: 'Build 750/751/753 I/O system BOMs. Works as a guest — browser autosave.',
    to: '/io-system-configurator',
    requiresLogin: false,
    available: true,
  },
  {
    title: 'Literature library',
    description: 'Browse literature and email kits (coming next).',
    to: '#',
    requiresLogin: false,
    available: false,
  },
]

export default function Home() {
  const { isGuest } = useAuth()

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">RSM Tools</h1>
        <p className="mt-1 text-sm text-gray-600">
          {isGuest
            ? 'You are browsing as a guest. Sign in to save pricing contracts. More tools coming soon.'
            : 'Your workspace for pricing contracts and field tools.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => {
          const inner = (
            <div
              className={`card h-full p-5 transition ${
                tool.available ? 'hover:border-wago-green cursor-pointer' : 'opacity-60'
              }`}
            >
              <h2 className="text-lg font-semibold text-gray-900">{tool.title}</h2>
              <p className="mt-1 text-sm text-gray-600">{tool.description}</p>
              {!tool.available && (
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-400">Coming soon</p>
              )}
              {tool.available && isGuest && tool.title === 'Pricing contracts' && (
                <p className="mt-3 text-xs text-amber-700">Works without login — sign in only to save</p>
              )}
            </div>
          )
          if (!tool.available) return <div key={tool.title}>{inner}</div>
          return (
            <Link key={tool.title} to={tool.to}>
              {inner}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
