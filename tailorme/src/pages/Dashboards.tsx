import { Link } from 'react-router-dom'
import { usePortal } from '../auth/portalContext'
import PortalLayout from '../components/portal/PortalLayout'
import { DashboardHeading, DashboardPanel, EmptyState } from '../components/portal/DashboardParts'
import AcceptedWork from '../components/portal/AcceptedWork'
import heroImage from '../assets/hero.png'
import './Dashboards.css'

export function CustomerDashboard() {
  const { profile } = usePortal()
  return <PortalLayout>
    <DashboardHeading eyebrow="Your personal atelier" title={`Hello, ${profile?.full_name || 'welcome'}`} description="A little inspiration. A perfect fit. Your bespoke journey starts here." />
    <div className="portal-customer-grid">
      <div className="space-y-10">
        <section className="portal-inspiration" style={{ backgroundImage: `linear-gradient(0deg, rgba(0,0,0,.85), rgba(0,0,0,.05)), url(${heroImage})` }} aria-label="Bespoke inspiration">
          <span className="portal-gold-tag">The art of bespoke</span><h2 className="font-display-lg text-headline-md mt-5">Made for your next chapter.</h2><p className="mt-3 max-w-md leading-relaxed">Thoughtful fabrics. Personal details. A wardrobe that feels entirely your own.</p><Link to="/customer/designer" className="inline-block mt-6 underline">Open Dress Designer</Link>
        </section>
        <section><div className="mb-6"><h2 className="font-display-lg text-headline-sm">Fabric Inspiration</h2><p className="text-label-sm uppercase tracking-widest mt-2 text-on-surface-variant">A future library of possibilities</p></div><div className="portal-fabric-grid">{['Cashmere', 'Linen', 'Wool'].map((fabric, index) => <div key={fabric}><div className={`portal-swatch portal-swatch-${index}`} aria-hidden="true" /><h3 className="mt-4 font-semibold">{fabric}</h3><p className="text-sm mt-1 text-on-surface-variant">Inspiration only · catalog coming soon</p></div>)}</div></section>
      </div>
      <DashboardPanel title="My Requests" className="portal-order-status"><p className="text-on-surface-variant">Track your requests, quotations, agreed designs, conversations and tailoring progress.</p><Link to="/customer/requests" className="portal-profile-link mt-6">View My Requests</Link><p className="mt-4 text-sm">Open a request to review its confirmed dates and direct payment records. Request acceptance, quotation acceptance and payment confirmation are separate.</p></DashboardPanel>
    </div>
    <section className="mt-16"><h2 className="font-display-lg text-headline-md">Discover Your Tailor</h2><p className="mt-2 text-on-surface-variant">Explore published shops, specialties, and portfolios from approved artisans.</p><div className="portal-card mt-8"><Link className="portal-profile-link" to="/tailors">Browse the Tailor Directory <span aria-hidden="true">↗</span></Link><p className="mt-4 text-sm text-on-surface-variant">Send an inquiry from a shop page, then follow it in My Requests.</p></div></section>
  </PortalLayout>
}

export function TailorDashboard() {
  const { profile } = usePortal()
  return <PortalLayout className="tailor-dashboard-page">
    <DashboardHeading eyebrow="Artisan panel / Overview" title={`Welcome back, ${profile?.full_name || 'artisan'}`} description="A quiet space to shape your craft and your next commission." />
    <AcceptedWork />
    <Link to="/tailor/profile" className="portal-profile-link mb-8">Manage Your Shop Profile & Portfolio <span aria-hidden="true">↗</span></Link>
    <p className="portal-data-note">Review quotations, conversations, design changes and direct payment reports inside each request. Dashboard revenue totals are not available.</p>
  </PortalLayout>
}

export function AdminDashboard() {
  const { profile } = usePortal()
  return <PortalLayout>
    <DashboardHeading eyebrow="Control center / Overview" title={`Welcome back, ${profile?.full_name || 'administrator'}`} description="A considered view of the TailorMe community." />
    <p className="portal-data-note">Platform-wide business totals are not available. Application review uses actual submitted applications; private request data remains restricted to its participants.</p>
    <div className="portal-two-thirds"><DashboardPanel title="Growth Overview"><EmptyState icon="bar_chart" title="Your next chapter, in numbers" description="Revenue and user growth reporting are not implemented. No analytics data is available." /></DashboardPanel><DashboardPanel title="Tailor Applications"><p className="text-on-surface-variant mb-6">Review business details, approve customers for tailor access, or return applications with a reason.</p><Link className="portal-profile-link" to="/admin/tailor-applications">Review Applications <span aria-hidden="true">↗</span></Link></DashboardPanel></div>
    <DashboardPanel title="User Management" className="mt-8"><EmptyState icon="manage_accounts" title="Management tools are coming later" description="This foundation does not list other users or offer role assignment actions. Tailor access is granted through application approval." /></DashboardPanel>
    <div className="portal-halves mt-8"><DashboardPanel title="System Health"><EmptyState icon="monitor_heart" title="Monitoring not connected" description="No live availability, response-time, or database-load data is being collected here." /></DashboardPanel><DashboardPanel title="Global Settings"><EmptyState icon="tune" title="Settings are not available yet" description="Marketplace controls and registration settings will be introduced in a later release." /></DashboardPanel></div>
  </PortalLayout>
}
