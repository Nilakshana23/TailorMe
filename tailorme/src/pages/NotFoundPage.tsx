import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return <main className="min-h-screen flex flex-col items-center justify-center p-5 text-center">
    <Link to="/" className="font-display-lg text-headline-sm mb-12">TailorMe</Link>
    <p className="text-label-md text-secondary mb-4">404</p>
    <h1 className="font-display-lg text-display-lg mb-6">Page not found</h1>
    <p className="text-on-surface-variant mb-8">Let us return to your bespoke journey.</p>
    <Link to="/" className="bg-primary text-on-primary rounded-lg px-8 py-4 text-label-md">Back to home</Link>
  </main>
}
